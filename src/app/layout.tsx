import type { Metadata } from "next";
import { Fraunces, DM_Sans, Fira_Code } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { createClient } from "@/lib/supabase/server";

// Bold editorial serif for headings -- 900 for major headings/the hero
// wordmark, 700 for sub-headings. Considered Perandory, but it's
// personal-use-only licensed (not appropriate for a commercial product) and
// uppercase-only (which breaks the sentence-case rule everywhere), so
// Fraunces instead: same bold-serif editorial energy, properly licensed.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  weight: ["700", "900"],
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// Restrained pairing rule: mono accent font reserved for small accent
// elements only (tags, stat labels, category pills) -- never body or nav
// text, same discipline as the previous Syne/DM Sans pairing.
const firaCode = Fira_Code({
  variable: "--font-fira-code",
  weight: ["500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://closeconnect.in"),
  title: {
    default: "Close.Connect -- Find your people. Host what you love.",
    template: "%s | Close.Connect",
  },
  description: "Discover communities and events near you in India. Join a group, host a meetup, or sell tickets to your next event.",
  openGraph: {
    siteName: "Close.Connect",
    locale: "en_IN",
    type: "website",
  },
};

// Runs before hydration to avoid a flash of the wrong theme: stored choice
// wins, otherwise prefers-color-scheme, otherwise dark (the product default,
// not "whatever the OS says"). suppressHydrationWarning on <html> below is
// required since this sets an attribute React didn't render server-side.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${dmSans.variable} ${firaCode.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <SiteChrome isLoggedIn={isLoggedIn} userId={user?.id ?? null}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
