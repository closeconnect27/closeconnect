"use client";

import { IconTrash, IconPlus } from "@tabler/icons-react";
import type { CancellationPolicyRule } from "@/lib/eventCancellation";

// A tier's hours_before/refund_percentage kept as text while editing, same
// reasoning as TicketTypeBuilder's price/quantity_available fields -- a
// controlled numeric input round-tripping every keystroke through Number()
// drops an in-progress "" or "5." before the host finishes typing it.
export type CancellationRuleDraft = { hoursBefore: string; refundPercentage: string };

export type CancellationPolicyDraft = { enabled: boolean; rules: CancellationRuleDraft[] };

export const DEFAULT_POLICY_DRAFT: CancellationPolicyDraft = {
  enabled: true,
  rules: [
    { hoursBefore: "48", refundPercentage: "100" },
    { hoursBefore: "0", refundPercentage: "0" },
  ],
};

export function draftToRules(draft: CancellationPolicyDraft): CancellationPolicyRule[] {
  return draft.rules.map((r) => ({ hours_before: Number(r.hoursBefore) || 0, refund_percentage: Number(r.refundPercentage) || 0 }));
}

const inputClass = "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-2.5 text-[14px] transition focus:border-green";

/** Organizer-facing editor for an event's cancellation/refund policy
 * (section 3/25/26 of the spec this was built from). Non-refundable is a
 * top-level toggle, not just "delete all the tiers" -- an event with zero
 * tiers and one with enabled=false read identically to an attendee, but
 * only the latter is unambiguous about being an intentional choice rather
 * than an organizer who just hasn't configured anything yet. */
export function CancellationPolicyBuilder({ value, onChange }: { value: CancellationPolicyDraft; onChange: (value: CancellationPolicyDraft) => void }) {
  function addRule() {
    onChange({ ...value, rules: [...value.rules, { hoursBefore: "", refundPercentage: "" }] });
  }
  function updateRule(i: number, patch: Partial<CancellationRuleDraft>) {
    onChange({ ...value, rules: value.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  }
  function removeRule(i: number) {
    onChange({ ...value, rules: value.rules.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, enabled: true, rules: value.rules.length > 0 ? value.rules : DEFAULT_POLICY_DRAFT.rules })}
          className={
            value.enabled
              ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium text-green-dark transition"
              : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green"
          }
        >
          Refundable
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, enabled: false })}
          className={
            !value.enabled
              ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium text-green-dark transition"
              : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green"
          }
        >
          Non-refundable
        </button>
      </div>

      {!value.enabled ? (
        <p className="text-[12px] text-text3">Attendees will see &quot;This booking is non-refundable&quot; before they pay, and can&apos;t cancel for a refund afterward.</p>
      ) : (
        <>
          <p className="text-[12px] text-text3">
            How much of an attendee&apos;s payment is refunded, based on how far before the event they cancel. Add as many tiers as you need.
          </p>
          <div className="flex flex-col gap-2">
            {value.rules.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-card-sm border border-border2 bg-bg3 p-2.5">
                <span className="shrink-0 text-[12px] text-text3">More than</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.hoursBefore}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== "" && !/^\d*$/.test(raw)) return;
                    updateRule(i, { hoursBefore: raw });
                  }}
                  placeholder="48"
                  className={`w-16 ${inputClass}`}
                />
                <span className="shrink-0 text-[12px] text-text3">hrs before →</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.refundPercentage}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== "" && !/^\d*$/.test(raw)) return;
                    updateRule(i, { refundPercentage: raw });
                  }}
                  placeholder="100"
                  className={`w-16 ${inputClass}`}
                />
                <span className="shrink-0 text-[12px] text-text3">% refund</span>
                {value.rules.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRule(i)}
                    aria-label="Remove tier"
                    className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border2 text-text3 transition hover:border-pink hover:text-pink"
                  >
                    <IconTrash size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRule}
            className="flex items-center justify-center gap-2 rounded-card-sm border border-dashed border-border2 py-2.5 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
          >
            <IconPlus size={13} />
            Add a tier
          </button>
        </>
      )}
    </div>
  );
}

/** Read-only, attendee-facing rendering of a policy -- used on the event
 * page, in the checkout acknowledgement, and as the organizer's "preview
 * what customers will see" (section 26). Same source of truth
 * (CancellationPolicySnapshot) as the actual refund calculation, so this
 * text can never promise something calculateCancellationRefund wouldn't
 * actually pay out. */
export function CancellationPolicyText({ enabled, rules, usingDefault }: { enabled: boolean; rules: CancellationPolicyRule[]; usingDefault?: boolean }) {
  if (!enabled) {
    return <p className="text-[13px] text-text2">This booking is non-refundable.</p>;
  }
  const sorted = [...rules].sort((a, b) => b.hours_before - a.hours_before);
  return (
    <div className="flex flex-col gap-1 text-[13px] text-text2">
      {sorted.map((r, i) => {
        // Tier i covers everything from its own hours_before up to (but not
        // including) the PREVIOUS, more-generous tier's threshold -- the
        // first tier has no upper bound ("more than"), the last one is
        // always "less than" the tier above it.
        const previous = sorted[i - 1];
        const label = i === 0 ? `More than ${r.hours_before} hours before the event` : `${r.hours_before}–${previous.hours_before} hours before the event`;
        return (
          <p key={i}>
            {label}: <strong className="text-text">{r.refund_percentage}% refund</strong>
          </p>
        );
      })}
      {usingDefault && <p className="mt-1 text-[11px] text-text3">This is CloseConnect&apos;s default policy -- the organizer hasn&apos;t set a custom one for this event.</p>}
    </div>
  );
}
