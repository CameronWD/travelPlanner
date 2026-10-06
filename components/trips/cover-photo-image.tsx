"use client";

import * as React from "react";
import Image, { type ImageLoader } from "next/image";
import { cn } from "@/lib/cn";
import { coverUrlForWidth } from "@/lib/cover";

/**
 * The cover route is member-gated (/api/trips/:id/cover checks the session,
 * then may 302 to a presigned URL). The image optimizer fetches without the
 * viewer's cookies and caches by URL across users, so it must never see this
 * image: the loader hands the browser the cover route itself, asking for the
 * small copy when the frame is small (spec 2026-10-06 §H) — so `sizes` now
 * picks a real size.
 *
 * A Client Component on purpose: `next/image` is itself a Client Component,
 * and a `loader` function can only be passed to it from the client side of
 * the boundary — a Server Component doing so throws at request time (React
 * #441 in production). `lib/image-loader-boundary.test.ts` guards this.
 */
const coverLoader: ImageLoader = ({ src, width }) => coverUrlForWidth(src, width);

export interface CoverPhotoImageProps {
  url: string;
  alt: string;
  focalX: number | null;
  focalY: number | null;
  /** `sizes` hint for the browser, e.g. "(min-width: 768px) 300px, 172px". */
  sizes: string;
  /** "cover" (default) fills the frame cropped at the focal point; "contain"
   * shows the whole photo, letterboxed (the phone Home's portrait frame —
   * spec 2026-10-05 §I). */
  fit?: "cover" | "contain";
}

export function CoverPhotoImage({ url, alt, focalX, focalY, sizes, fit = "cover" }: CoverPhotoImageProps) {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // A re-upload or revert changes `url` without remounting this component (the
  // `<CoverArt>` tree around it is stable) — reset both flags for the new photo
  // rather than staying stuck on the previous url's outcome. React's sanctioned
  // "store previous prop in state" pattern (not a ref: refs can't be read or
  // written during render — react-hooks/refs).
  const [prevUrl, setPrevUrl] = React.useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setLoaded(false);
    setFailed(false);
  }

  // A photo the browser already has is complete on mount: show it at once
  // instead of fading in from opacity-0 (spec 2026-10-06 §H).
  const markIfCached = React.useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  if (failed) return null;

  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      loader={coverLoader}
      ref={markIfCached}
      data-testid="cover-photo"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={cn(fit === "contain" ? "object-contain" : "object-cover", "transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
      style={fit === "contain" ? undefined : { objectPosition: `${(focalX ?? 0.5) * 100}% ${(focalY ?? 0.5) * 100}%` }}
    />
  );
}
