"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCircleCheck, IconBrandGoogle, IconDownload } from "@tabler/icons-react";
import { DynamicForm } from "@/components/forms/DynamicForm";
import { registerForEvent } from "@/app/actions/events";
import { RazorpayPayButton } from "@/components/events/RazorpayPayButton";
import { CancelBookingButton } from "@/components/events/CancelBookingButton";
import type { FormField } from "@/lib/queries/membership";
import type { EventTicketType, MyEventRegistration, EventAddon } from "@/lib/queries/events";
import { CancellationPolicyText } from "@/components/events/CancellationPolicyBuilder";
import type { CancellationPolicySnapshot } from "@/lib/eventCancellation";
import { FaqAccordion } from "@/components/events/FaqAccordion";
import type { EventFaq } from "@/lib/eventFaqs";

// Registration requires a real account (SPEC.md's earlier guest-friendly
// decision is deliberately reversed -- see Section 9 of the redesign brief):
// legitimacy/security won out over convenience. Email and name now both come
// from the signed-in session/profile server-side, never client-editable
// fields -- a signed-in registrant is never asked to retype who they are.
// Paid tickets pay through Razorpay Standard Checkout (RazorpayPayButton)
// right in this same visit -- the platform's one Razorpay account takes it
// regardless of host, so no per-host payment setup exists anymore (see
// 0086's own history).
export function EventRegistration({
  eventId,
  ticketTypes,
  formFields,
  availability,
  isLoggedIn,
  email,
  displayName,
  alreadyRegisteredCount = 0,
  initialRegistration = null,
  calendarLink,
  cancellationPolicy,
  faqs = [],
  addons = [],
}: {
  eventId: string;
  ticketTypes: EventTicketType[];
  formFields: FormField[];
  availability: Map<string, number>;
  isLoggedIn: boolean;
  email?: string;
  // The signed-in user's own profiles.display_name -- used as the
  // registration's name with no separate input, same reasoning as email
  // above. Falls back to the email's local-part if a profile somehow has no
  // display_name yet, so registerForEvent never receives an empty string.
  displayName?: string | null;
  // Duplicate registrations are allowed at the DB level (0059) -- this is
  // just what triggers the "you've already registered, register again?"
  // confirmation instead of silently resubmitting.
  alreadyRegisteredCount?: number;
  // The viewer's most recent registration for this event, if any --
  // reconstructs the post-registration/post-payment view below on initial
  // render instead of always starting from the blank form (see done/
  // registrationId/razorpayPaid init below).
  initialRegistration?: MyEventRegistration | null;
  // Same link as the page-level "Add to Calendar" button (computed once in
  // the parent page and passed down) -- null whenever there's no real date
  // yet or the event's cancelled.
  calendarLink?: string | null;
  cancellationPolicy: CancellationPolicySnapshot;
  // Section 39: accessible from checkout without abandoning it -- an
  // inline collapsible, not a separate page navigation. Defaults to []
  // for any caller that hasn't been updated to pass it, same fallback
  // pattern initialRegistration/calendarLink already use.
  faqs?: EventFaq[];
  addons?: EventAddon[];
}) {
  const router = useRouter();
  const [showFaqs, setShowFaqs] = useState(false);
  const [ticketTypeId, setTicketTypeId] = useState(initialRegistration?.ticket_type_id ?? ticketTypes[0]?.id ?? "");
  const name = displayName?.trim() || email?.split("@")[0] || "";
  const [quantity, setQuantity] = useState(1);
  // addon_id -> quantity, only present for add-ons the customer actually
  // selected (0 quantity is just "not selected", never sent to the server).
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(!!initialRegistration);
  const [registrationId, setRegistrationId] = useState<string | null>(initialRegistration?.id ?? null);
  const [razorpayPaid, setRazorpayPaid] = useState(initialRegistration?.payment_status === "paid");
  const [confirmingReRegister, setConfirmingReRegister] = useState(false);
  const [policyAcknowledged, setPolicyAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();

  const selectedTicket = ticketTypes.find((t) => t.id === ticketTypeId);
  const isSoldOut = (t: EventTicketType) =>
    t.quantity_available != null && (availability.get(t.id) ?? 0) >= t.quantity_available;
  const remainingForSelected =
    selectedTicket?.quantity_available != null
      ? selectedTicket.quantity_available - (availability.get(selectedTicket.id) ?? 0)
      : null;
  const maxQuantity = Math.min(10, remainingForSelected ?? 10);
  const addonsTotal = addons.reduce((sum, a) => sum + a.price * (selectedAddons[a.id] ?? 0), 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!ticketTypeId) {
      setError("Choose a ticket type");
      return;
    }
    // Section 8: payment (or, for a free ticket, registration itself)
    // can't proceed until this is checked -- enforced here, not just by
    // disabling the submit button, so a form submitted some other way
    // (e.g. pressing Enter) can't bypass it either.
    if (!policyAcknowledged) {
      setError("Please acknowledge the cancellation & refund policy to continue.");
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
      const result = await registerForEvent(eventId, {
        ticket_type_id: ticketTypeId,
        name,
        answers,
        quantity,
        addons: Object.entries(selectedAddons)
          .filter(([, qty]) => qty > 0)
          .map(([addon_id, qty]) => ({ addon_id, quantity: qty })),
      });
      if (result?.error) {
        setError(result.error);
        setConfirmingReRegister(false);
      } else {
        setRegistrationId(result.registrationId ?? null);
        setDone(true);
      }
    });
  }

  if (!isLoggedIn) {
    // Ticket prices render here too, not just post-login -- a signed-out
    // visitor (or an automated crawler, e.g. a payment-gateway reviewer
    // checking the site actually prices in INR) should be able to see what
    // an event costs without an account; only the act of registering stays
    // gated. Read-only (no onClick/select state -- that only exists in the
    // logged-in form below), so this is just the same ₹ price list, static.
    return (
      <div className="card-elevated flex flex-col gap-3 rounded-card bg-bg2 p-6">
        {ticketTypes.length > 0 && (
          <div className="flex flex-col gap-2">
            {ticketTypes.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-card-sm border border-border2 px-4 py-3 text-left text-[13px]"
              >
                <span className="font-bold text-text">{t.name}</span>
                <span className="font-bold text-green">{t.price === 0 ? "Free" : `₹${t.price}`}</span>
              </div>
            ))}
          </div>
        )}
        {addons.length > 0 && (
          <div className="flex flex-col gap-2">
            {addons.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-card-sm border border-border2 px-4 py-3 text-left text-[13px]">
                <span className="text-text2">{a.name}</span>
                <span className="font-bold text-green">+₹{a.price}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col items-center gap-3 pt-1 text-center">
          <p className="text-[13px] text-text2">Sign in to register for this event.</p>
          <button
            onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/events/${eventId}`)}`)}
            className="btn-primary px-6 py-2.5 text-[14px]"
          >
            Sign in to register
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    // A previously-cancelled registration (the most recent one for this
    // event, per getMyLatestRegistration) shows its own terminal state --
    // never the registration form again (re-registering is still possible,
    // but through the normal "no active registration" path below, not by
    // silently resurrecting a cancelled one) and never "You're registered!"
    // for a booking that's explicitly not active anymore.
    if (initialRegistration?.status === "cancelled") {
      return (
        <div className="card-elevated rounded-card bg-bg2 p-6 text-center">
          <p className="text-[15px] font-bold text-text">Booking cancelled</p>
          {initialRegistration.refund_amount_paise != null && initialRegistration.refund_amount_paise > 0 ? (
            <p className="mt-1 text-[13px] text-text2">
              Refund of ₹{(initialRegistration.refund_amount_paise / 100).toLocaleString("en-IN")}{" "}
              {initialRegistration.refund_status === "processed" ? "has been processed." : initialRegistration.refund_status === "failed" ? "failed -- contact support@closeconnect.in." : "is on its way."}
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-text2">No refund applied, per this event&apos;s cancellation policy.</p>
          )}
        </div>
      );
    }

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
          <div className="mt-4 flex flex-col items-center gap-2">
            <DownloadTicketButton registrationId={registrationId} />
            <AddToCalendarButton calendarLink={calendarLink} />
            {registrationId && <CancelBookingButton registrationId={registrationId} />}
          </div>
        </div>
      );
    }

    // A Razorpay-verified signature IS the payment confirmation -- same
    // success state as a free ticket, arriving the moment checkout clears
    // instead of instantly.
    if (razorpayPaid) {
      return (
        <div className="card-elevated rounded-card bg-bg2 p-6 text-center">
          <IconCircleCheck size={32} className="mx-auto mb-2 text-green" />
          <p className="text-[15px] font-bold text-text">You&apos;re registered!</p>
          <p className="mt-1 text-[13px] text-text2">A confirmation has been sent to your email.</p>
          <div className="mt-4 flex flex-col items-center gap-2">
            <DownloadTicketButton registrationId={registrationId} />
            <AddToCalendarButton calendarLink={calendarLink} />
            {registrationId && <CancelBookingButton registrationId={registrationId} />}
          </div>
        </div>
      );
    }

    return (
      <div className="card-elevated flex flex-col gap-4 rounded-card bg-bg2 p-6 text-center">
        <div>
          <IconCircleCheck size={32} className="mx-auto mb-2 text-green" />
          <p className="text-[15px] font-bold text-text">Your spot is reserved</p>
          <p className="mt-1 text-[13px] text-text2">Complete payment to confirm it.</p>
        </div>

        <RazorpayPayButton
          eventId={eventId}
          registrationId={registrationId!}
          amountRupees={selectedTicket.price * quantity}
          registrantName={name}
          email={email}
          onSuccess={() => setRazorpayPaid(true)}
        />

        <AddToCalendarButton calendarLink={calendarLink} />
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

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-text">Name</span>
        <p className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] text-text2">{name}</p>
      </div>

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

      {addons.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-text">Add-ons (optional)</span>
          <div className="flex flex-col gap-2">
            {addons.map((a) => {
              const remaining = a.quantity_available != null ? a.quantity_available : null;
              const qty = selectedAddons[a.id] ?? 0;
              return (
                <div key={a.id} className="flex items-center justify-between rounded-card-sm border border-border2 px-4 py-3 text-[13px]">
                  <span>
                    <span className="font-bold text-text">{a.name}</span>
                    <span className="ml-2 text-text3">₹{a.price}</span>
                    {remaining != null && <span className="ml-2 text-[11px] text-text3">{remaining} left</span>}
                    {!a.is_refundable && <span className="ml-2 text-[11px] text-text3">· non-refundable</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAddons((prev) => ({ ...prev, [a.id]: Math.max(0, (prev[a.id] ?? 0) - 1) }))}
                      disabled={qty <= 0}
                      aria-label={`Fewer ${a.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-bold text-text">{qty}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedAddons((prev) => ({ ...prev, [a.id]: Math.min(10, (prev[a.id] ?? 0) + 1) }))}
                      disabled={remaining != null ? qty >= remaining : qty >= 10}
                      aria-label={`More ${a.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {addonsTotal > 0 && <span className="text-[13px] text-text3">₹{addonsTotal} in add-ons</span>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-text">Email</span>
        <p className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] text-text2">{email}</p>
      </div>

      {formFields.length > 0 && <DynamicForm fields={formFields} values={answers} onChange={setAnswers} />}

      {faqs.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowFaqs((v) => !v)} className="text-[13px] font-medium text-green hover:underline">
            {showFaqs ? "Hide event FAQs" : "Questions about this event? View event FAQs"}
          </button>
          {showFaqs && (
            <div className="mt-2">
              <FaqAccordion faqs={faqs} eventId={eventId} />
            </div>
          )}
        </div>
      )}

      <div className="rounded-card-sm border border-border2 bg-bg3 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text3">Cancellation &amp; Refund Policy</p>
        <CancellationPolicyText enabled={cancellationPolicy.enabled} rules={cancellationPolicy.rules} />
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] text-text2">
          <input type="checkbox" checked={policyAcknowledged} onChange={(e) => setPolicyAcknowledged(e.target.checked)} className="mt-0.5" />
          I have read and agree to the cancellation and refund policy.
        </label>
      </div>

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
          disabled={pending || !ticketTypeId || !policyAcknowledged || (selectedTicket ? isSoldOut(selectedTicket) : false)}
          className="btn-primary py-3 text-[14px]"
        >
          {pending ? "Registering…" : "Register"}
        </button>
      )}
    </form>
  );
}

// Shown on every post-registration success state above (free-ticket
// confirmed, spot reserved, payment submitted) -- same link as the
// page-level button in the parent page, just surfaced right where a
// registrant actually sees "you're in" instead of only in the follow-up
// email.
function AddToCalendarButton({ calendarLink }: { calendarLink?: string | null }) {
  if (!calendarLink) return null;
  return (
    <a href={calendarLink} target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center px-4 py-2 text-[13px]">
      <IconBrandGoogle size={14} />
      Add to Calendar
    </a>
  );
}

// Shared with the profile page's RegisteredEventRow -- same PDF endpoint
// (src/app/api/tickets/[id]/route.ts), same button, wherever a confirmed
// registration is shown. A plain <a> (not a fetch+blob download) so the
// browser's own download UI handles it and the request rides on the
// visitor's existing session cookie automatically.
export function DownloadTicketButton({ registrationId }: { registrationId: string | null }) {
  if (!registrationId) return null;
  return (
    <a href={`/api/tickets/${registrationId}`} className="btn-secondary justify-center px-4 py-2 text-[13px]">
      <IconDownload size={14} />
      Download ticket
    </a>
  );
}
