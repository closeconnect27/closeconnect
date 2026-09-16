import type { MetadataRoute } from "next";

// Next.js serves this at /manifest.webmanifest automatically. Primarily for
// the Capacitor Android shell (matches capacitor.config.ts's splash/theme
// colors) but also makes the site a real installable PWA on its own.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CloseConnect",
    short_name: "CloseConnect",
    description: "Discover communities and events near you in India.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
