// One platform-wide Razorpay account (0065's own description) -- every
// ticket payment lands here regardless of host; forwarding a host their
// share happens entirely outside the app (see payout_status). Plain
// fetch() + Web Crypto, not the `razorpay` npm SDK -- this app deploys to
// Cloudflare Workers via OpenNext, and a fetch-based call is what already
// works there for every other external API (see sendEmail/Resend), rather
// than trusting a Node-oriented SDK's HTTP/crypto internals under Workers'
// nodejs_compat layer for something this simple.
const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function authHeader() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured (missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET)");
  }
  // key_id/key_secret are always plain ASCII, so a plain btoa is fine here
  // -- no need for a UTF-8-safe base64 helper.
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

export type RazorpayOrder = { id: string; amount: number; currency: string };

/** Amount is in the smallest currency unit (paise for INR) -- Razorpay's
 * own convention, not this app's usual rupee-integer ticket prices, so
 * every caller must convert before reaching here. Throws (doesn't return
 * null) on failure so a caller's try/catch sees a real rejection, same
 * posture as sendEmail. */
export async function createRazorpayOrder(params: { amountPaise: number; currency: string; receipt: string }): Promise<RazorpayOrder> {
  const res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt,
    }),
  });

  if (res.status === 401) {
    throw new Error("Razorpay authentication failed -- check RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay order creation failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { id: string; amount: number; currency: string };
  return { id: data.id, amount: data.amount, currency: data.currency };
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Both strings are fixed-length hex digests from the same algorithm when
// legitimate -- a length check up front, then an accumulate-not-
// short-circuit XOR compare, so a forged signature can't be narrowed down
// one byte at a time via response timing.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256("<order_id>|<payment_id>", key_secret), hex-encoded, compared
 * against Razorpay's own signature -- exactly the algorithm Razorpay's docs
 * specify for verifying a Standard Checkout success callback. Web Crypto
 * (crypto.subtle), not node:crypto, so this runs identically under `next
 * dev` and the deployed Cloudflare Worker without depending on the
 * nodejs_compat layer for a primitive this simple. */
export async function verifyRazorpaySignature(params: { orderId: string; paymentId: string; signature: string }): Promise<boolean> {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw new Error("Razorpay is not configured (missing RAZORPAY_KEY_SECRET)");
  const computed = await hmacSha256Hex(`${params.orderId}|${params.paymentId}`, keySecret);
  return constantTimeEqual(computed, params.signature);
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook secret) --
 * a DIFFERENT scheme and a DIFFERENT secret than the checkout signature
 * above (Razorpay's own docs: "pass the raw webhook request body without
 * parsing or casting it"). rawBody must be the exact bytes/string Razorpay
 * sent, read before any JSON.parse -- re-serializing the parsed JSON could
 * reorder keys or change whitespace and silently break every signature. */
export async function verifyRazorpayWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("Razorpay is not configured (missing RAZORPAY_WEBHOOK_SECRET)");
  const computed = await hmacSha256Hex(rawBody, webhookSecret);
  return constantTimeEqual(computed, signature);
}
