"use client";

// Lazily injects Razorpay's Standard Checkout script at most once per page,
// caching the in-flight/resolved promise -- same singleton pattern as
// loadGoogleMaps (googleMapsLoader.ts), for the same reason: nothing here
// should race to inject the script twice if this ever mounts more than
// once on a page. Resolves to `null` (never throws) if the script fails to
// load, so the caller can fall back to a clear error message instead of an
// unhandled rejection.

export type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: { error?: { description?: string } }) => void) => void;
};

export type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loadPromise: Promise<RazorpayConstructor | null> | null = null;

export function loadRazorpayCheckout(): Promise<RazorpayConstructor | null> {
  if (loadPromise) return loadPromise;

  if (window.Razorpay) {
    loadPromise = Promise.resolve(window.Razorpay);
    return loadPromise;
  }

  loadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(window.Razorpay ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return loadPromise;
}
