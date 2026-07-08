import crypto from "crypto";

// Single platform-wide Razorpay account (RAZORPAY_KEY_ID/SECRET), per
// explicit product decision -- all ticket payments flow through this one
// account, not a per-organizer connection. Server-only; never imported
// into client code.

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function authHeader() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

export type CreatePaymentLinkResult = { url: string; paymentLinkId: string } | { error: string };

/** Creates a Razorpay Payment Link scoped to one registration via
 * reference_id -- this is what the webhook matches back to a specific
 * form_responses row (see app/api/webhooks/razorpay/route.ts). Razorpay's
 * Payment Links API (POST /v1/payment_links) accepts reference_id (a
 * caller-supplied unique string, echoed back on the payment_link entity in
 * every webhook event for it) for exactly this purpose, plus a notes
 * object as a secondary/backup channel for the same id. amount is in
 * paise (smallest currency unit), matching Razorpay's own convention. */
export async function createPaymentLink({
  registrationId,
  amountRupees,
  description,
  customerName,
  customerEmail,
}: {
  registrationId: string;
  amountRupees: number;
  description: string;
  customerName: string;
  customerEmail: string;
}): Promise<CreatePaymentLinkResult> {
  const auth = authHeader();
  if (!auth) {
    return { error: "Payment setup is not configured. Contact the organizer." };
  }

  const res = await fetch(`${RAZORPAY_API_BASE}/payment_links`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(amountRupees * 100),
      currency: "INR",
      description,
      reference_id: registrationId,
      notes: { registration_id: registrationId },
      customer: { name: customerName, email: customerEmail },
      notify: { sms: false, email: false },
      reminder_enable: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Razorpay payment link creation failed: ${res.status} ${body}`);
    return { error: "Could not set up payment. Try again shortly." };
  }

  const data = (await res.json()) as { short_url: string; id: string };
  return { url: data.short_url, paymentLinkId: data.id };
}

/** Verifies X-Razorpay-Signature against the raw request body using
 * RAZORPAY_WEBHOOK_SECRET -- HMAC-SHA256, per Razorpay's documented
 * webhook verification scheme. Never process a webhook payload before
 * this passes; the signature is the only thing standing between "a real
 * Razorpay event" and "anyone who found the endpoint URL". Uses a
 * constant-time comparison (timingSafeEqual) rather than `===` so this
 * check itself can't leak the correct signature through response-timing
 * differences. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
