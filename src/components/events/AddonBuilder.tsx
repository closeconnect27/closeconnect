"use client";

import { IconTrash, IconPlus } from "@tabler/icons-react";
import { parsePrice } from "@/components/events/TicketTypeBuilder";

export type AddonDraft = {
  id?: string; // present once saved -- undefined for a new, not-yet-saved row
  name: string;
  price: string;
  quantity_available: string;
  is_active: boolean;
  is_refundable: boolean;
};

const inputClass = "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-2.5 text-[14px] transition focus:border-green";

/**
 * Editor for an event's paid add-ons (T-shirts, parking passes, etc.) --
 * same list-editor shape as TicketTypeBuilder, but for optional extras a
 * registrant can add to their order at checkout rather than the ticket
 * itself. Unlike ticket types, add-ons are never frozen after someone has
 * registered (saveAddonsForEvent's own comment) -- a host can add a new
 * add-on or retire one (is_active) at any time; each order keeps its own
 * name/price snapshot regardless.
 */
export function AddonBuilder({ addons, onChange }: { addons: AddonDraft[]; onChange: (addons: AddonDraft[]) => void }) {
  function addAddon() {
    onChange([...addons, { name: "", price: "0", quantity_available: "", is_active: true, is_refundable: true }]);
  }
  function updateAddon(i: number, patch: Partial<AddonDraft>) {
    onChange(addons.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function removeAddon(i: number) {
    onChange(addons.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-text3">Optional paid extras attendees can add to their order at checkout, e.g. a T-shirt or parking pass.</p>
      {addons.map((a, i) => (
        <div key={i} className={`card-elevated rounded-card bg-bg2 p-4 ${!a.is_active ? "opacity-60" : ""}`}>
          <div className="flex items-start gap-2">
            <input value={a.name} onChange={(e) => updateAddon(i, { name: e.target.value })} placeholder="Add-on name, e.g. T-shirt" maxLength={120} className={`flex-1 ${inputClass}`} />
            <button
              type="button"
              onClick={() => removeAddon(i)}
              aria-label="Remove add-on"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border2 text-text3 transition hover:border-pink hover:text-pink"
            >
              <IconTrash size={14} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text3">Price (₹)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={a.price}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                  updateAddon(i, { price: raw });
                }}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text3">Quantity (optional)</span>
              <input
                type="text"
                inputMode="numeric"
                value={a.quantity_available}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw !== "" && !/^\d*$/.test(raw)) return;
                  updateAddon(i, { quantity_available: raw });
                }}
                placeholder="Unlimited"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-text2">
              <input type="checkbox" checked={a.is_active} onChange={(e) => updateAddon(i, { is_active: e.target.checked })} />
              On sale -- visible to attendees at checkout
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-text2">
              <input type="checkbox" checked={a.is_refundable} onChange={(e) => updateAddon(i, { is_refundable: e.target.checked })} />
              Refundable if a registrant cancels
            </label>
            {!a.is_refundable && <p className="text-[11px] text-text3">This add-on will never be refunded, even if the event&apos;s cancellation policy would otherwise refund the ticket in full.</p>}
          </div>

          {parsePrice(a.price) > 0 && <p className="mt-2 text-[11px] text-text3">Added to the registrant&apos;s Razorpay payment along with their ticket.</p>}
        </div>
      ))}

      <button
        type="button"
        onClick={addAddon}
        className="flex items-center justify-center gap-2 rounded-card-sm border border-dashed border-border2 py-3 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
      >
        <IconPlus size={14} />
        Add an add-on
      </button>
    </div>
  );
}
