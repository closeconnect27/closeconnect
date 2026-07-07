"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCircleCheck } from "@tabler/icons-react";
import { DynamicForm } from "@/components/forms/DynamicForm";
import { registerForEvent } from "@/app/actions/events";
import type { FormField } from "@/lib/queries/membership";
import type { EventTicketType } from "@/lib/queries/events";
import { safePaymentHref } from "@/lib/validators/links";

// Registration requires a real account (SPEC.md's earlier guest-friendly
// decision is deliberately reversed -- see Section 9 of the redesign brief):
// legitimacy/security won out over convenience. Email now comes from the
// signed-in session server-side, never a client-editable field -- name
// stays editable since a registrant may reasonably check someone else in
// under a different name than their account's. Paid tickets hand off to
// the ticket's own payment link rather than collecting payment here -- real
// checkout/webhook handling is a later phase (SPEC.md Section 8).
export function EventRegistration({
  eventId,
  ticketTypes,
  formFields,
  availability,
  isLoggedIn,
  email,
}: {
  eventId: string;
  ticketTypes: EventTicketType[];
  formFields: FormField[];
  availability: Map<string, number>;
  isLoggedIn: boolean;
  email?: string;
}) {
  const router = useRouter();
  const [ticketTypeId, setTicketTypeId] = useState(ticketTypes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const selectedTicket = ticketTypes.find((t) => t.id === ticketTypeId);
  const isSoldOut = (t: EventTicketType) =>
    t.quantity_available != null && (availability.get(t.id) ?? 0) >= t.quantity_available;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!ticketTypeId) {
      setError("Choose a ticket type");
      return;
    }
    startTransition(async () => {
      const result = await registerForEvent(eventId, { ticket_type_id: ticketTypeId, name, answers });
      if (result?.error) setError(result.error);
      else setDone(true);
    });
  }

  if (!isLoggedIn) {
    return (
      <div className="card-elevated flex flex-col items-center gap-3 rounded-card bg-bg2 p-6 text-center">
        <p className="text-[13px] text-text2">Sign in to register for this event.</p>
        <button
          onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/events/${eventId}`)}`)}
          className="btn-primary px-6 py-2.5 text-[14px]"
        >
          Sign in to register
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card-elevated rounded-card bg-bg2 p-6 text-center">
        <IconCircleCheck size={32} className="mx-auto mb-2 text-green" />
        <p className="text-[15px] font-bold text-text">You&apos;re registered!</p>
        <p className="mt-1 text-[13px] text-text2">
          {selectedTicket && selectedTicket.price > 0
            ? "Finish payment via the ticket link to confirm your spot."
            : "A confirmation has been sent to your email."}
        </p>
        {selectedTicket && selectedTicket.price > 0 && selectedTicket.payment_link && (
          <a
            href={safePaymentHref(selectedTicket.payment_link)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-4 px-6 py-2.5 text-[13px]"
          >
            Pay ₹{selectedTicket.price} for {selectedTicket.name}
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card-elevated flex flex-col gap-4 rounded-card bg-bg2 p-5">
      <h3 className="font-heading text-[14px] font-bold">Register</h3>

      {ticketTypes.length > 1 ? (
        <div className="flex flex-col gap-2">
          {ticketTypes.map((t) => {
            const soldOut = isSoldOut(t);
            const remaining = t.quantity_available != null ? t.quantity_available - (availability.get(t.id) ?? 0) : null;
            return (
              <button
                type="button"
                key={t.id}
                disabled={soldOut}
                onClick={() => setTicketTypeId(t.id)}
                className={`flex items-center justify-between rounded-card-sm border px-4 py-3 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  ticketTypeId === t.id ? "border-green bg-green-tint" : "border-border2 hover:border-green"
                }`}
              >
                <span>
                  <span className="font-bold text-text">{t.name}</span>
                  {remaining != null && !soldOut && (
                    <span className="ml-2 text-[11px] text-text3">{remaining} left</span>
                  )}
                  {soldOut && <span className="ml-2 text-[11px] text-pink">Sold out</span>}
                </span>
                <span className="font-bold text-green">{t.price === 0 ? "Free" : `₹${t.price}`}</span>
              </button>
            );
          })}
        </div>
      ) : (
        selectedTicket && (
          <p className="text-[13px] text-text2">
            {selectedTicket.name} · <span className="font-bold text-green">{selectedTicket.price === 0 ? "Free" : `₹${selectedTicket.price}`}</span>
          </p>
        )
      )}

      <label className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-text">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-text">Email</span>
        <p className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] text-text2">{email}</p>
      </div>

      {formFields.length > 0 && <DynamicForm fields={formFields} values={answers} onChange={setAnswers} />}

      {error && <p className="text-[13px] text-pink">{error}</p>}

      <button
        type="submit"
        disabled={pending || !ticketTypeId || (selectedTicket ? isSoldOut(selectedTicket) : false)}
        className="btn-primary py-3 text-[14px]"
      >
        {pending ? "Registering…" : "Register"}
      </button>
    </form>
  );
}
