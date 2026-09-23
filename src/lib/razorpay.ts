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

/** GET /v1/payments/{id} -- fee/tax Razorpay actually charged for this
 * specific payment, in paise. Used by organizerSettlement.ts to deduct the
 * REAL gateway charge per transaction (terms/page.tsx: "hosts receive the
 * full ticket price collected, less any payment gateway processing
 * charges") rather than an estimated/invented percentage -- Razorpay knows
 * the exact number per payment (it varies by payment method), this app
 * doesn't need to guess it. */
export async function getRazorpayPaymentFee(paymentId: string): Promise<{ feePaise: number; taxPaise: number }> {
  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`Razorpay payment lookup failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { fee: number | null; tax: number | null };
  return { feePaise: data.fee ?? 0, taxPaise: data.tax ?? 0 };
}

export type RazorpayRefund = { id: string; status: string };

/** POST /v1/payments/{id}/refund -- a partial refund (amountPaise less than
 * the original payment) is fully supported by Razorpay's API as-is, just
 * by passing a smaller `amount`; omitting `amount` entirely would refund
 * the full original payment, so every caller here always passes it
 * explicitly, computed server-side (calculateCancellationRefund), never
 * trusted from a request body. Same plain-fetch posture as
 * createRazorpayOrder, and same "throw on failure" contract. */
export async function createRazorpayRefund(params: { paymentId: string; amountPaise: number; notes?: Record<string, string> }): Promise<RazorpayRefund> {
  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${params.paymentId}/refund`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      notes: params.notes,
    }),
  });

  if (res.status === 401) {
    throw new Error("Razorpay authentication failed -- check RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay refund failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { id: string; status: string };
  return { id: data.id, status: data.status };
}

// ===========================================================================
// ORGANIZER PAYOUTS -- Razorpay's Contact / Fund Account / Fund Account
// Validation / Payouts APIs (the RazorpayX product family), distinct from
// the Checkout/Orders/Refunds APIs above which only ever move money BETWEEN
// a customer and this platform's own account. These move money OUT to an
// organizer's bank account, and require RazorpayX to actually be enabled
// on this merchant account -- if it isn't, every call below fails with a
// real 401/403 from Razorpay, which callers surface as a genuine
// verification_failed/payout failed state, not a placeholder success.
// ===========================================================================

export type RazorpayContact = { id: string };

/** POST /v1/contacts -- represents the organizer as a payee. Created once
 * per payout account (not once per organizer), since a new bank account
 * is a new Fund Account attached to a fresh Contact -- simplest mapping,
 * avoids tracking contact reuse across an organizer's account history. */
export async function createRazorpayContact(params: { name: string; email?: string; reference_id: string }): Promise<RazorpayContact> {
  const res = await fetch(`${RAZORPAY_API_BASE}/contacts`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: params.name, email: params.email, type: "vendor", reference_id: params.reference_id }),
  });
  if (!res.ok) throw new Error(`Razorpay contact creation failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export type RazorpayFundAccount = { id: string };

/** POST /v1/fund_accounts -- attaches a bank_account to the Contact above.
 * account_number is the DECRYPTED plaintext -- caller must decrypt
 * immediately before this call and never persist or log the return value
 * of that decryption anywhere else. */
export async function createRazorpayFundAccount(params: { contactId: string; accountHolderName: string; accountNumber: string; ifsc: string }): Promise<RazorpayFundAccount> {
  const res = await fetch(`${RAZORPAY_API_BASE}/fund_accounts`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      contact_id: params.contactId,
      account_type: "bank_account",
      bank_account: { name: params.accountHolderName, ifsc: params.ifsc, account_number: params.accountNumber },
    }),
  });
  if (!res.ok) throw new Error(`Razorpay fund account creation failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export type RazorpayFundAccountValidation = { id: string; status: string };

/** POST /v1/fund_accounts/validations -- Razorpay's penny-drop bank
 * verification: deposits a small amount and confirms the account is real
 * and matches the given name, resolving asynchronously (status starts
 * "created"/"pending" here; the webhook handles fund_account.validation.
 * completed/failed for the final result, same async-confirmation pattern
 * as a Razorpay refund). amountPaise defaults to the smallest Razorpay
 * accepts for this product (₹1). */
export async function createRazorpayFundAccountValidation(params: { fundAccountId: string; amountPaise?: number }): Promise<RazorpayFundAccountValidation> {
  const res = await fetch(`${RAZORPAY_API_BASE}/fund_accounts/validations`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ fund_account: { id: params.fundAccountId }, amount: params.amountPaise ?? 100, currency: "INR" }),
  });
  if (!res.ok) throw new Error(`Razorpay fund account validation failed to start: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; status: string };
  return { id: data.id, status: data.status };
}

export type RazorpayPayout = { id: string; status: string };

/** POST /v1/payouts -- the actual money movement to an organizer's
 * verified fund account, debited from this merchant's own RazorpayX
 * current account (RAZORPAYX_ACCOUNT_NUMBER). Requires RazorpayX Payouts
 * to be enabled and funded -- callers must treat a thrown error here as a
 * genuine "couldn't pay out automatically" state (settlement stays
 * failed/pending for admin's manual fallback), never retried blindly. */
export async function createRazorpayPayout(params: { fundAccountId: string; amountPaise: number; referenceId: string; narration: string }): Promise<RazorpayPayout> {
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!accountNumber) throw new Error("RazorpayX payouts are not configured (missing RAZORPAYX_ACCOUNT_NUMBER)");
  const res = await fetch(`${RAZORPAY_API_BASE}/payouts`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      account_number: accountNumber,
      fund_account_id: params.fundAccountId,
      amount: params.amountPaise,
      currency: "INR",
      mode: "IMPS",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: params.referenceId,
      narration: params.narration,
    }),
  });
  if (!res.ok) throw new Error(`Razorpay payout failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; status: string };
  return { id: data.id, status: data.status };
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
