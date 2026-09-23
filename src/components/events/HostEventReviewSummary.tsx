import type { EventTicketType, EventAddon } from "@/lib/queries/events";
import type { FormField } from "@/lib/queries/membership";

// A host viewing their own event's detail page never saw the registration
// checkout block (EventRegistration is swapped for a "see Manage" message),
// which was the ONLY place ticket types, add-ons and registration questions
// rendered -- so a host had no way to confirm what they'd actually saved.
// This is a read-only summary of the same data, host-only.
export function HostEventReviewSummary({
  ticketTypes,
  addons,
  formFields,
}: {
  ticketTypes: EventTicketType[];
  addons: EventAddon[];
  formFields: FormField[];
}) {
  if (ticketTypes.length === 0 && addons.length === 0 && formFields.length === 0) return null;

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-card-sm border border-border bg-bg2 p-4">
      <h3 className="font-heading text-[13px] font-bold">What attendees will see</h3>

      {ticketTypes.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wide text-text3">Ticket types</span>
          <div className="flex flex-col gap-1.5">
            {ticketTypes.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-[13px]">
                <span className="text-text">{t.name}</span>
                <span className="text-text3">
                  {t.price > 0 ? `₹${t.price}` : "Free"}
                  {t.quantity_available != null && ` · ${t.quantity_available} available`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {addons.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wide text-text3">Add-ons</span>
          <div className="flex flex-col gap-1.5">
            {addons.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-[13px]">
                <span className="text-text">
                  {a.name}
                  {!a.is_active && <span className="ml-2 text-[11px] text-text3">(inactive)</span>}
                </span>
                <span className="text-text3">
                  ₹{a.price}
                  {a.quantity_available != null && ` · ${a.quantity_available} available`}
                  {!a.is_refundable && " · non-refundable"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {formFields.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wide text-text3">Registration questions</span>
          <div className="flex flex-col gap-1.5">
            {formFields.map((f) => (
              <div key={f.id} className="text-[13px] text-text">
                {f.label}
                {f.is_required && <span className="ml-1 text-text3">(required)</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
