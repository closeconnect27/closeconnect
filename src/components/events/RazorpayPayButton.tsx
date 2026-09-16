"use client";

import { useState } from "react";
import { loadRazorpayCheckout } from "@/lib/loadRazorpayCheckout";
import { createRazorpayOrderForRegistration, verifyRazorpayPayment } from "@/app/actions/events";

// The primary paid-ticket path -- instant, no host action needed, unlike
// the manual-UPI fallback (EventRegistration's own reference-number form)
// which still exists alongside this for events where the registrant would
// rather not use a card/UPI-app checkout modal. amountRupees is display
// only; the amount actually charged is recomputed server-side in
// createRazorpayOrderForRegistration from the registration's own stored
// ticket_type_id/quantity, never trusted from here.
export function RazorpayPayButton({
  eventId,
  registrationId,
  amountRupees,
  registrantName,
  email,
  onSuccess,
}: {
  eventId: string;
  registrationId: string;
  amountRupees: number;
  registrantName: string;
  email?: string;
  onSuccess: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    setError("");
    setPending(true);

    const Razorpay = await loadRazorpayCheckout();
    if (!Razorpay) {
      setError("Could not load the payment window -- check your connection and try again.");
      setPending(false);
      return;
    }

    const order = await createRazorpayOrderForRegistration(eventId, registrationId);
    if (order.error || !order.orderId || !order.keyId) {
      setError(order.error ?? "Could not start payment");
      setPending(false);
      return;
    }

    const rzp = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "CloseConnect",
      description: "Event ticket",
      prefill: { name: registrantName, email },
      theme: { color: "#5dcaa5" },
      handler: async (response) => {
        const result = await verifyRazorpayPayment(eventId, registrationId, {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
        setPending(false);
        if (result.error) setError(result.error);
        else onSuccess();
      },
      // Fires when the registrant closes the modal without paying -- not
      // an error, just un-stick the button so they can try again.
      modal: {
        ondismiss: () => setPending(false),
      },
    });

    rzp.on("payment.failed", (response) => {
      setError(response.error?.description ?? "Payment failed -- please try again");
      setPending(false);
    });

    rzp.open();
  }

  return (
    <div>
      <button type="button" onClick={handlePay} disabled={pending} className="btn-primary w-full py-3 text-[14px]">
        {pending ? "Opening payment window…" : `Pay ₹${amountRupees} now`}
      </button>
      {error && <p className="mt-2 text-[13px] text-pink">{error}</p>}
    </div>
  );
}
