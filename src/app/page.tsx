import { Hero } from "@/components/home/Hero";

// The entire homepage is Hero -- a single, non-scrolling screen (see
// SiteChromeInner's isHome branch, which locks html/body scroll and sizes
// this to exactly the viewport height, then appends the shared Footer
// directly below it). No stats, no "how it works" -- this is a first-touch
// marketing screen, not a dashboard; getPlatformStats and the old
// multi-section layout it used to power were removed along with it.
export default function Home() {
  return <Hero />;
}
