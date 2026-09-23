"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRegistrationConfirmationEmail, sendEventUpdatedEmail } from "@/lib/eventRegistrationEmails";
import { cancelEventForHost } from "@/lib/cancelEvent";
import { trackServerEvent } from "@/lib/mixpanel/server";
import { assignPhotoForEntity, triggerDownloadPing } from "@/lib/unsplash";
import {
  createEventSchema,
  updateEventSchema,
  updateEventTicketsAndFormSchema,
  type CreateEventInput,
  type UpdateEventInput,
  type UpdateEventTicketsAndFormInput,
  type EventRegistrationInput,
} from "@/lib/validation/event";
import {
  getEventFormFields,
  getHostableCommunities,
  getEventTicketTypes,
} from "@/lib/queries/events";
import { getRegistrationAddonTotalPaise } from "@/lib/eventAddonBilling";
import { registerForEventCore } from "@/lib/eventRegistrationCore";
import { deserializeDescriptionContent } from "@/lib/validation/richText";
import { createRazorpayOrder, verifyRazorpaySignature, getRazorpayPaymentFee } from "@/lib/razorpay";
import { isEventPast } from "@/lib/eventStatus";

type DateEntryInput = {
  event_date: string;
  event_time?: string;
  event_end_time?: string;
  venue?: string;
  venue_lat?: number;
  venue_lng?: number;
  venue_place_id?: string;
};

// A multi-day event's flat event_date/event_end_date/event_time/
// event_end_time columns are derived from its event_dates entries (min/max
// date, first/last entry's time) rather than collected directly -- every
// existing consumer of those flat columns (list sort/filter, isEventPast,
// Google Calendar link) keeps working unchanged this way. Sorted by date so
// a host who added entries out of chronological order still gets a correct
// summary; the event_date_entries rows themselves preserve the host's
// original input order (see buildDateEntryRows) since that's the order
// they're meant to be displayed in, which need not be chronological.
function deriveDateFields(data: { event_date?: string; event_time?: string; event_end_time?: string; event_dates: DateEntryInput[] }) {
  if (data.event_dates.length === 0) {
    return {
      event_date: data.event_date as string,
      event_end_date: null as string | null,
      event_time: data.event_time || null,
      event_end_time: data.event_end_time || null,
    };
  }
  const sorted = [...data.event_dates].sort((a, b) => a.event_date.localeCompare(b.event_date));
  return {
    event_date: sorted[0].event_date,
    event_end_date: sorted[sorted.length - 1].event_date,
    event_time: sorted[0].event_time || null,
    event_end_time: sorted[sorted.length - 1].event_end_time || null,
  };
}

function buildDateEntryRows(eventId: string, entries: DateEntryInput[]) {
  return entries.map((d, i) => ({
    event_id: eventId,
    event_date: d.event_date,
    event_time: d.event_time || null,
    event_end_time: d.event_end_time || null,
    venue: d.venue?.trim() || null,
    venue_lat: d.venue_lat ?? null,
    venue_lng: d.venue_lng ?? null,
    venue_place_id: d.venue_place_id ?? null,
    sort_order: i,
  }));
}

