"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendRegistrationConfirmationEmail, sendPaymentPendingEmail } from "@/lib/eventRegistrationEmails";
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
import { getHostPaymentDetails } from "@/lib/queries/paymentDetails";
import { deserializeDescriptionContent } from "@/lib/validation/richText";

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

  // The host's own UPI QR/ID, set inline while creating/editing the event
  // (PaymentDetailsForm, shown once a ticket has a price) -- a paid
  // registration hands off to manual UPI payment (see
  // submitPaymentReference below for the registrant's side of that, and
  // confirmPayment for the host's).
  let hostUpi: { upiId: string | null; qrImageUrl: string | null } | null = null;
  if (isPaid) {
    const { data: eventRow } = await supabase.from("events").select("host_id").eq("id", eventId).single();
    if (eventRow) {
      const details = await getHostPaymentDetails(supabase, eventRow.host_id);
      hostUpi = { upiId: details?.upi_id ?? null, qrImageUrl: details?.qr_image_url ?? null };
    }
  }

  const { data: registration, error } = await supabase
    .from("form_responses")
    .insert({
      owner_type: "event",
      owner_id: eventId,
      ticket_type_id: parsed.data.ticket_type_id,
      respondent_id: user.id,
      // Email comes from the verified session, never client input -- a
      // registrant can't spoof someone else's email.
      response_data: { name: parsed.data.name, email: user.email, ...parsed.data.answers },
      status: "approved",
      payment_status: isPaid ? "unpaid" : "paid",
      quantity: parsed.data.quantity,
    })
    .select("id")
    .single();

  if (error || !registration) {
    if (error?.message.includes("wait a moment")) return { error: error.message };
    // Raised by enforce_ticket_capacity() (0030) -- already user-facing text.
    if (error?.message.includes("sold out")) return { error: error.message };
    return { error: error?.message ?? "Could not complete registration" };
  }

  revalidatePath(`/events/${eventId}`);
  // The UI's "A confirmation has been sent to your email" line pre-dates
  // this -- it was display text with no actual send behind it (found while
  // auditing this exact claim). Awaited, not fire-and-forget -- Cloudflare
  // Workers can terminate an un-awaited promise the instant this action's
  // response is sent, killing the fetch to Resend before it completes. A
  // failure here still doesn't fail the registration itself (only logs).
  //
  // Paid tickets get a "complete your payment" email/notification here,
  // never the real "you're registered" one -- that's only true once the
  // host manually confirms the UPI payment (confirmPayment below sends
  // it). Sending "you're registered" before any money has moved is
  // exactly the bug a real user hit: an email confirming a spot that
  // wasn't actually confirmed yet.
  if (isPaid) {
    if (user.email) {
      try {
        await sendPaymentPendingEmail(supabase, {
          email: user.email,
          eventId,
          registrantName: parsed.data.name,
          upiId: hostUpi?.upiId ?? null,
          qrImageUrl: hostUpi?.qrImageUrl ?? null,
          amountRupees: ticketType.price * parsed.data.quantity,
        });
      } catch (e) {
        console.error("Failed to send payment-pending email:", e);
      }
    }
  } else {
    if (user.email) {
      try {
        await sendRegistrationConfirmationEmail(supabase, { email: user.email, eventId, registrantName: parsed.data.name });
      } catch (e) {
        console.error("Failed to send registration confirmation email:", e);
      }
    }
    // Self-notification (recipient = the acting user) -- inserted directly
    // under this request's own RLS-scoped client, allowed by
    // notifications_insert_self (0061), unlike every other notification
    // type which goes through a security definer trigger instead. Paid
    // tickets get their "You're registered!" notification from the
    // webhook once payment actually completes, not here.
    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "event_registered",
      title: "You're registered!",
      body: ticketType.name,
      link: `/events/${eventId}`,
    });
  }
  trackServerEvent("event_registered", user.id, {
    event_id: eventId,
    ticket_type_id: parsed.data.ticket_type_id,
    is_paid: isPaid,
  });
  return { error: null, registrationId: registration.id, isPaid, hostUpi };
}

/** The registrant's side of the manual UPI flow -- they paid by hand via
 * their own UPI app and are typing back whatever reference/UTR number it
 * gave them. This is never verified programmatically (there's no API into
 * a personal UPI account); it just moves the registration into a
 * host-reviewable queue (confirmPayment below) instead of leaving it
 * silently 'unpaid' forever. A security definer trigger (0066) notifies
 * the host in-app the moment this lands. */
export async function submitPaymentReference(eventId: string, registrationId: string, reference: string) {
  const user = await requireUser();

  const trimmed = reference.trim();
  if (!trimmed) return { error: "Enter the reference number your UPI app gave you" };
  if (trimmed.length > 100) return { error: "That reference looks too long -- double-check what you pasted" };

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("form_responses")
    .select("respondent_id, payment_status")
    .eq("id", registrationId)
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .single();
  if (fetchError || !existing) return { error: "Registration not found" };
  if (existing.respondent_id !== user.id) return { error: "Not allowed to update this registration" };
  if (existing.payment_status !== "unpaid") return { error: "This registration isn't awaiting payment" };

  const { error } = await supabase
    .from("form_responses")
    .update({ payment_status: "pending_verification", payment_reference: trimmed })
    .eq("id", registrationId);
  if (error) return { error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

/** Host-side confirmation for the manual UPI flow -- the host checks their
 * own UPI app history for this reference number and either confirms it
 * (payment_status -> 'paid') or rejects it (back to 'unpaid' so the
 * registrant can correct and resubmit). Confirming is the one place that
 * still needs an explicit "you're registered" email sent from here -- the
 * notify trigger (0066) only ever handles the in-app notification, not
 * email. */
export async function confirmPayment(eventId: string, registrationId: string, decision: "confirm" | "reject") {
  const user = await requireUser();
  const supabase = await createClient();

  const auth = await requireEventHostOrAdmin(supabase, eventId, user.id);
  if (!auth.ok) return { error: auth.error };

  const { data: existing, error: fetchError } = await supabase
    .from("form_responses")
    .select("payment_status, response_data")
    .eq("id", registrationId)
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .single();
  if (fetchError || !existing) return { error: "Registration not found" };
  if (existing.payment_status !== "pending_verification") return { error: "Nothing awaiting confirmation here" };

  // Confirming keeps payment_reference as an audit trail; rejecting clears
  // it so the registrant sees a clean slate to correct and resubmit.
  const update =
    decision === "confirm"
      ? { payment_status: "paid" as const }
      : { payment_status: "unpaid" as const, payment_reference: null };
  const { error } = await supabase.from("form_responses").update(update).eq("id", registrationId);
  if (error) return { error: error.message };

  if (decision === "confirm") {
    const responseData = existing.response_data as unknown as { name?: string; email?: string } | null;
    const email = responseData?.email;
    const name = responseData?.name ?? "there";
    if (email) {
      try {
        await sendRegistrationConfirmationEmail(supabase, { email, eventId, registrantName: name });
      } catch (e) {
        console.error("Failed to send post-payment confirmation email:", e);
      }
    }
  }

  revalidatePath(`/events/${eventId}/manage`);
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
  // pattern as setCheckInCount above. Registrations (form_responses) are
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
