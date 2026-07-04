import type { Metadata } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { createClient } from "@/lib/supabase/server";

const syne = Syne({
  variable: "--font-syne",
  weight: ["700", "800"],
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Close.Connect",
  description: "Community + events platform",
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
      className={`${syne.variable} ${dmSans.variable} h-full antialiased`}
    >
      {/* pb-16 clears the fixed BottomNav on mobile so page content never
          sits underneath it; sm:pb-0 since BottomNav hides itself there. */}
      <body className="flex min-h-full flex-col pb-16 font-sans sm:pb-0">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Header isLoggedIn={isLoggedIn} />
        {children}
        <BottomNav isLoggedIn={isLoggedIn} />
      </body>
    </html>
  );
}
