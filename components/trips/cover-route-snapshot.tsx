"use client";

import * as React from "react";

export interface CoverRouteSnapshotProps {
  src: string;
  chip: string | null;
  size: "hero" | "small";
  fallback: React.ReactNode;
}

export function CoverRouteSnapshot({ src, chip, fallback }: CoverRouteSnapshotProps) {
  const [failed, setFailed] = React.useState(false);
  const [prevSrc, setPrevSrc] = React.useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(false);
  }

  // An error that fired before hydration never reaches onError; the element is already complete and empty.
  const markIfBroken = React.useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <>{fallback}</>;

  return (
    <div className="relative size-full bg-map-fill">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={markIfBroken} src={src} alt="" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      {chip ? (
        <span className="absolute bottom-[5px] left-[5px] whitespace-nowrap shrink-0 rounded-full border-[1.5px] border-border bg-card px-[6px] py-px text-[9px] font-extrabold text-foreground">
          {chip}
        </span>
      ) : null}
    </div>
  );
}
