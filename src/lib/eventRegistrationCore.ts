import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventTicketTypes, getEventAddons, getEventFormFields } from "@/lib/queries/events";
import { sendRegistrationConfirmationEmail } from "@/lib/eventRegistrationEmails";
import { trackServerEvent } from "@/lib/mixpanel/server";
import { eventRegistrationSchema, type EventRegistrationInput } from "@/lib/validation/event";
import type { CancellationPolicySnapshot } from "@/lib/eventCancellation";

// Core registration logic, factored out of the web "use server" action
// (app/actions/events.ts's registerForEvent) so the mobile API route
// (app/api/mobile/events/[id]/register) can call the exact same code with
// a bearer-token-authenticated client instead of the web's cookie-based
// one -- same split every other cross-platform operation in this app
// already uses (cancellation, payouts). Critically, add-on prices are
// ALWAYS re-read here from event_addons, never trusted from the caller --
// letting a mobile client insert its own form_response_addons row directly
// (the original mobile pattern for the ticket row itself) would let it
// claim any price it wanted, since nothing downstream re-derives the
// price from anywhere else once it's snapshotted.
export async function registerForEventCore(supabase: SupabaseClient, userId: string, userEmail: string | undefined, eventId: string, input: EventRegistrationInput) {
  const parsed = eventRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", registrationId: null, isPaid: null };
  }

  const fields = await getEventFormFields(supabase, eventId);
  for (const field of fields) {
    if (field.is_required && !parsed.data.answers[field.id]?.trim()) {
      return { error: `"${field.label}" is required`, registrationId: null, isPaid: null };
    }
  }

  const ticketTypes = await getEventTicketTypes(supabase, eventId);
  const ticketType = ticketTypes.find((t) => t.id === parsed.data.ticket_type_id);
  if (!ticketType) return { error: "That ticket type no longer exists", registrationId: null, isPaid: null };

  const requestedAddons = parsed.data.addons;
  const availableAddons = requestedAddons.length > 0 ? await getEventAddons(supabase, eventId) : [];
  const addonSelections = requestedAddons
    .map((a) => ({ ...a, addon: availableAddons.find((av) => av.id === a.addon_id) }))
    .filter((a): a is typeof a & { addon: NonNullable<(typeof a)["addon"]> } => !!a.addon);
  const addonTotalRupees = addonSelections.reduce((sum, a) => sum + a.addon.price * a.quantity, 0);

  const isPaid = ticketType.price > 0 || addonTotalRupees > 0;

  const { data: policyRow } = await supabase.from("event_cancellation_policies").select("enabled, rules").eq("event_id", eventId).maybeSingle();
  const policySnapshot: CancellationPolicySnapshot | null = policyRow ? { enabled: policyRow.enabled, rules: policyRow.rules as unknown as CancellationPolicySnapshot["rules"] } : null;

  const { data: registration, error } = await supabase
    .from("form_responses")
    .insert({
      owner_type: "event",
      owner_id: eventId,
      ticket_type_id: parsed.data.ticket_type_id,
      respondent_id: userId,
      response_data: { name: parsed.data.name, email: userEmail, ...parsed.data.answers },
      status: "approved",
      payment_status: isPaid ? "unpaid" : "paid",
      quantity: parsed.data.quantity,
      cancellation_policy_snapshot: policySnapshot,
      amount_paid_paise: isPaid ? null : 0,
    })
    .select("id")
    .single();

  if (error || !registration) {
    if (error?.message.includes("wait a moment")) return { error: error.message, registrationId: null, isPaid: null };
    if (error?.message.includes("sold out")) return { error: error.message, registrationId: null, isPaid: null };
    return { error: error?.message ?? "Could not complete registration", registrationId: null, isPaid: null };
  }

  if (addonSelections.length > 0) {
    const { error: addonError } = await supabase.from("form_response_addons").insert(
      addonSelections.map((a) => ({
        registration_id: registration.id,
        addon_id: a.addon.id,
        name_snapshot: a.addon.name,
        unit_price_paise: Math.round(a.addon.price * 100),
        quantity: a.quantity,
      })),
    );
    if (addonError) {
      await createAdminClient().from("form_responses").delete().eq("id", registration.id);
      return { error: addonError.message, registrationId: null, isPaid: null };
    }
  }

  if (!isPaid) {
    if (userEmail) {
      try {
        await sendRegistrationConfirmationEmail(supabase, { email: userEmail, eventId, registrantName: parsed.data.name });
      } catch (e) {
        console.error("Failed to send registration confirmation email:", e);
      }
    }
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "event_registered",
      title: "You're registered!",
      body: ticketType.name,
      link: `/events/${eventId}`,
    });
  }
  trackServerEvent("event_registered", userId, {
    event_id: eventId,
    ticket_type_id: parsed.data.ticket_type_id,
    is_paid: isPaid,
  });

  return { error: null, registrationId: registration.id as string, isPaid };
}
