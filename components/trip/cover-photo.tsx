"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface CoverPhotoProps {
  src: string;
  alt: string;
  /** 0–1 across the photo (Trip.coverFocalX); null/undefined = centre. */
  focalX?: number | null;
  /** 0–1 down the photo (Trip.coverFocalY); null/undefined = centre. */
  focalY?: number | null;
  /** The trip Home's cover tile: may fill a portrait photo's edges with a blur. */
  tile?: boolean;
  className?: string;
}

/**
 * A Trip's cover photo (spec E2). The photo is cropped to fill its box
 * (`object-cover`), centred on the Trip's focal point.
 *
 * On the trip Home's cover tile only, a portrait photo in a landscape tile
 * would lose most of itself to that crop, so it is shown whole instead
 * (`object-contain`) with a light blurred copy of the same image filling the
 * tile's edges. That is decided after load from the photo's natural size, so
 * it is a client island; until then (and for every landscape photo) it is the
 * plain crop. Never a full-width blurred backdrop — the tile is the only place
 * it can appear, and only at tile size.
 */
export function CoverPhoto({ src, alt, focalX, focalY, tile = false, className }: CoverPhotoProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [fillEdges, setFillEdges] = useState(false);

  const measure = useCallback(() => {
    const img = imgRef.current;
    const box = boxRef.current;
    if (!tile || !img || !box || !img.naturalWidth) return;
    const portrait = img.naturalHeight > img.naturalWidth;
    const landscapeTile = box.clientWidth >= box.clientHeight;
    setFillEdges(portrait && landscapeTile);
  }, [tile]);

  // A cached photo can finish loading before hydration attaches onLoad.
  useEffect(() => {
    if (imgRef.current?.complete) measure();
  }, [measure]);

  // The focal point steers the crop only. A letterboxed (contained) portrait
  // isn't cropped, so it stays centred and the blur band is even both sides.
  const fx = fillEdges ? 0.5 : (focalX ?? 0.5);
  const fy = fillEdges ? 0.5 : (focalY ?? 0.5);

  return (
    <div ref={boxRef} className={cn("relative size-full overflow-hidden bg-muted", className)}>
      {fillEdges && (
        // Same URL as the photo: one request, one cache entry (the offline
        // warm-set relies on that). Offset by 16px on every side and sized
        // 100% + 2rem so blur-md's 12px fringe never shows inside the tile
        // (explicit size, not opposite insets alone — LA-028).
        // eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute -left-4 -top-4 size-[calc(100%+2rem)] max-w-none object-cover blur-md brightness-90"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={measure}
        className={cn("relative size-full", fillEdges ? "object-contain" : "object-cover")}
        style={{ objectPosition: `${fx * 100}% ${fy * 100}%` }}
      />
    </div>
  );
}
