// Fired by the notifications_push_trigger row trigger (see
// 0091_push_notification_trigger.sql) after every insert into `notifications`
// -- one hook covering all ~15 code paths that create a notification, native
// app push included. Not the reminder function's pattern of an empty,
// DB-driven POST body: this one carries a specific user_id/title/body/link,
// so it's gated by its own single-purpose secret (PUSH_TRIGGER_SECRET, set
// alongside the matching `push_trigger_secret` vault entry the trigger
// reads) rather than the public anon key -- anyone with the anon key must
// not be able to push arbitrary content to an arbitrary user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUSH_TRIGGER_SECRET = Deno.env.get("PUSH_TRIGGER_SECRET")!;
const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")!;

type PushPayload = {
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  type: string;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const stripped = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binary = atob(stripped);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Reused across warm invocations of the same isolate when possible -- not
// guaranteed (Edge Functions may cold-start per request), just avoids an
// extra RSA-sign + token-endpoint round trip on the common case where it is.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const encoder = new TextEncoder();
  const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`FCM OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

// Returns "stale" for a token FCM says no longer exists, so the caller can
// clean it up -- distinct from a transient failure (rate limit, server
// error) that shouldn't cost the user their registration.
async function sendToToken(accessToken: string, projectId: string, token: string, payload: PushPayload): Promise<"ok" | "stale" | "error"> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body ?? "" },
        data: { link: payload.link ?? "", type: payload.type },
      },
    }),
  });
  if (res.ok) return "ok";
  const errBody = await res.text();
  if (res.status === 404 || errBody.includes("UNREGISTERED") || errBody.includes("INVALID_ARGUMENT")) {
    console.error(`FCM token stale, removing: ${res.status} ${errBody}`);
    return "stale";
  }
  console.error(`FCM send failed: ${res.status} ${errBody}`);
  return "error";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${PUSH_TRIGGER_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const payload = (await req.json()) as PushPayload;
  if (!payload.user_id || !payload.title) {
    return new Response(JSON.stringify({ error: "Missing user_id or title" }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: tokens, error: tokensError } = await supabase.from("push_tokens").select("id, token").eq("user_id", payload.user_id);
  if (tokensError) {
    return new Response(JSON.stringify({ error: tokensError.message }), { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  const accessToken = await getFcmAccessToken(serviceAccount);

  const staleIds: string[] = [];
  let sent = 0;
  await Promise.all(
    tokens.map(async (row) => {
      const result = await sendToToken(accessToken, serviceAccount.project_id, row.token, payload);
      if (result === "ok") sent += 1;
      if (result === "stale") staleIds.push(row.id);
    }),
  );

  if (staleIds.length > 0) {
    await supabase.from("push_tokens").delete().in("id", staleIds);
  }

  return new Response(JSON.stringify({ ok: true, sent, staleRemoved: staleIds.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
