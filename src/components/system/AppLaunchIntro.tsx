"use client";

import { useEffect, useState } from "react";
import { NativeOnly, WebOnly } from "@/components/system/PlatformGate";

type Stage = "initials" | "expanded" | "done";

// Native-only entrance on the login screen (the app's actual first screen,
// per /app's redirect) -- two bold "C"s, echoing the app icon's own
// layered-C mark, expand into the full "CloseConnect" wordmark before the
// sign-in card fades in underneath. Pure CSS max-width/opacity transitions
// (no animation library) staged by a couple of timeouts -- width itself
// can't be transitioned from "auto", so each word measures its expanded
// state against a generous fixed ch value instead, clipped by
// overflow-hidden while collapsed.
function LaunchIntro({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>("initials");

  useEffect(() => {
    const t1 = setTimeout(() => setStage("expanded"), 350);
    const t2 = setTimeout(() => setStage("done"), 950);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const expanded = stage !== "initials";

  return (
    <div className="flex w-full flex-col items-center">
      <div className="flex items-baseline font-heading text-[32px] font-black">
        <span className="text-text">C</span>
        <span
          className="inline-block overflow-hidden whitespace-nowrap text-text transition-[max-width] duration-500 ease-out"
          style={{ maxWidth: expanded ? "8ch" : "0ch" }}
        >
          lose
        </span>
        <span className="text-green">C</span>
        <span
          className="inline-block overflow-hidden whitespace-nowrap text-green transition-[max-width] duration-500 ease-out"
          style={{ maxWidth: expanded ? "10ch" : "0ch", transitionDelay: expanded ? "120ms" : "0ms" }}
        >
          onnect
        </span>
      </div>
      <div
        className={`mt-8 w-full transition-opacity duration-500 ease-out ${
          stage === "done" ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Wraps the login card: plays the CloseConnect intro animation before
 * revealing it inside the app, shows it immediately on the website. */
export function AppLaunchIntro({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NativeOnly>
        <LaunchIntro>{children}</LaunchIntro>
      </NativeOnly>
      <WebOnly>{children}</WebOnly>
    </>
  );
}