export async function createEvent(
  input: Omit<CreateEventInput, "description_content"> & { description_content: string | null },
) {
  const user = await requireUser();

  // Never trust client-side validation alone (SPEC.md Section 11).
  // description_content arrives as a JSON string, not the parsed object --
  // see serializeDescriptionContent's comment (Server Actions silently
  // corrupt a large nested object graph crossing this exact boundary).
  const parsed = createEventSchema.safeParse({
    ...input,
    description_content: deserializeDescriptionContent(input.description_content),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  if (data.community_id) {
    const hostable = await getHostableCommunities(supabase, user.id);
    if (!hostable.some((c) => c.id === data.community_id)) {
      return { error: "You can only attach events to communities you own or moderate" };
    }
  }

  // data.id is generated client-side by NewEventForm -- same reasoning as
  // createCommunity's id field (see its comment): lets the rich editor
  // upload inline description images against this id before the row
  // exists (0053).
  const id = data.id;
  const photo = assignPhotoForEntity(data.category, id);
  const dateFields = deriveDateFields(data);

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      id,
      host_id: user.id,
      community_id: data.community_id ?? null,
      event_name: data.event_name,
      description: data.description || null,
      description_content: data.description_content ?? null,
      event_date: dateFields.event_date,
      event_end_date: dateFields.event_end_date,
      event_time: dateFields.event_time,
      event_end_time: dateFields.event_end_time,
      event_mode: data.event_mode,
      venue: data.event_mode === "online" ? null : data.venue || null,
      venue_lat: data.event_mode === "online" ? null : data.venue_lat ?? null,
      venue_lng: data.event_mode === "online" ? null : data.venue_lng ?? null,
      venue_place_id: data.event_mode === "online" ? null : data.venue_place_id ?? null,
      city: data.all_cities ? null : data.city || null,
      extra_cities: data.all_cities ? [] : data.extra_cities,
      all_cities: data.all_cities,
      category: data.category,
      extra_categories: data.extra_categories,
      unsplash_image_url: photo.imageUrl,
      unsplash_photo_id: photo.photoId,
      min_age: data.min_age ?? null,
      max_age: data.max_age ?? null,
      gender_restriction: data.gender_restriction ?? null,
      audience_enforcement: data.audience_enforcement,
    })
    .select()
    .single();

  if (!error) triggerDownloadPing(photo.photoId);

  if (error || !event) {
    return { error: error?.message ?? "Could not create event" };
  }

  const { error: ticketsError } = await supabase.from("event_ticket_types").insert(
    data.ticket_types.map((t, i) => ({
      event_id: event.id,
      name: t.name,
      price: t.price,
      quantity_available: t.quantity_available ?? null,
      sort_order: i,
    })),
  );
  if (ticketsError) {
    return { error: `Event created, but ticket types failed to save: ${ticketsError.message}` };
  }

  if (data.event_dates.length > 0) {
    const { error: datesError } = await supabase
      .from("event_date_entries")
      .insert(buildDateEntryRows(event.id, data.event_dates));
    if (datesError) {
      return { error: `Event created, but the date list failed to save: ${datesError.message}` };
    }
  }

  if (data.form_fields.length > 0) {
    const { error: fieldsError } = await supabase.from("form_fields").insert(
      data.form_fields.map((f, i) => ({
        owner_type: "event" as const,
        owner_id: event.id,
        label: f.label,
        field_type: f.field_type,
        options: f.field_type === "select" ? f.options : null,
        is_required: f.is_required,
        sort_order: i,
      })),
    );
    if (fieldsError) {
      return { error: `Event created, but the registration form failed to save: ${fieldsError.message}` };
    }
  }

  if (data.event_mode === "online" && data.meeting_link) {
    const { error: linkError } = await supabase
      .from("event_meeting_links")
      .upsert({ event_id: event.id, meeting_link: data.meeting_link, updated_at: new Date().toISOString() });
    if (linkError) {
      return { error: `Event created, but the meeting link failed to save: ${linkError.message}` };
    }
  }

  trackServerEvent("event_created", user.id, { event_id: event.id, category: data.category, has_community: !!data.community_id });

  // No redirect() here -- same reasoning as createCommunity: the caller
  // (NewEventForm) still has staged cover/gallery images in memory that
  // need this id to upload against, and only navigates once that's done.
  return { error: null, eventId: event.id };
}

/** Thin web wrapper -- validation/pricing/insert logic lives in
 * registerForEventCore so the mobile API route
 * (app/api/mobile/events/[id]/register) can call the exact same code with
 * a bearer-token client instead of this cookie-based one. Registration
 * requires a real account (SPEC.md's earlier guest-friendly decision is
 * reversed) -- redirects to sign-in rather than erroring, same as every
 * other requireUser() call site, though the UI already gates this form
 * behind isLoggedIn so this mainly guards direct action calls. */
