"use client";

import Image, { type ImageLoader } from "next/image";

/**
 * The cover route is member-gated (/api/trips/:id/cover checks the session,
 * then may 302 to a presigned URL). The image optimizer fetches without the
 * viewer's cookies and caches by URL across users, so it must never see this
 * image: the loader hands the browser the URL as-is (same reasoning as
 * countdown-polaroid.tsx).
 *
 * A Client Component on purpose: `next/image` is itself a Client Component,
 * and a `loader` function can only be passed to it from the client side of
 * the boundary — a Server Component doing so throws at request time (React
 * #441 in production). `lib/image-loader-boundary.test.ts` guards this.
 */
const passthroughLoader: ImageLoader = ({ src }) => src;

export interface CoverPhotoImageProps {
  url: string;
  alt: string;
  focalX: number | null;
  focalY: number | null;
  /** `sizes` hint for the browser, e.g. "(min-width: 768px) 300px, 172px". */
  sizes: string;
}

export function CoverPhotoImage({ url, alt, focalX, focalY, sizes }: CoverPhotoImageProps) {
  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      loader={passthroughLoader}
      className="object-cover"
      style={{ objectPosition: `${(focalX ?? 0.5) * 100}% ${(focalY ?? 0.5) * 100}%` }}
    />
  );
}
