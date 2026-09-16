"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { registerPushToken } from "@/app/actions/pushTokens";

// Native-only, mounted once from the root layout for any signed-in user.
// No-ops entirely on the web (Capacitor.isNativePlatform() is false there) --
// this file only exists to run inside the Android/iOS shell.
export function PushNotificationRegistrar() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    async function setup() {
      const permission = await PushNotifications.checkPermissions();
      let receive = permission.receive;
      if (receive === "prompt" || receive === "prompt-with-rationale") {
        receive = (await PushNotifications.requestPermissions()).receive;
      }
      if (receive !== "granted" || cancelled) return;

      await PushNotifications.register();
    }
    setup();

    const registrationHandle = PushNotifications.addListener("registration", (token) => {
      const platform = Capacitor.getPlatform();
      if (platform === "android" || platform === "ios") {
        registerPushToken(token.value, platform);
      }
    });
    const registrationErrorHandle = PushNotifications.addListener("registrationError", (err) => {
      console.error("Push registration failed:", err);
    });
    // Tapping a notification when the app is backgrounded/closed -- the
    // link mirrors what src/app/actions/events.ts (etc.) already writes
    // into notifications.link for the in-app bell, reused here as-is.
    const tapHandle = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = action.notification.data?.link;
      if (typeof link === "string" && link) router.push(link);
    });

    return () => {
      cancelled = true;
      registrationHandle.then((h) => h.remove());
      registrationErrorHandle.then((h) => h.remove());
      tapHandle.then((h) => h.remove());
    };
  }, [router]);

  return null;
}
