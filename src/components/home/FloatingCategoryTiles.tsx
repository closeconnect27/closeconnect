import Image from "next/image";
import { getCategoryVisual } from "@/lib/categories";
import { getCategoryImage } from "@/lib/categoryImages";

type Tile = {
  slug: string;
  seed: number;
  size: number;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  rotate: number;
  duration: number;
  delay: number;
  /** Smaller/inner tiles read as clutter on a narrow viewport, where
   * there's no room to keep them clear of the headline -- hidden below
   * sm rather than just shrunk. */
  hideOnMobile?: boolean;
};

// Hand-placed, not a grid -- a loose scattered-photos composition, weighted
// to the four corners so the headline's own center column always stays
// clear. Each pulls a real, already-curated photo from the same verified
// Unsplash pool every community/event card draws from (categoryImages.ts),
// not new/fabricated imagery -- just a different seed per tile for variety.
const TILES: Tile[] = [
  { slug: "sports", seed: 3, size: 132, top: "6%", left: "3%", rotate: -7, duration: 7.5, delay: 0 },
  { slug: "arts", seed: 1, size: 96, top: "32%", left: "12%", rotate: 5, duration: 6.5, delay: 0.6, hideOnMobile: true },
  { slug: "music", seed: 4, size: 118, top: "9%", right: "4%", rotate: 6, duration: 8, delay: 0.3 },
  { slug: "travel", seed: 12, size: 90, top: "38%", right: "14%", rotate: -5, duration: 6, delay: 1.1, hideOnMobile: true },
  { slug: "wellness", seed: 2, size: 100, bottom: "8%", left: "6%", rotate: 4, duration: 7, delay: 0.9 },
  { slug: "food", seed: 9, size: 88, bottom: "14%", left: "24%", rotate: -6, duration: 6.8, delay: 1.4, hideOnMobile: true },
  { slug: "social", seed: 6, size: 104, bottom: "6%", right: "5%", rotate: -4, duration: 7.2, delay: 0.4 },
  { slug: "gaming", seed: 15, size: 82, bottom: "18%", right: "22%", rotate: 5, duration: 6.2, delay: 1.7, hideOnMobile: true },
];

export function FloatingCategoryTiles() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {TILES.map((tile) => {
        const visual = getCategoryVisual(tile.slug);
        const src = getCategoryImage(tile.slug, tile.seed, { w: tile.size * 2, h: tile.size * 2 });
        return (
          <div
            key={tile.slug}
            className={`hero-float absolute overflow-hidden rounded-card shadow-card-hover ${tile.hideOnMobile ? "hidden sm:block" : ""}`}
            style={{
              width: tile.size,
              height: tile.size,
              top: tile.top,
              bottom: tile.bottom,
              left: tile.left,
              right: tile.right,
              background: visual.bg,
              // @ts-expect-error -- custom properties aren't in CSSProperties' type
              "--float-rotate": `${tile.rotate}deg`,
              "--float-duration": `${tile.duration}s`,
              "--float-delay": `${tile.delay}s`,
              transform: `rotate(${tile.rotate}deg)`,
            }}
          >
            <Image src={src} alt="" fill sizes={`${tile.size}px`} className="object-cover" />
          </div>
        );
      })}
    </div>
  );
}
