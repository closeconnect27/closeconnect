"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { classifyReferrer } from "@/lib/referrerSource";

const SESSION_KEY = "cc_viewer_session";

function getViewerSession() {
  let session = localStorage.getItem(SESSION_KEY);
  if (!session) {
    session = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, session);
  }
  return session;
}

// Fire-and-forget view logging -- renders nothing, just records a row on
// mount. No IP storage or fingerprinting (SPEC.md's explicit privacy
// posture for this): identity is only ever the signed-in viewerId (if any)
// plus an anonymous client-generated session token in localStorage, nothing
// else. The (target_type, target_id, viewer_session, viewed_on) unique
// constraint means a second view in the same session/day is a harmless
// no-op (23505), not something worth surfacing or retrying.
export function PageViewTracker({
  targetType,
  targetId,
  viewerId,
}: {
  targetType: "community" | "event";
  targetId: string;
  viewerId: string | null;
}) {
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("page_views")
      .insert({
        target_type: targetType,
        target_id: targetId,
        viewer_id: viewerId,
        viewer_session: getViewerSession(),
        referrer_source: classifyReferrer(document.referrer),
      })
      .then(({ error }) => {
        if (error && error.code !== "23505") {
          console.error("page view tracking failed:", error.message);
        }
      });
    // Intentionally only on mount -- a view is "did someone load this page",
    // not something that should re-fire on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
