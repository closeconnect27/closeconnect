"use client";

import { useState } from "react";
import Image from "next/image";
import { resolveEntityImage } from "@/lib/categoryImages";

/**
 * An entity's own persisted Unsplash assignment (unsplashImageUrl, from
 * src/lib/unsplash.ts) when present, else a deterministic pick from the
 * category's verified pool (rows that predate that system). On load
 * failure, renders nothing so the parent's own solid/gradient background
 * (set via getCategoryVisual) shows through.
 */
export function CategoryImage({
  slug,
  seed,
  unsplashImageUrl,
  alt,
  fill,
  size,
  className,
  sizes,
}: {
  slug: string;
  seed: number;
  /** The entity's own assigned photo, if it has one (Community/Event's
   * unsplash_image_url) -- omit for contexts with no single entity (e.g.
   * a bare category badge). */
  unsplashImageUrl?: string | null;
  alt: string;
  fill?: boolean;
  size?: number;
  className?: string;
  sizes?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) return null;

  const src = resolveEntityImage(unsplashImageUrl, slug, seed, size ? { w: size * 2, h: size * 2 } : undefined);

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
