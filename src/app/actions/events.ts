"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { createPaymentLink } from "@/lib/razorpay";
import { trackServerEvent } from "@/lib/mixpanel/server";
import { assignPhotoForEntity, triggerDownloadPing } from "@/lib/unsplash";
import {
  createEventSchema,
  updateEventSchema,
  updateEventTicketsAndFormSchema,
  eventRegistrationSchema,
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

export async function createEvent(input: CreateEventInput) {
  const user = await requireUser();

  // Never trust client-side validation alone (SPEC.md Section 11).
  const parsed = createEventSchema.safeParse(input);
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

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      id,
      host_id: user.id,
      community_id: data.community_id ?? null,
      event_name: data.event_name,
      description: data.description || null,
      description_content: data.description_content ?? null,
      event_date: data.event_date,
      event_time: data.event_time || null,
      venue: data.venue || null,
      city: data.city || null,
      extra_cities: data.extra_cities,
      category: data.category,
      unsplash_image_url: photo.imageUrl,
      unsplash_photo_id: photo.photoId,
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
      payment_link: t.price > 0 ? t.payment_link : null,
      quantity_available: t.quantity_available ?? null,
      sort_order: i,
    })),
  );
  if (ticketsError) {
    return { error: `Event created, but ticket types failed to save: ${ticketsError.message}` };
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

  trackServerEvent("event_created", user.id, { event_id: event.id, category: data.category, has_community: !!data.community_id });

  // No redirect() here -- same reasoning as createCommunity: the caller
  // (NewEventForm) still has staged cover/gallery images in memory that
  // need this id to upload against, and only navigates once that's done.
  return { error: null, eventId: event.id };
}

export async function registerForEvent(eventId: string, input: EventRegistrationInput) {
  // Registration requires a real account (SPEC.md's earlier guest-friendly
  // decision is reversed) -- redirects to sign-in rather than erroring, same
  // as every other requireUser() call site, though the UI already gates
  // this form behind isLoggedIn so this mainly guards direct action calls.
  const user = await requireUser();

  const parsed = eventRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();

  // Re-check "required" server-side against the event's own question
  // definitions -- never trust the client to have enforced this.
  const fields = await getEventFormFields(supabase, eventId);
  for (const field of fields) {
    if (field.is_required && !parsed.data.answers[field.id]?.trim()) {
      return { error: `"${field.label}" is required` };
    }
  }

  // Needed both for the price (free tickets skip payment entirely --
  // payment_status starts 'paid', not the column default 'unpaid', so a
  // free RSVP doesn't sit in the funnel dashboard looking like an unpaid
  // one forever) and for the payment link's own description/amount.
  const ticketTypes = await getEventTicketTypes(supabase, eventId);
  const ticketType = ticketTypes.find((t) => t.id === parsed.data.ticket_type_id);
  if (!ticketType) return { error: "That ticket type no longer exists" };
  const isPaid = ticketType.price > 0;

  const { data: registration, error } = await supabase
    .from("form_responses")
    .insert({
      owner_type: "event",
      owner_id: eventId,
      ticket_type_id: parsed.data.ticket_type_id,
      respondent_id: user.id,
      // Email comes from the verified session, never client input -- a
      // registrant can't spoof someone else's email or dodge the
      // one-registration-per-account constraint by varying it.
      response_data: { name: parsed.data.name, email: user.email, ...parsed.data.answers },
      status: "approved",
      payment_status: isPaid ? "unpaid" : "paid",
    })
    .select("id")
    .single();

  if (error || !registration) {
    if (error?.message.includes("wait a moment")) return { error: error.message };
    // Raised by enforce_ticket_capacity() (0030) -- already user-facing text.
    if (error?.message.includes("sold out")) return { error: error.message };
    // 23505 = unique_violation -- the one-registration-per-event-respondent
    // index (0015, migrated off the old email-based one now that every
    // registrant has a real account).
    if (error?.code === "23505") {
      return { error: "You've already registered for this event." };
    }
    return { error: error?.message ?? "Could not complete registration" };
  }

  // A per-registration Razorpay Payment Link, not the ticket type's own
  // static link -- reference_id = this registration's id is what the
  // webhook (app/api/webhooks/razorpay) matches back to later. The
  // registration itself is already confirmed at this point regardless of
  // payment outcome (matching the pre-existing "approved on submit, pay
  // after" flow) -- a failed link creation here doesn't undo it, it just
  // means no payment link to show; the registrant/host can be pointed at
  // support rather than losing the registration entirely.
  let paymentLinkUrl: string | null = null;
  if (isPaid) {
    const linkResult = await createPaymentLink({
      registrationId: registration.id,
      amountRupees: ticketType.price,
      description: `${ticketType.name} ticket`,
      customerName: parsed.data.name,
      customerEmail: user.email ?? "",
    });
    if ("url" in linkResult) paymentLinkUrl = linkResult.url;
    else console.error("Payment link creation failed for registration", registration.id, linkResult.error);
  }

  revalidatePath(`/events/${eventId}`);
  // The UI's "A confirmation has been sent to your email" line pre-dates
  // this -- it was display text with no actual send behind it (found while
  // auditing this exact claim). Fire-and-forget, same as the other
  // notification emails: never blocks the registrant's own success path on
  // Resend being reachable.
  if (user.email) {
    sendRegistrationConfirmation(user.email, eventId, parsed.data.name).catch((e) =>
      console.error("Failed to send registration confirmation email:", e),
    );
  }
  trackServerEvent("event_registered", user.id, {
    event_id: eventId,
    ticket_type_id: parsed.data.ticket_type_id,
    is_paid: isPaid,
  });
  return { error: null, paymentLinkUrl };
}

