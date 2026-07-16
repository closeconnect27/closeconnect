"use client";

import { IconTrash, IconPlus } from "@tabler/icons-react";

export type TicketTypeDraft = {
  name: string;
  price: number;
  quantity_available: string; // kept as text in the form, parsed to number|undefined on submit
};

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-2.5 text-[14px] transition focus:border-green";

/**
 * Editor for an event's ticket types (SPEC.md Section 8: free + paid +
 * early-bird tiers, optional quantity cap). Paid tickets don't collect a
 * host-pasted payment link here -- registrants pay the host directly by
 * UPI, using whatever UPI ID/QR code the host sets in the payment details
 * section below (only shown once a ticket here has a price).
 * Mirrors FormBuilder's list-editor shape but for a different field set --
 * kept separate rather than generalizing FormBuilder further since ticket
 * types aren't part of the unified form-field system.
 */
export function TicketTypeBuilder({
  tickets,
  onChange,
}: {
  tickets: TicketTypeDraft[];
  onChange: (tickets: TicketTypeDraft[]) => void;
}) {
  function addTicket() {
    onChange([...tickets, { name: tickets.length === 0 ? "General" : "", price: 0, quantity_available: "" }]);
  }

  function updateTicket(i: number, patch: Partial<TicketTypeDraft>) {
    onChange(tickets.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function removeTicket(i: number) {
    onChange(tickets.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-4">
      {tickets.map((t, i) => (
        <div key={i} className="card-elevated rounded-card bg-bg2 p-4">
          <div className="flex items-start gap-2">
            <input
              value={t.name}
              onChange={(e) => updateTicket(i, { name: e.target.value })}
              placeholder="Ticket name, e.g. General, Early Bird, VIP"
              className={`flex-1 ${inputClass}`}
            />
            {tickets.length > 1 && (
              <button
                type="button"
                onClick={() => removeTicket(i)}
                aria-label="Remove ticket type"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border2 text-text3 transition hover:border-pink hover:text-pink"
              >
                <IconTrash size={14} />
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text3">Price (₹, 0 = free)</span>
              <input
                type="number"
                min={0}
                value={t.price}
                onChange={(e) => updateTicket(i, { price: Number(e.target.value) || 0 })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text3">Quantity (optional)</span>
              <input
                type="number"
                min={1}
                value={t.quantity_available}
                onChange={(e) => updateTicket(i, { quantity_available: e.target.value })}
                placeholder="Unlimited"
                className={inputClass}
              />
            </label>
          </div>

          {t.price > 0 && (
            <p className="mt-3 text-[11px] text-text3">
              Registrants pay you directly by UPI -- add your UPI ID/QR code below, no link to paste here.
            </p>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addTicket}
        className="flex items-center justify-center gap-2 rounded-card-sm border border-dashed border-border2 py-3 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
      >
        <IconPlus size={14} />
        Add ticket type
      </button>
    </div>
  );
}
