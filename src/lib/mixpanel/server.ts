// Server-side event tracking for Server Actions (registrations, claims,
// verification requests, etc.) -- these are real product events that
// happen entirely server-side and would never fire if tracked only via
// client-side clicks (the action can succeed from a request that never
// re-renders, or fail after a click that already fired a click-event).
// Uses the Import API (Basic Auth with the API secret) rather than the
// public /track endpoint the client uses -- the modern, authenticated
// path for server-originated events, and the reason the API secret was
// provided separately from the public project token.
const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const API_SECRET = process.env.MIXPANEL_API_SECRET;
const IMPORT_HOST = "https://api-eu.mixpanel.com";

// Never throws and never awaited by its callers -- same fire-and-forget
// posture as notifyAdminOfPendingClaim (communities.ts): a failed
// analytics call is a missed data point, not a broken user-facing action.
export async function trackServerEvent(event: string, distinctId: string, properties: Record<string, unknown> = {}) {
  if (!TOKEN || !API_SECRET) return;

  const payload = [
    {
      event,
      properties: {
        token: TOKEN,
        distinct_id: distinctId,
        time: Date.now(),
        $insert_id: crypto.randomUUID(), // required by /import for dedupe
        ...properties,
      },
    },
  ];

  try {
    const res = await fetch(`${IMPORT_HOST}/import?strict=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${API_SECRET}:`).toString("base64")}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Mixpanel import failed for "${event}": ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    console.error(`Mixpanel import request failed for "${event}":`, e);
  }
}