function formatEventDateForEmail(isoDate: string | null) {
  if (!isoDate) return "Date to be announced";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

async function sendRegistrationConfirmation(email: string, eventId: string, registrantName: string) {
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("event_name, event_date, venue, city")
    .eq("id", eventId)
    .single();
  if (!event) return;

  const dateLabel = formatEventDateForEmail(event.event_date);
  const place = [event.venue, event.city].filter(Boolean).join(", ");

  await sendEmail({
    to: email,
    subject: `You're registered: ${event.event_name}`,
    html: `
      <p>Hi ${registrantName},</p>
      <p>You're registered for <strong>${event.event_name}</strong>.</p>
      <p>${dateLabel}${place ? ` &middot; ${place}` : ""}</p>
    `,
  });
}

export async function setCheckIn(eventId: string, responseId: string, checkedIn: boolean) {
  await requireUser();
  const supabase = await createClient();

  // RLS (form_responses_update_owner) is the real gate -- a non-host caller's
  // update simply matches zero rows rather than erroring.
  const { data, error } = await supabase
    .from("form_responses")
    .update({ checked_in_at: checkedIn ? new Date().toISOString() : null })
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

export async function updateEvent(eventId: string, input: UpdateEventInput) {
  const user = await requireUser();

  const parsed = updateEventSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  const auth = await requireEventHostOrAdmin(supabase, eventId, user.id);
  if (!auth.ok) return { error: auth.error };

  // Explicit column list, not a spread of `data` -- host_id/community_id/
  // status can never be written through this action no matter what the
  // schema looks like later (same reasoning as updateCommunity).
  const { error } = await supabase
    .from("events")
    .update({
      event_name: data.event_name,
      description: data.description || null,
      description_content: data.description_content ?? null,
      event_date: data.event_date,
      event_time: data.event_time || null,
      venue: data.venue || null,
      city: data.city || null,
      extra_cities: data.extra_cities,
      category: data.category,
    })
    .eq("id", eventId);

  if (error) return { error: error.message };

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
      payment_link: t.price > 0 ? t.payment_link : null,
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
  await requireUser();
  const supabase = await createClient();

  // RLS (events_update_host_or_admin) is the real gate -- a non-host
  // caller's update simply matches zero rows rather than erroring, same
  // pattern as setCheckIn above. Registrations (form_responses) are
  // untouched by design -- people who already registered should still see
  // they signed up for something that got cancelled, not have that record
  // silently disappear.
  const { data, error } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId)
    .select();

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not allowed to cancel this event" };

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/manage`);
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
      event_time: original.event_time,
      venue: original.venue,
      city: original.city,
      category: original.category,
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
        payment_link: t.payment_link,
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
