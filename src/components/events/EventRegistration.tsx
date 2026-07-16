"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCircleCheck } from "@tabler/icons-react";
import { DynamicForm } from "@/components/forms/DynamicForm";
import { registerForEvent, submitPaymentReference } from "@/app/actions/events";
import type { FormField } from "@/lib/queries/membership";
import type { EventTicketType } from "@/lib/queries/events";

// Registration requires a real account (SPEC.md's earlier guest-friendly
// decision is deliberately reversed -- see Section 9 of the redesign brief):
// legitimacy/security won out over convenience. Email now comes from the
// signed-in session server-side, never a client-editable field -- name
// stays editable since a registrant may reasonably check someone else in
// under a different name than their account's. Paid tickets show the
// host's own UPI QR/ID and collect a payment reference for the host to
// manually confirm (registerForEvent/submitPaymentReference in
// app/actions/events.ts) -- not a Razorpay checkout link; the platform's
// Razorpay account was rejected.
export function EventRegistration({
  eventId,
  ticketTypes,
  formFields,
  availability,
  isLoggedIn,
  email,
  alreadyRegisteredCount = 0,
}: {
  eventId: string;
  ticketTypes: EventTicketType[];
  formFields: FormField[];
  availability: Map<string, number>;
  isLoggedIn: boolean;
  email?: string;
  // Duplicate registrations are allowed at the DB level (0059) -- this is
  // just what triggers the "you've already registered, register again?"
  // confirmation instead of silently resubmitting.
  alreadyRegisteredCount?: number;
}) {
  const router = useRouter();
  const [ticketTypeId, setTicketTypeId] = useState(ticketTypes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [hostUpi, setHostUpi] = useState<{ upiId: string | null; qrImageUrl: string | null } | null>(null);
  const [reference, setReference] = useState("");
  const [referenceSubmitted, setReferenceSubmitted] = useState(false);
  const [confirmingReRegister, setConfirmingReRegister] = useState(false);
  const [pending, startTransition] = useTransition();
  const [referencePending, startReferenceTransition] = useTransition();

  const selectedTicket = ticketTypes.find((t) => t.id === ticketTypeId);
  const isSoldOut = (t: EventTicketType) =>
    t.quantity_available != null && (availability.get(t.id) ?? 0) >= t.quantity_available;
  const remainingForSelected =
    selectedTicket?.quantity_available != null
      ? selectedTicket.quantity_available - (availability.get(selectedTicket.id) ?? 0)
      : null;
  const maxQuantity = Math.min(10, remainingForSelected ?? 10);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!ticketTypeId) {
      setError("Choose a ticket type");
      return;
    }
    if (alreadyRegisteredCount > 0 && !confirmingReRegister) {
      setConfirmingReRegister(true);
      return;
    }
    submitRegistration();
  }

  function submitRegistration() {
    startTransition(async () => {
      const result = await registerForEvent(eventId, { ticket_type_id: ticketTypeId, name, answers, quantity });
      if (result?.error) {
        setError(result.error);
        setConfirmingReRegister(false);
      } else {
        setRegistrationId(result.registrationId ?? null);
        setHostUpi(result.hostUpi ?? null);
        setDone(true);
      }
    });
  }

  function submitReference(e: React.FormEvent) {
    e.preventDefault();
    if (!registrationId || !reference.trim()) return;
    setError("");
    startReferenceTransition(async () => {
      const result = await submitPaymentReference(eventId, registrationId, reference);
      if (result?.error) setError(result.error);
      else setReferenceSubmitted(true);
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
    // Narrows selectedTicket to non-undefined/price>0 for everything below
    // -- isPaidTicket as a plain boolean (the previous shape here) doesn't
    // carry that narrowing through to selectedTicket.price at JSX-build
    // time, so this stays an early-return guard rather than a derived flag.
    if (!selectedTicket || selectedTicket.price === 0) {
      return (
        <div className="card-elevated rounded-card bg-bg2 p-6 text-center">
          <IconCircleCheck size={32} className="mx-auto mb-2 text-green" />
          <p className="text-[15px] font-bold text-text">You&apos;re registered!</p>
          <p className="mt-1 text-[13px] text-text2">A confirmation has been sent to your email.</p>
        </div>
      );
    }

    if (!hostUpi?.upiId && !hostUpi?.qrImageUrl) {
      return (
        <div className="card-elevated rounded-card bg-bg2 p-6 text-center">
          <IconCircleCheck size={32} className="mx-auto mb-2 text-green" />
          <p className="text-[15px] font-bold text-text">Your spot is reserved</p>
          <p className="mt-1 text-[13px] text-text2">
            The organizer hasn&apos;t set up payment details yet -- contact them directly to complete payment.
          </p>
        </div>
      );
    }

    if (!referenceSubmitted) {
      return (
        <div className="card-elevated flex flex-col gap-4 rounded-card bg-bg2 p-6 text-center">
          <div>
            <IconCircleCheck size={32} className="mx-auto mb-2 text-green" />
            <p className="text-[15px] font-bold text-text">Your spot is reserved</p>
            <p className="mt-1 text-[13px] text-text2">
              Pay ₹{selectedTicket.price * quantity} by UPI, then tell us the reference number below to confirm it.
            </p>
          </div>

          {hostUpi?.qrImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- storage public URL, not a static remote pattern next/image can optimize
            <img
              src={hostUpi.qrImageUrl}
              alt="Payment QR code"
              className="mx-auto h-44 w-44 rounded-card-sm border border-border2 object-contain"
            />
          )}
          {hostUpi?.upiId && (
            <p className="text-[14px] text-text2">
              UPI ID: <span className="font-bold text-text">{hostUpi.upiId}</span>
            </p>
          )}

          <form onSubmit={submitReference} className="flex flex-col gap-2 text-left">
            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-text">Payment reference / UTR number</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. 123456789012"
                required
                className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
              />
            </label>
            {error && <p className="text-[13px] text-pink">{error}</p>}
            <button type="submit" disabled={referencePending} className="btn-primary py-3 text-[14px]">
              {referencePending ? "Submitting…" : "I've paid -- submit reference"}
            </button>
          </form>
        </div>
      );
    }

    return (
      <div className="card-elevated rounded-card bg-bg2 p-6 text-center">
        <IconCircleCheck size={32} className="mx-auto mb-2 text-green" />
        <p className="text-[15px] font-bold text-text">Payment submitted</p>
        <p className="mt-1 text-[13px] text-text2">
          The organizer will confirm your payment shortly -- you&apos;ll get an email once it&apos;s done.
        </p>
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
                onClick={() => {
                  setTicketTypeId(t.id);
                  setQuantity(1);
                }}
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

      <label className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-text">
          Number of tickets{remainingForSelected != null && ` (${remainingForSelected} left)`}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Fewer tickets"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-40"
          >
            −
          </button>
          <span className="w-8 text-center text-[15px] font-bold text-text">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            disabled={quantity >= maxQuantity}
            aria-label="More tickets"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-40"
          >
            +
          </button>
          {selectedTicket && selectedTicket.price > 0 && quantity > 1 && (
            <span className="text-[13px] text-text3">₹{selectedTicket.price * quantity} total</span>
          )}
        </div>
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-text">Email</span>
        <p className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] text-text2">{email}</p>
      </div>

      {formFields.length > 0 && <DynamicForm fields={formFields} values={answers} onChange={setAnswers} />}

      {error && <p className="text-[13px] text-pink">{error}</p>}

      {confirmingReRegister ? (
        <div className="flex flex-col gap-2 rounded-card-sm border border-border2 bg-bg3 p-3">
          <p className="text-[13px] text-text2">
            You&apos;ve already registered for this event. Register again?
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-[13px]">
              {pending ? "Registering…" : "Yes, register again"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReRegister(false)}
              className="btn-secondary px-4 py-2 text-[13px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={pending || !ticketTypeId || (selectedTicket ? isSoldOut(selectedTicket) : false)}
          className="btn-primary py-3 text-[14px]"
        >
          {pending ? "Registering…" : "Register"}
        </button>
      )}
    </form>
  );
}
