"use client";

import { useState, type ReactNode } from "react";
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
  if (imageUrl == null || live) return <>{children}</>;
  return (
    <div className={cn("relative w-full overflow-hidden", frameClassName)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={alt} loading="lazy" className="size-full object-cover" />
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