export async function registerForEvent(eventId: string, input: EventRegistrationInput) {
  const user = await requireUser();
  const supabase = await createClient();
  const result = await registerForEventCore(supabase, user.id, user.email, eventId, input);
  if (!result.error) revalidatePath(`/events/${eventId}`);
  return result;
}

/** Standard Checkout, step 1: creates the Razorpay order this registration
 * will pay against. Amount is always recomputed here from the
 * registration's own stored ticket_type_id/quantity -- never trusted from
 * the client -- so a tampered request can't pay less than the real price.
 * razorpay_order_id is stored immediately so verifyRazorpayPayment (below)
 * has something to confirm the eventual signature against, rather than
 * trusting whatever order_id the client hands back after checkout. */
export async function createRazorpayOrderForRegistration(eventId: string, registrationId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: reg, error: fetchError } = await supabase
    .from("form_responses")
    .select("respondent_id, payment_status, quantity, ticket_type_id, last_order_attempt_at")
    .eq("id", registrationId)
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .single();
  if (fetchError || !reg) return { error: "Registration not found" };
  if (reg.respondent_id !== user.id) return { error: "Not allowed to pay for this registration" };
  if (reg.payment_status !== "unpaid") return { error: "This registration isn't awaiting payment" };

  // Checked (and set below) BEFORE calling Razorpay's API, not after -- this
  // actually prevents a tight retry loop from hitting Razorpay's own API
  // repeatedly, not just from writing to our own DB repeatedly.
  if (reg.last_order_attempt_at && Date.now() - new Date(reg.last_order_attempt_at).getTime() < 3000) {
    return { error: "Please wait a moment before trying again" };
  }

  const ticketTypes = await getEventTicketTypes(supabase, eventId);
  const ticketType = ticketTypes.find((t) => t.id === reg.ticket_type_id);
  if (!ticketType) return { error: "That ticket type no longer exists" };

  // Ticket price plus this registration's own snapshotted add-on total
  // (form_response_addons, frozen by registerForEvent at booking time) --
  // the same two components verifyRazorpayPayment and the payment.captured
  // webhook both recompute the exact same way, so what Razorpay is asked
  // to charge here can never disagree with what gets recorded as paid.
  const addonTotalPaise = await getRegistrationAddonTotalPaise(supabase, registrationId);
  const amountPaise = Math.round(ticketType.price * reg.quantity * 100) + addonTotalPaise;
  if (amountPaise <= 0) return { error: "This ticket doesn't require payment" };
  if (amountPaise < 100) return { error: "This amount is below Razorpay's minimum payable amount" };

  const { error: throttleError } = await supabase
    .from("form_responses")
    .update({ last_order_attempt_at: new Date().toISOString() })
    .eq("id", registrationId);
  if (throttleError) return { error: throttleError.message };

  let order;
  try {
    order = await createRazorpayOrder({ amountPaise, currency: "INR", receipt: registrationId });
  } catch (e) {
    console.error("Razorpay order creation failed:", e);
    return { error: "Could not start payment -- please try again" };
  }

  const { error: updateError } = await supabase
    .from("form_responses")
    .update({ razorpay_order_id: order.id })
    .eq("id", registrationId);
  if (updateError) return { error: updateError.message };

  return {
    error: null,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}

/** Standard Checkout, step 2: verifies the signature Razorpay's modal
 * handed back on success. The order_id match against what step 1 stored is
 * what stops a signature computed for a *different* (e.g. cheaper, or
 * someone else's) order from being replayed here -- HMAC validity alone
 * only proves the triple is internally consistent, not that it belongs to
 * THIS registration. Signature mismatch never marks the registration paid,
 * full stop -- returns an error and leaves payment_status untouched. */
