"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

// App Links (AndroidManifest.xml's autoVerify intent-filter for
// /auth/callback) hand a matched URL to the OS, which launches this app --
// Capacitor surfaces that as an `appUrlOpen` event rather than actually
// navigating the WebView there itself. Forcing that navigation here is what
// makes the magic-link callback's Set-Cookie response land in the app's own
// WebView cookie jar, not get silently dropped.
export function NativeAuthBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = App.addListener("appUrlOpen", (data) => {
      if (data.url.includes("/auth/callback")) {
        window.location.href = data.url;
      }
    });

    return () => {
      handle.then((h) => h.remove());
    };
  }, []);

  return null;
}
