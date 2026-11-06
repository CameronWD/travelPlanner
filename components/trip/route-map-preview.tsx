"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function RouteMapPreview({
  imageUrl,
  alt,
  frameClassName,
  children,
}: {
  imageUrl: string | null;
  alt: string;
  frameClassName?: string;
  children: ReactNode;
}) {
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live) liveRef.current?.focus();
  }, [live]);
  if (imageUrl == null || failed) return <>{children}</>;
  if (live) {
    return (
      <div ref={liveRef} tabIndex={-1} role="group" aria-label="Route map" className="outline-none">
        {children}
      </div>
    );
  }
  return (
    <div className={cn("relative w-full overflow-hidden border-2 border-border", frameClassName)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={alt} loading="lazy" className="size-full bg-background object-contain" onError={() => setFailed(true)} />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="absolute bottom-3 right-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setLive(true)}
      >
        Explore map
      </Button>
    </div>
  );
}
