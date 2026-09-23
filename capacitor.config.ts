import type { CapacitorConfig } from "@capacitor/cli";

// server.url points the WebView at the live site directly rather than
// bundling a local build -- this app depends on server actions, SSR, and
// cookie-based auth (Cloudflare Workers + Supabase), none of which survive
// a static export. Any change shipped to closeconnect.in is instantly the
// app's content too, no separate app release needed for web-only changes --
// only native-shell changes (icons, plugins, manifest) need a new build.
//
// Points at /app, not "/" -- "/" is the public marketing landing page
// (built to sell the product to a first-time web visitor, browsable with
// no account), which is exactly wrong as the very first thing someone sees
// after installing the app. /app (src/app/app/page.tsx) is a small
// same-codebase gate: redirects straight to /login if signed out, or the
// community feed if signed in -- sign-in-first is what makes this read as
// an actual app instead of a website opened in a frame.
const config: CapacitorConfig = {
  appId: "in.closeconnect.app",
  appName: "CloseConnect",
  webDir: "public",
  server: {
    url: "https://closeconnect.in/app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // launchAutoHide: false -- the splash is hidden manually instead
      // (NativeStatusBar's effect), once the real destination page (post
      // /app's redirect to /login or the community feed) has actually
      // mounted client-side. A fixed auto-hide duration would frequently
      // reveal a blank flash while the remote page is still loading over
      // the network in between -- holding the splash until there's real
      // content to show, then fading out, is what makes the launch feel
      // like a native app instead of a website loading.
      launchAutoHide: false,
      launchFadeOutDuration: 300,
      backgroundColor: "#0a0a0a",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com"],
    },
  },
};

export default config;
