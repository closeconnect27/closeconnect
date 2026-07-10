"use client";

// Hand-rolled instead of the mixpanel-browser package -- all we need is
// "send an event" + "persist an anonymous id across visits" +
// "merge that id into a real user on login", and Mixpanel's HTTP API is
// simple enough that pulling in the ~40KB SDK for it isn't justified
// (same reasoning this project already applied to charts: don't add a
// dependency for something this small). EU cluster, matching the project
// (https://eu.mixpanel.com/project/4042309).
const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const API_HOST = "https://api-eu.mixpanel.com";
const DISTINCT_ID_KEY = "cc_mp_distinct_id";

function getDistinctId(): string {
  if (typeof window === "undefined") return "server";
  let id: string | null = null;
  try {
    id = localStorage.getItem(DISTINCT_ID_KEY);
  } catch {
    // Storage disabled (private browsing, etc.) -- fall through to a
    // fresh id below rather than throwing.
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(DISTINCT_ID_KEY, id);
    } catch {
      // Nothing we can do -- this visit just won't persist an id.
    }
  }
  return id;
}

// A JSON POST body with an explicit Content-Type triggers a CORS
// preflight, and Mixpanel's /track and /engage endpoints don't allow the
// content-type header in their preflight response for cross-origin
// browser requests -- confirmed by an actual CORS failure in testing, not
// a theoretical concern. Base64-encoding the payload into a `data` query
// param and sending it as a plain GET (Mixpanel's own documented pattern
// for exactly this browser-tracking case) avoids the preflight
// altogether: a same-simple-headers GET never triggers one.
function send(endpoint: string, payload: unknown) {
  if (!TOKEN || typeof window === "undefined") return;
  // btoa is Latin1-only -- encodeURIComponent/unescape is the standard
  // browser idiom for making an arbitrary UTF-8 string safe for it first.
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = `${API_HOST}${endpoint}${endpoint.includes("?") ? "&" : "?"}data=${encodeURIComponent(data)}`;
  fetch(url, { method: "GET", keepalive: true }).catch(() => {
    // Analytics is never allowed to break the page it's tracking.
  });
}

export function track(event: string, properties: Record<string, unknown> = {}) {
  send("/track?ip=1", [
    {
      event,
      properties: {
        token: TOKEN,
        distinct_id: getDistinctId(),
        $current_url: window.location.href,
        time: Date.now(),
        ...properties,
      },
    },
  ]);
}

// Called once on login -- merges the anonymous pre-login id into the real
// account id (Mixpanel's standard $identify alias flow) and switches all
// future track() calls in this browser over to the real id.
export function identify(userId: string, profileProperties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const anonId = getDistinctId();
  if (anonId !== userId) {
    send("/track?ip=1", [
      {
        event: "$identify",
        properties: { token: TOKEN, distinct_id: userId, $anon_distinct_id: anonId },
      },
    ]);
    try {
      localStorage.setItem(DISTINCT_ID_KEY, userId);
    } catch {
      // Same as above -- id merge still happened server-side even if this
      // browser can't remember it for next time.
    }
  }
  send("/engage", [{ $token: TOKEN, $distinct_id: userId, $set: profileProperties }]);
}
