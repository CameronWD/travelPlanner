"use client";

import * as React from "react";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "@/components/ui/dialog";

export interface ItemPhotoThumbProps {
  src: string;
  /** Item title — the photo's alt text everywhere it renders (spec §I). */
  alt: string;
  /**
   * "sm" (40px, default) — plan/day/Wishlist rows. "lg" (64px) — the Day
   * view's larger row tile and the Item dialog's own preview (spec §I).
   */
  size?: "sm" | "lg";
  className?: string;
}

const SIZE_CLASS: Record<"sm" | "lg", string> = {
  sm: "size-10", // 40px
  lg: "size-16", // 64px
};

/**
 * Item photo (CONTEXT.md "Item photo", spec §I): a small rounded-square
 * thumbnail — 2px ink border, per the Playground system (ADR 0060/0061) —
 * that opens the codebase's Dialog as a full-size lightbox on tap. Purely
 * presentational: callers only render this once an Item has a photoUrl;
 * there is no "no photo" placeholder state here.
 */
export function ItemPhotoThumb({ src, alt, size = "sm", className }: ItemPhotoThumbProps) {
  const [failed, setFailed] = React.useState(false);
  // `src` can change without this component remounting (e.g. the Item's photo
  // is replaced) — reset the failed flag for the new src rather than staying
  // stuck showing the glyph for a photo that no longer applies. React's
  // sanctioned "store previous prop in state" pattern (not a ref: refs can't
  // be read or written during render — react-hooks/refs).
  const [prevSrc, setPrevSrc] = React.useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(false);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="item-photo-thumb"
          aria-label={`View ${alt} photo`}
          disabled={failed}
          className={cn(
            "tap-target shrink-0 overflow-hidden rounded-md border-2 border-border",
            SIZE_CLASS[size],
            className,
          )}
        >
          {failed ? (
            <span aria-label="Photo unavailable" className="flex size-full items-center justify-center bg-muted text-muted-foreground">
              <ImageIcon className="size-4" aria-hidden />
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable
            <img src={src} alt={alt} className="size-full object-cover" onError={() => setFailed(true)} />
          )}
        </button>
      </DialogTrigger>
      <DialogContent bare className="sm:max-w-lg">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable */}
        <img src={src} alt={alt} className="max-h-[85vh] w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
  );
}