export async function verifyRazorpayPayment(
  eventId: string,
  registrationId: string,
  payload: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string },
) {
  const user = await requireUser();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return { error: "Missing payment details" };
  }

  const supabase = await createClient();

  const { data: reg, error: fetchError } = await supabase
    .from("form_responses")
    .select("respondent_id, payment_status, razorpay_order_id, response_data, ticket_type_id, quantity")
    .eq("id", registrationId)
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .single();
  if (fetchError || !reg) return { error: "Registration not found" };
  if (reg.respondent_id !== user.id) return { error: "Not allowed to update this registration" };
  // Already paid -- most likely the webhook (/api/webhooks/razorpay, a
  // separate server-to-server delivery) won the race against this
  // client-driven callback and marked it paid first. That's a real bug we
  // hit: the payment this call is reporting genuinely succeeded, so this
  // must resolve as success too, not "isn't awaiting payment" -- the
  // registrant just paid and is looking at an error on their own screen.
  if (reg.payment_status === "paid") return { error: null };
  if (reg.payment_status !== "unpaid") return { error: "This registration isn't awaiting payment" };
  if (reg.razorpay_order_id !== razorpay_order_id) return { error: "Order mismatch -- please try again" };

  let valid: boolean;
  try {
    valid = await verifyRazorpaySignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });
  } catch (e) {
    console.error("Razorpay signature verification failed:", e);
    return { error: "Could not verify payment -- please try again" };
  }
  if (!valid) return { error: "Payment verification failed" };

  // Service-role, not the caller's own RLS-scoped client: RLS is a
  // declarative SQL condition, and there's no way to express "only allow
  // this write if the HMAC signature checked out" as one -- the check
  // above IS that authorization, already done in application code, so this
  // one write intentionally bypasses RLS rather than needing (and forever
  // trusting) a broad "respondent can mark their own registration paid"
  // policy that any client call could otherwise invoke unchecked.
  // .eq("payment_status", "unpaid") makes this write atomic: if a
  // concurrent call (e.g. a flaky-network retry, or a race against the
  // webhook) already flipped this row to 'paid' between the read above and
  // this write, that "unpaid" condition no longer matches and .select()
  // returns zero rows -- caught below to skip sending a second confirmation
  // email/notification for the same payment.
  // Recomputed the exact same way createRazorpayOrderForRegistration priced
  // this order in the first place -- not re-read from Razorpay's own
  // response, so it's guaranteed to be the amount our own signature check
  // just verified was actually charged for.
  const ticketTypes = await getEventTicketTypes(supabase, eventId);
  const ticketType = ticketTypes.find((t) => t.id === reg.ticket_type_id);
  const addonTotalPaise = await getRegistrationAddonTotalPaise(supabase, registrationId);
  const amountPaidPaise = ticketType ? Math.round(ticketType.price * reg.quantity * 100) + addonTotalPaise : null;

  // Best-effort -- the organizer settlement calculation deducts the real
  // gateway fee if it's here, and just treats it as 0 if this lookup
  // failed. Payment confirmation itself must never be blocked by it.
  let gatewayFeePaise: number | null = null;
  try {
    gatewayFeePaise = (await getRazorpayPaymentFee(razorpay_payment_id)).feePaise;
  } catch (e) {
    console.error("Failed to fetch Razorpay payment fee:", e);
  }

  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin
    .from("form_responses")
    .update({ payment_status: "paid", razorpay_payment_id, amount_paid_paise: amountPaidPaise, gateway_fee_paise: gatewayFeePaise })
    .eq("id", registrationId)
    .eq("payment_status", "unpaid")
    .select("id");
  if (updateError) return { error: updateError.message };
  if (!updated || updated.length === 0) return { error: null };

  // Same "you're registered" email/notification the free-ticket path sends
  // at registration time (registerForEvent above) -- a Razorpay-verified
  // signature is this path's equivalent confirmation moment, just arriving
  // after checkout instead of immediately.
  const responseData = reg.response_data as unknown as { name?: string; email?: string } | null;
  if (responseData?.email) {
    try {
      await sendRegistrationConfirmationEmail(supabase, {
        email: responseData.email,
        eventId,
        registrantName: responseData.name ?? "there",
      });
    } catch (e) {
      console.error("Failed to send post-payment confirmation email:", e);
    }
  }
  await supabase.from("notifications").insert({
    user_id: user.id,
    type: "event_registered",
    title: "You're registered!",
    body: "Payment confirmed",
    link: `/events/${eventId}`,
  });

  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

