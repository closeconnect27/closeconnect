"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

// One-time native chrome setup, mounted once from the root layout so it
// runs no matter which page the app actually lands on first.
//
// Status bar: overlay: false is the actual fix for status-bar overlap -- it
// makes Android reserve real screen space for the status bar OUTSIDE the
// WebView entirely, so page content is laid out below it automatically on
// every screen, rather than needing env(safe-area-inset-top) padding
// sprinkled into whichever individual pages someone remembers to add it to.
//
// Splash screen: capacitor.config.ts sets launchAutoHide: false specifically
// so this effect is the ONLY thing that ever calls SplashScreen.hide() --
// by the time this component mounts, the real destination page (post
// /app's redirect to /login or the community feed, per capacitor.config.ts's
// server.url) has already rendered underneath, so the splash comes down
// onto real content instead of a blank flash while the network request was
// still in flight.
export function NativeChromeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setOverlaysWebView({ overlay: false });
    StatusBar.setBackgroundColor({ color: "#0a0a0a" });
    StatusBar.setStyle({ style: Style.Dark });
    SplashScreen.hide();
  }, []);

  return null;
}
