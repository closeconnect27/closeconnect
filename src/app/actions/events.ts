"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createEventSchema,
  eventRegistrationSchema,
  type CreateEventInput,
  type EventRegistrationInput,
} from "@/lib/validation/event";
import { getEventFormFields, getHostableCommunities, getEventImages } from "@/lib/queries/events";

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

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      host_id: user.id,
      community_id: data.community_id ?? null,
      event_name: data.event_name,
      description: data.description || null,
      event_date: data.event_date,
      event_time: data.event_time || null,
      venue: data.venue || null,
      city: data.city || null,
      category: data.category,
    })
    .select()
    .single();

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

  redirect(`/events/${event.id}`);
}

export async function registerForEvent(eventId: string, input: EventRegistrationInput) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("form_responses").insert({
    owner_type: "event",
    owner_id: eventId,
    ticket_type_id: parsed.data.ticket_type_id,
    respondent_id: user?.id ?? null,
    response_data: { name: parsed.data.name, email: parsed.data.email, ...parsed.data.answers },
    status: "approved",
  });

  if (error) {
    return { error: error.message.includes("wait a moment") ? error.message : "Could not complete registration" };
  }
  revalidatePath(`/events/${eventId}`);
  return { error: null };
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

export async function addEventImage(eventId: string, imageUrl: string) {
  await requireUser();

  // event_images is publicly rendered on the event page -- without this, a
  // host (the only caller RLS lets reach the insert) could point it at an
  // arbitrary external URL instead of a real upload, bypassing the storage
  // bucket's own type/size limits (SPEC.md Section 11) entirely.
  const expectedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-images/${eventId}/`;
  if (!imageUrl.startsWith(expectedPrefix)) {
    return { error: "Image must come from this event's own upload" };
  }

  const supabase = await createClient();

  const existing = await getEventImages(supabase, eventId);
  if (existing.length >= 3) {
    return { error: "An event can have at most 3 images" };
  }

  const { error } = await supabase.from("event_images").insert({
    event_id: eventId,
    image_url: imageUrl,
    sort_order: existing.length,
  });
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

export async function removeEventImage(eventId: string, imageId: string, storagePath: string) {
  await requireUser();
  const supabase = await createClient();

  // RLS (event_images_delete_host) is the real gate -- a non-host caller's
  // delete simply matches zero rows rather than erroring.
  await supabase.storage.from("event-images").remove([storagePath]);
  const { error } = await supabase.from("event_images").delete().eq("id", imageId);
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventId}`);
  return { error: null };
}