// Partial check-in: `count` is how many of THIS registration's `quantity`
// people have actually arrived, not a binary in/out. checked_in_at is kept
// as "first checked in at" (set once, on the 0->1 transition, preserved
// across later increments) -- every existing reader of checked_in_at
// (feedback eligibility, no-show/funnel stats) keeps meaning "checked in
// at all" without needing to know about quantity.
export async function setCheckInCount(eventId: string, responseId: string, count: number) {
  await requireUser();
  const supabase = await createClient();

  // RLS (form_responses_update_owner) is the real gate on the update below
  // -- a non-host caller's select here already comes back empty for the
  // same reason, so this fetch can't leak another host's registrant data.
  const { data: existing, error: fetchError } = await supabase
    .from("form_responses")
    .select("checked_in_at, quantity")
    .eq("id", responseId)
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .single();
  if (fetchError || !existing) return { error: "Not allowed to check in this registrant" };
  if (count < 0 || count > existing.quantity) return { error: "Invalid check-in count" };

  const { data, error } = await supabase
    .from("form_responses")
    .update({
      checked_in_count: count,
      checked_in_at: count > 0 ? existing.checked_in_at ?? new Date().toISOString() : null,
    })
    .eq("id", responseId)
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .select();

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not allowed to check in this registrant" };

  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath("/host/dashboard");
  return { error: null };
}

/** auth.uid() = host_id, or admin -- shared by updateEvent/duplicateEvent
 * per the spec's explicit "(or admin)" carve-out (community editing didn't
 * have this carve-out, hence the different shape from updateCommunity). */
async function requireEventHostOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, userId: string) {
  const { data: event, error } = await supabase.from("events").select("host_id").eq("id", eventId).single();
  if (error || !event) return { ok: false as const, error: "Event not found" };

  if (event.host_id === userId) return { ok: true as const };

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", userId).single();
  if (profile?.is_admin) return { ok: true as const };

  return { ok: false as const, error: "Only the host can do this" };
}

