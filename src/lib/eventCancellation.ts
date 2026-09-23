// The ONE place a cancellation refund gets calculated (section 41 of the
// spec this was built from: never duplicate this logic) -- used by the
// checkout policy preview, the customer's cancel-confirmation screen, and
// the actual cancelMyRegistration action itself, so all three can never
// show/charge different numbers.

export type CancellationPolicyRule = { hours_before: number; refund_percentage: number };
export type CancellationPolicySnapshot = { enabled: boolean; rules: CancellationPolicyRule[] };

// What every event effectively has when no event_cancellation_policies row
// exists for it (any event created before this feature shipped, or whose
// host never opened the settings) -- this is the exact rule
// /cancellation-refund (Section 2) already promises attendees, so "no
// policy configured" and "the documented default policy" must always
// resolve to the same numbers.
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicySnapshot = {
  enabled: true,
  rules: [
    { hours_before: 48, refund_percentage: 100 },
    { hours_before: 0, refund_percentage: 0 },
  ],
};

/** event_date/event_time are stored as plain date/time strings with no
 * timezone, on the same "this app assumes IST" convention isEventPast
 * already documents -- interpreting them as anything else (e.g. the
 * server process's own local time) would shift cancellation deadlines by
 * hours depending on where the code happens to run. A null event_time
 * (an event with no specific start time set) is treated as starting at
 * midnight IST on event_date -- the safest reading for a cancellation
 * deadline is the EARLIEST the event could start, not the latest. */
export function getEventStartInstant(event: { event_date: string | null; event_time: string | null }): Date | null {
  if (!event.event_date) return null;
  const time = event.event_time ? `${event.event_time}${event.event_time.length === 5 ? ":00" : ""}` : "00:00:00";
  return new Date(`${event.event_date}T${time}+05:30`);
}

export type CancellationCalculation = {
  eligible: boolean;
  refundPercentage: number;
  refundAmountPaise: number;
  cancellationChargePaise: number;
  matchedRule: CancellationPolicyRule | null;
  hoursUntilEvent: number;
};

/** amountPaidPaise is what THIS registration actually charged (form_
 * responses.amount_paid_paise) -- never the ticket type's current price,
 * which could differ from what was charged for a historical registration
 * in the (currently impossible, per 0120's freeze, but not a fact worth
 * silently assuming forever) case ticket pricing model ever changes.
 * policy is the registration's own snapshot, never the event's live
 * policy row (see the migration's own comment on why). */
export function calculateCancellationRefund(
  amountPaidPaise: number,
  eventStartInstant: Date | null,
  policy: CancellationPolicySnapshot | null,
  now: Date = new Date(),
): CancellationCalculation {
  const effectivePolicy = policy ?? DEFAULT_CANCELLATION_POLICY;

  // No start time at all (a draft/TBD event somehow still registered
  // against) -- can't evaluate an hours-before-event rule, so treat as
  // "always within the strictest window" (0% refund) rather than crash or
  // silently allow a full refund forever.
  if (!eventStartInstant) {
    return { eligible: false, refundPercentage: 0, refundAmountPaise: 0, cancellationChargePaise: amountPaidPaise, matchedRule: null, hoursUntilEvent: 0 };
  }

  const hoursUntilEvent = (eventStartInstant.getTime() - now.getTime()) / 3_600_000;

  if (!effectivePolicy.enabled) {
    return { eligible: false, refundPercentage: 0, refundAmountPaise: 0, cancellationChargePaise: amountPaidPaise, matchedRule: null, hoursUntilEvent };
  }

  // Highest hours_before first, so "the first tier the booking still
  // clears" is the most generous one still applicable -- identical
  // matching order to TheHotSpots' calculateCancellation this same
  // session, extended here with a floor/ceiling clamp for a
  // defensively-invalid saved rule (e.g. a negative percentage).
  const sorted = [...effectivePolicy.rules].sort((a, b) => b.hours_before - a.hours_before);
  const matchedRule = sorted.find((r) => hoursUntilEvent >= r.hours_before) ?? sorted[sorted.length - 1] ?? null;
  const refundPercentage = Math.min(100, Math.max(0, matchedRule?.refund_percentage ?? 0));
  const refundAmountPaise = Math.round(amountPaidPaise * (refundPercentage / 100));
  const cancellationChargePaise = Math.max(0, amountPaidPaise - refundAmountPaise);

  return { eligible: refundAmountPaise > 0, refundPercentage, refundAmountPaise, cancellationChargePaise, matchedRule, hoursUntilEvent };
}

/** Validates/normalizes organizer-entered rules before they're saved --
 * every hours_before must be a non-negative number, every refund_percentage
 * within [0, 100], and no two rules can share the same hours_before (an
 * organizer's UI bug or a hand-crafted request could otherwise save an
 * ambiguous policy that matches two different percentages at the exact
 * same threshold). Returns the sorted, clamped rules, or a message
 * explaining what's wrong. */
export function validateCancellationRules(rules: CancellationPolicyRule[]): { error: string | null; rules: CancellationPolicyRule[] } {
  if (rules.length === 0) return { error: "Add at least one cancellation tier.", rules: [] };
  const seenHours = new Set<number>();
  for (const r of rules) {
    if (!Number.isFinite(r.hours_before) || r.hours_before < 0) return { error: "Hours before the event must be zero or more.", rules: [] };
    if (!Number.isFinite(r.refund_percentage) || r.refund_percentage < 0 || r.refund_percentage > 100) {
      return { error: "Refund percentage must be between 0 and 100.", rules: [] };
    }
    if (seenHours.has(r.hours_before)) return { error: `Two tiers both start at ${r.hours_before} hours before the event -- remove one.`, rules: [] };
    seenHours.add(r.hours_before);
  }
  const sorted = [...rules].sort((a, b) => b.hours_before - a.hours_before);
  return { error: null, rules: sorted };
}
