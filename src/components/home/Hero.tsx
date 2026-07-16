import Link from "next/link";

// The entire homepage, full stop -- a single non-scrolling screen (see
// SiteChromeInner's isHome branch for the scroll lock + the Footer that
// sits directly below this). Three rows of real, category-matched photos
// (src/lib/categoryImages.ts's already-curated, verified Unsplash pool --
// the same source every community/event card draws from, not fresh/random
// stock) drift right-to-left at three different speeds for a layered feel,
// tilted as one field rather than kept perfectly horizontal. Pure CSS
// (globals.css's .hero-marquee-row/.hero-fade-in) -- no client-side JS
// anywhere on this page, so it ships with zero hydration cost.
type Card = { slug: string; caption: string; url: string };

function img(photo: string, w = 440, h = 300) {
  return `https://images.unsplash.com/${photo}?w=${w}&h=${h}&fit=crop&q=75&auto=format`;
}

const ROW_TOP: Card[] = [
  { slug: "sports", caption: "Fitness", url: img("photo-1583454110551-21f2fa2afe61") },
  { slug: "travel", caption: "Hiking", url: img("photo-1604430456280-43f652c497aa") },
  { slug: "gaming", caption: "Gaming", url: img("photo-1542751371-adc38448a05e") },
  { slug: "music", caption: "Live music", url: img("photo-1459749411175-04bf5292ceea") },
  { slug: "food", caption: "Food & drink", url: img("photo-1414235077428-338989a2e8c0") },
];

const ROW_MID: Card[] = [
  { slug: "wellness", caption: "Yoga", url: img("photo-1544367567-0f2fcb009e0b") },
  { slug: "arts", caption: "Art shows", url: img("photo-1606819717115-9159c900370b") },
  { slug: "pets", caption: "Pet meetups", url: img("photo-1623387641168-d9803ddd3f35") },
  { slug: "books", caption: "Book clubs", url: img("photo-1495446815901-a7297e633e8d") },
  { slug: "photography", caption: "Photography", url: img("photo-1542038784456-1ea8e935640e") },
];

const ROW_BOTTOM: Card[] = [
  { slug: "social", caption: "Social nights", url: img("photo-1664917303642-53aee32d3573") },
  { slug: "business", caption: "Startups", url: img("photo-1517048676732-d65bc937f952") },
  { slug: "education", caption: "Workshops", url: img("photo-1509062522246-3755977927d7") },
  { slug: "parenting", caption: "Parenting", url: img("photo-1542037104857-ffbb0b9155fb") },
  { slug: "beauty", caption: "Self-care", url: img("photo-1600634999623-864991678406") },
];

export function Hero() {
  return (
    // Fixed near-black, not the theme-reactive bg-bg token -- gaps between
    // rotated marquee rows show this through directly, and light mode's
    // bg-bg (near-white) behind a translucent black scrim nets a washed-out
    // grey, not the dark backdrop the white foreground text needs to stay
    // legible. This is a full-bleed photo hero like CommunityCard/EventCard
    // (both already use fixed black-based gradients + white text over a
    // photo, not theme tokens), not the page chrome.
    <div className="relative h-full w-full flex-1 overflow-hidden bg-[#08080a]">
      {/* Background: rotated field of 3 marquee rows. inset-[-15%] + the
          rotation's own overscan (~15% again below) guarantees full corner
          coverage at a -4deg tilt on any viewport aspect ratio -- a plain
          inset-0 would leave visible gaps at the corners once rotated. */}
      <div
        className="pointer-events-none absolute inset-[-15%] flex flex-col justify-center gap-4 sm:gap-5"
        style={{ transform: "rotate(-4deg) scale(1.15)" }}
        aria-hidden="true"
      >
        <MarqueeRow cards={ROW_TOP} duration={42} />
        <MarqueeRow cards={ROW_MID} duration={32} />
        <MarqueeRow cards={ROW_BOTTOM} duration={60} className="hidden sm:flex" />
      </div>

      {/* Scrim: a radial vignette concentrated behind the text block, not a
          flat full-page darken -- images stay vivid at the sides, only the
          center (where the headline sits) gets dark enough for legible
          white text. Fixed black-based values on purpose (not a theme
          token): text sits on a photo here, not the page background, so it
          needs to stay legible the same way regardless of site theme.
          Percentage-based ellipse size (not vw/dvh + min(), which one real
          browser in testing silently ignored and fell back to covering the
          farthest corner entirely) -- percentages resolve against this
          div's own box (== the viewport), so this scales the same way on
          any screen without relying on a size function inside the
          gradient. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 62% at 50% 50%, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.95) 45%, rgba(0,0,0,0.78) 63%, rgba(0,0,0,0.35) 78%, rgba(0,0,0,0) 92%)",
        }}
      />

      {/* Foreground -- z-10 makes the stacking order explicit rather than
          relying on DOM order alone to win over the two absolute layers
          above it. */}
      <div className="hero-fade-in relative z-10 flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70">
          Closeconnect
        </span>
        <h1 className="max-w-2xl font-heading text-[32px] font-black leading-[1.05] text-white min-[480px]:text-[40px] sm:text-[52px] lg:text-[64px]">
          Find your people.
          <br />
          Host what you love.
        </h1>
        <p className="max-w-md text-[15px] text-white/85 sm:text-[16px]">
          Discover communities and events near you, or start your own -- native chat groups, ticketed events, all in
          one place.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Link href="/communities" className="btn-primary px-6 py-3 text-[14px]">
            Browse communities
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/50 bg-black/30 px-6 py-3 text-[14px] font-bold text-white backdrop-blur-sm transition hover:border-white hover:bg-black/50 active:scale-[0.97]"
          >
            Browse events
          </Link>
        </div>
      </div>
    </div>
  );
}

function MarqueeRow({ cards, duration, className = "" }: { cards: Card[]; duration: number; className?: string }) {
  // Duplicated once, not looped programmatically -- translating exactly
  // -50% (globals.css's .hero-marquee-row) lands on an identical copy of
  // the starting frame, so the loop restart is invisible.
  const track = [...cards, ...cards];
  return (
    <div
      className={`hero-marquee-row flex w-max shrink-0 gap-3 sm:gap-4 ${className}`}
      style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
    >
      {track.map((card, i) => (
        <div
          key={`${card.slug}-${i}`}
          className="relative h-[100px] w-[150px] shrink-0 overflow-hidden rounded-2xl shadow-card sm:h-[150px] sm:w-[220px]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external Unsplash CDN URL, not a static remote pattern next/image is configured for */}
          <img src={card.url} alt="" className="h-full w-full object-cover" loading="eager" />
          <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/70 to-transparent" />
          <span className="absolute bottom-1.5 left-2.5 font-mono text-[9px] font-bold uppercase tracking-wide text-white sm:text-[10px]">
            {card.caption}
          </span>
        </div>
      ))}
    </div>
  );
}