export async function updateEvent(
  eventId: string,
  input: Omit<UpdateEventInput, "description_content"> & { description_content: string | null },
) {
  const user = await requireUser();

  // description_content arrives as a JSON string, not the parsed object --
  // see serializeDescriptionContent's comment (Server Actions silently
  // corrupt a large nested object graph crossing this exact boundary).
  const parsed = updateEventSchema.safeParse({
    ...input,
    description_content: deserializeDescriptionContent(input.description_content),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  const auth = await requireEventHostOrAdmin(supabase, eventId, user.id);
  if (!auth.ok) return { error: auth.error };

  // A published event that's already happened is frozen -- no detail
  // change (date, venue, description, ticket info) makes sense for
  // something people already attended, and it keeps the Broadcast circle's
  // one-time "new event" post (0076) from ever describing a stale listing.
  // Drafts (event_date still null) are unaffected -- isEventPast returns
  // false for those.
  const { data: currentEvent } = await supabase.from("events").select("event_date, event_end_date").eq("id", eventId).single();
  if (currentEvent && isEventPast(currentEvent)) return { error: "This event has already happened and can no longer be edited." };

  const dateFields = deriveDateFields(data);

  // Explicit column list, not a spread of `data` -- host_id/community_id/
  // status can never be written through this action no matter what the
  // schema looks like later (same reasoning as updateCommunity).
  const { error } = await supabase
    .from("events")
    .update({
      event_name: data.event_name,
      description: data.description || null,
      description_content: data.description_content ?? null,
      event_date: dateFields.event_date,
      event_end_date: dateFields.event_end_date,
      event_time: dateFields.event_time,
      event_end_time: dateFields.event_end_time,
      event_mode: data.event_mode,
      venue: data.event_mode === "online" ? null : data.venue || null,
      venue_lat: data.event_mode === "online" ? null : data.venue_lat ?? null,
      venue_lng: data.event_mode === "online" ? null : data.venue_lng ?? null,
      venue_place_id: data.event_mode === "online" ? null : data.venue_place_id ?? null,
      city: data.all_cities ? null : data.city || null,
      extra_cities: data.all_cities ? [] : data.extra_cities,
      all_cities: data.all_cities,
      category: data.category,
      extra_categories: data.extra_categories,
      min_age: data.min_age ?? null,
      max_age: data.max_age ?? null,
      gender_restriction: data.gender_restriction ?? null,
      audience_enforcement: data.audience_enforcement,
    })
    .eq("id", eventId);

  if (error) return { error: error.message };

  // Replace-all, same pattern as updateEventTicketsAndForm's ticket-types
  // rewrite below -- simpler than diffing rows, and cheap since an event
  // has at most a handful of dates.
  const { error: deleteDatesError } = await supabase.from("event_date_entries").delete().eq("event_id", eventId);
  if (deleteDatesError) return { error: `Event saved, but the date list failed to update: ${deleteDatesError.message}` };
  if (data.event_dates.length > 0) {
    const { error: insertDatesError } = await supabase
      .from("event_date_entries")
      .insert(buildDateEntryRows(eventId, data.event_dates));
    if (insertDatesError) return { error: `Event saved, but the date list failed to update: ${insertDatesError.message}` };
  }

  // Same table either way -- upsert covers both "never had a link" and
  // "updating an existing one." Switching to offline leaves a stale link
  // row behind rather than deleting it (harmless -- the event detail page
  // and confirmation emails only ever look it up when event_mode is
  // currently 'online', so a leftover row for a now-offline event is just
  // unused data, never surfaced anywhere) -- simpler than a delete path no
  // UI actually needs today.
  if (data.event_mode === "online" && data.meeting_link) {
    const { error: linkError } = await supabase
      .from("event_meeting_links")
      .upsert({ event_id: eventId, meeting_link: data.meeting_link, updated_at: new Date().toISOString() });
    if (linkError) return { error: `Event saved, but the meeting link failed to save: ${linkError.message}` };
  }

  // Every existing registrant (deduped -- "register again" can leave more
  // than one row for the same person) hears about this, not the host
  // themselves and not the wider community/followers -- those audiences
  // weren't promised anything yet and don't need an update notification
  // for it. Notification insert goes through the admin client, not this
  // request's own RLS-scoped one -- notifications_insert_self (0061) only
  // permits `user_id = auth.uid()`, and this is the host writing into each
  // registrant's own notifications, someone else's row. Awaited, not
  // fire-and-forget, same Cloudflare Workers reasoning as every other email
  // send in this file.
  const { data: registrants } = await supabase
    .from("form_responses")
    .select("respondent_id, response_data")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .neq("respondent_id", user.id);
  const admin = createAdminClient();
  const seen = new Set<string>();
  for (const r of registrants ?? []) {
    if (seen.has(r.respondent_id)) continue;
    seen.add(r.respondent_id);
    const responseData = r.response_data as unknown as { name?: string; email?: string } | null;
    await admin.from("notifications").insert({
      user_id: r.respondent_id,
      type: "event_updated",
      title: "Event updated",
      body: data.event_name,
      link: `/events/${eventId}`,
    });
    if (responseData?.email) {
      try {
        await sendEventUpdatedEmail(supabase, {
          email: responseData.email,
          eventId,
          registrantName: responseData.name ?? "there",
        });
      } catch (e) {
        console.error("Failed to send event-updated email:", e);
      }
    }
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function updateEventTicketsAndForm(eventId: string, input: UpdateEventTicketsAndFormInput) {
  const user = await requireUser();

  const parsed = updateEventTicketsAndFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  const auth = await requireEventHostOrAdmin(supabase, eventId, user.id);
  if (!auth.ok) return { error: auth.error };

  // Same "already happened -> frozen" rule as updateEvent above.
  const { data: currentEvent } = await supabase.from("events").select("event_date, event_end_date").eq("id", eventId).single();
  if (currentEvent && isEventPast(currentEvent)) return { error: "This event has already happened and can no longer be edited." };

  // Re-checked here, not just left to the UI hiding the editor -- changing
  // ticket types/questions out from under people who already registered
  // (e.g. a paid ticket's price or a required question they already
  // answered) is exactly the risk updateEventSchema's own comment flags.
  // A fresh duplicate always has zero registrations, so this only ever
  // opens up for events nobody has registered for yet.
  const { count, error: countError } = await supabase
    .from("form_responses")
    .select("*", { count: "exact", head: true })
    .eq("owner_type", "event")
    .eq("owner_id", eventId);
  if (countError) return { error: countError.message };
  if (count && count > 0) {
    return { error: "Ticket types and registration questions can't be changed once someone has registered" };
  }

  // Replace-all, matching duplicateEvent's copy style -- simpler and safer
  // than diffing individual rows, and safe here specifically because the
  // zero-registrations check above guarantees nothing references the old
  // ticket_type_id rows yet.
  const { error: deleteTicketsError } = await supabase.from("event_ticket_types").delete().eq("event_id", eventId);
  if (deleteTicketsError) return { error: deleteTicketsError.message };
  const { error: ticketsError } = await supabase.from("event_ticket_types").insert(
    data.ticket_types.map((t, i) => ({
      event_id: eventId,
      name: t.name,
      price: t.price,
      quantity_available: t.quantity_available ?? null,
      sort_order: i,
    })),
  );
  if (ticketsError) return { error: ticketsError.message };

  const { error: deleteFieldsError } = await supabase
    .from("form_fields")
    .delete()
    .eq("owner_type", "event")
    .eq("owner_id", eventId);
  if (deleteFieldsError) return { error: deleteFieldsError.message };
  if (data.form_fields.length > 0) {
    const { error: fieldsError } = await supabase.from("form_fields").insert(
      data.form_fields.map((f, i) => ({
        owner_type: "event" as const,
        owner_id: eventId,
        label: f.label,
        field_type: f.field_type,
        options: f.field_type === "select" ? f.options : null,
        is_required: f.is_required,
        sort_order: i,
      })),
    );
    if (fieldsError) return { error: fieldsError.message };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/edit`);
  return { error: null };
}

export async function cancelEvent(eventId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  // RLS (events_update_host_or_admin) is the real gate -- a non-host
  // caller's update simply matches zero rows rather than erroring, same
  // pattern as setCheckInCount above. Registrations (form_responses) are
  // untouched by design -- people who already registered should still see
  // they signed up for something that got cancelled, not have that record
  // silently disappear. Registrant notification (audit found this
  // previously sent none at all -- /cancellation-refund Section 3 promises
  // it) lives in cancelEventForHost, shared with the mobile route.
  const { error } = await cancelEventForHost(supabase, eventId, user.id);
  if (error) return { error };

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath("/host/dashboard");
  return { error: null };
}

// Scoped to drafts only (event_date is null) -- a real, published event
// with actual registrants should be cancelled (cancelEvent), not deleted
// outright. form_fields/form_responses are polymorphic (owner_type/
// owner_id), not FK'd to events, so nothing cascades when the event row
// goes -- deleted explicitly here first. event_ticket_types does cascade
// (0001_init.sql), so no manual cleanup needed for those.
export async function deleteDraftEvent(eventId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const auth = await requireEventHostOrAdmin(supabase, eventId, user.id);
  if (!auth.ok) return { error: auth.error };

  const { data: event } = await supabase.from("events").select("event_date").eq("id", eventId).single();
  if (!event) return { error: "Event not found" };
  if (event.event_date !== null) return { error: "Only drafts can be deleted this way" };

  await supabase.from("form_responses").delete().eq("owner_type", "event").eq("owner_id", eventId);
  await supabase.from("form_fields").delete().eq("owner_type", "event").eq("owner_id", eventId);

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) return { error: error.message };

  revalidatePath("/host/dashboard");
  return { error: null };
}

export async function duplicateEvent(eventId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const auth = await requireEventHostOrAdmin(supabase, eventId, user.id);
  if (!auth.ok) return { error: auth.error };

  const { data: original, error: fetchError } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (fetchError || !original) return { error: "Event not found" };

  // host_id is the CALLER's id, not copied from the original -- relevant
  // when an admin duplicates someone else's event; they shouldn't end up
  // owning a copy of it. community_id, name, description, etc. all carry
  // over; event_date and status don't (a fresh draft always starts
  // 'active' regardless of whether the original was cancelled). The photo
  // doesn't carry over either -- a copy is its own entity with its own id,
  // so it gets its own independent assignment rather than visually
  // duplicating the original everywhere it appears.
  const copyId = crypto.randomUUID();
  const copyPhoto = assignPhotoForEntity(original.category ?? "other", copyId);

  const { data: copy, error: insertError } = await supabase
    .from("events")
    .insert({
      id: copyId,
      host_id: user.id,
      community_id: original.community_id,
      event_name: `${original.event_name} (copy)`,
      description: original.description,
      description_content: original.description_content,
      event_date: null,
      event_end_date: null,
      event_time: original.event_time,
      event_end_time: original.event_end_time,
      venue: original.venue,
      venue_lat: original.venue_lat,
      venue_lng: original.venue_lng,
      venue_place_id: original.venue_place_id,
      city: original.city,
      extra_cities: original.extra_cities,
      all_cities: original.all_cities,
      category: original.category,
      extra_categories: original.extra_categories,
      status: "active",
      unsplash_image_url: copyPhoto.imageUrl,
      unsplash_photo_id: copyPhoto.photoId,
    })
    .select()
    .single();

  if (insertError || !copy) return { error: insertError?.message ?? "Could not duplicate event" };
  triggerDownloadPing(copyPhoto.photoId);

  const [ticketTypes, formFields] = await Promise.all([
    getEventTicketTypes(supabase, eventId),
    getEventFormFields(supabase, eventId),
  ]);

  if (ticketTypes.length > 0) {
    const { error } = await supabase.from("event_ticket_types").insert(
      ticketTypes.map((t) => ({
        event_id: copy.id,
        name: t.name,
        price: t.price,
        quantity_available: t.quantity_available,
        sort_order: t.sort_order,
      })),
    );
    if (error) return { error: `Event duplicated, but ticket types failed to copy: ${error.message}` };
  }

  if (formFields.length > 0) {
    const { error } = await supabase.from("form_fields").insert(
      formFields.map((f) => ({
        owner_type: "event" as const,
        owner_id: copy.id,
        label: f.label,
        field_type: f.field_type,
        options: f.field_type === "select" ? f.options : null,
        is_required: f.is_required,
        sort_order: f.sort_order,
      })),
    );
    if (error) return { error: `Event duplicated, but the registration form failed to copy: ${error.message}` };
  }

  // form_responses (the original's actual registrants) is never touched --
  // copying it would be both meaningless (respondent_id/answers belong to
  // the original event) and a privacy violation.
  revalidatePath("/host/dashboard");
  redirect(`/events/${copy.id}/edit`);
}
