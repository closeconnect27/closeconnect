"use client";

import { useState } from "react";
import Image from "next/image";
import { getCategoryImage } from "@/lib/categoryImages";

/**
 * Unsplash photo for a category, ported from reference_current_index.html's
 * CAT_IMAGES/getCatImage approach. On load failure, renders nothing so the
 * parent's own solid/gradient background (set via getCategoryVisual) shows
 * through -- mirrors the reference's onerror fallback, just without the
 * local SVG fallback tier since this app doesn't have those assets.
 */
export function CategoryImage({
  slug,
  seed,
  alt,
  fill,
  size,
  className,
  sizes,
}: {
  slug: string;
  seed: number;
  alt: string;
  fill?: boolean;
  size?: number;
  className?: string;
  sizes?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) return null;

  const src = getCategoryImage(slug, seed, size ? { w: size * 2, h: size * 2 } : undefined);

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes ?? "175px"}
        className={className}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size ?? 24}
      height={size ?? 24}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
