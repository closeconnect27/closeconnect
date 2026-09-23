"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { previewCancellationCore, cancelMyRegistrationCore, saveCancellationPolicyCore, type SaveCancellationPolicyInput } from "@/lib/eventCancellationCore";
import { DEFAULT_CANCELLATION_POLICY, type CancellationPolicyRule, type CancellationPolicySnapshot } from "@/lib/eventCancellation";

// ===========================================================================
// POLICY CONFIG (organizer) + PUBLIC READ (event page, checkout)
// ===========================================================================

/** Public -- read by the event detail page, the checkout acknowledgement
 * step, and the organizer's own settings form. `usingDefault: true` means
 * no row exists yet, so the caller is looking at DEFAULT_CANCELLATION_POLICY
 * rather than something the host actually configured -- the event page
 * copy differs slightly for each case (see EventCancellationPolicyCard). */
export async function getCancellationPolicyForEvent(eventId: string): Promise<{ policy: CancellationPolicySnapshot; usingDefault: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.from("event_cancellation_policies").select("enabled, rules").eq("event_id", eventId).maybeSingle();
  if (!data) return { policy: DEFAULT_CANCELLATION_POLICY, usingDefault: true };
  return { policy: { enabled: data.enabled, rules: data.rules as unknown as CancellationPolicyRule[] }, usingDefault: false };
}

export type { SaveCancellationPolicyInput };

/** Organizer-only (RLS: event_cancellation_policies_host_manage). Thin web
 * wrapper -- validation/upsert logic lives in saveCancellationPolicyCore so
 * the mobile API route (app/api/mobile/events/[id]/cancellation-policy) can
 * call the exact same code with a bearer-token client instead of this
 * cookie-based one. */
export async function saveCancellationPolicy(eventId: string, input: SaveCancellationPolicyInput) {
  const user = await requireUser();
  const supabase = await createClient();
  const result = await saveCancellationPolicyCore(supabase, user.id, eventId, input);
  if (!result.error) {
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/edit`);
  }
  return result;
}

// ===========================================================================
// ATTENDEE-FACING PREVIEW + CANCELLATION
// ===========================================================================
// Thin web wrappers -- the actual logic lives in lib/eventCancellationCore.ts
// so the mobile API routes (app/api/mobile/registrations/[id]/...) can call
// the exact same code with a bearer-token client instead of this cookie-based
// one, same split cancelEventForHost (lib/cancelEvent.ts) already uses.

/** Read-only -- what the customer's own "Cancel booking" confirmation
 * screen shows before they commit (section 10/11). The backend, not the
 * frontend, computes every number here; cancelMyRegistration below
 * recomputes the exact same thing right before acting on it, from the
 * exact same core function, so preview and reality can never disagree. */
export async function previewCancellationForRegistration(registrationId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  return previewCancellationCore(supabase, user.id, registrationId);
}

/** The real cancellation action (section 10/11/14/19/35/36). Every
 * "never trust the frontend" / "must be idempotent" / "customer can only
 * cancel their own booking" rule from the spec this was built from lives
 * in cancelMyRegistrationCore -- ownership via an RLS-scoped read,
 * idempotency via an atomic `.neq("status","cancelled")` update, amount
 * always recomputed server-side, never accepted as an argument. */
export async function cancelMyRegistration(registrationId: string, reason?: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const result = await cancelMyRegistrationCore(supabase, user.id, registrationId, reason);
  if (!result.error) {
    revalidatePath(`/events/${result.eventId}`);
    revalidatePath(`/events/${result.eventId}/manage`);
    revalidatePath("/events/my-events");
  }
  return result;
}
