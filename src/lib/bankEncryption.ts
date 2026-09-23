// AES-256-GCM via Web Crypto (crypto.subtle), not node:crypto -- same
// reasoning as razorpay.ts's own HMAC helper: this deploys to Cloudflare
// Workers via OpenNext, and Web Crypto is what actually works there
// without depending on the nodejs_compat layer for something this
// security-sensitive. BANK_ENCRYPTION_KEY is a 32-byte key, base64-encoded,
// generated once and stored as a Cloudflare secret (never checked in,
// never logged, never sent to the client) -- losing it means every
// previously-saved bank account becomes permanently undecryptable, so it
// must be provisioned before this feature is used and never rotated
// without a re-collection plan.

async function getKey(): Promise<CryptoKey> {
  const keyB64 = process.env.BANK_ENCRYPTION_KEY;
  if (!keyB64) throw new Error("Bank encryption is not configured (missing BANK_ENCRYPTION_KEY)");
  const keyBinary = atob(keyB64);
  const raw = new Uint8Array(keyBinary.length);
  for (let i = 0; i < keyBinary.length; i++) raw[i] = keyBinary.charCodeAt(i);
  if (raw.byteLength !== 32) throw new Error("BANK_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypts a bank account number for storage -- output is
 * `<iv_b64>.<ciphertext_b64>` (GCM's auth tag is appended to the
 * ciphertext by Web Crypto automatically, nothing extra to track). Never
 * called from anywhere but the server action that just received this
 * number from the organizer's own request body -- the plaintext number
 * must never be logged, tracked, or written anywhere else first. */
export async function encryptBankAccountNumber(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${bytesToB64(iv)}.${bytesToB64(new Uint8Array(ciphertext))}`;
}

/** Decrypts a stored account number -- called from exactly one place:
 * right before handing it to Razorpay's Fund Account API for verification.
 * Never returned to the client, never logged, never included in a
 * notification/audit-log entry (see payoutAuditLog.ts's own comment). */
export async function decryptBankAccountNumber(stored: string): Promise<string> {
  const key = await getKey();
  const [ivB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !ciphertextB64) throw new Error("Malformed encrypted bank account value");
  const iv = b64ToBytes(ivB64);
  const ciphertext = b64ToBytes(ciphertextB64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
