"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/cn";

const CoverUploaderDialog = dynamic(
  () => import("@/components/trip/home/desktop/cover-uploader-dialog").then((m) => m.CoverUploaderDialog),
  { ssr: false },
);

export interface CoverAddPhotoProps {
  tripId: string;
  hasCover: boolean;
  coverVersion?: string | null;
  focalX?: number | null;
  focalY?: number | null;
}

/**
 * TRIP_COVER.md §2 "Adding a photo": an "Add photo" / "Change" pill over the
 * frame, visible on hover or focus. On a coarse pointer (phone/tablet) the
 * pill is hidden entirely rather than sitting over the whole polaroid and
 * hijacking taps (I6) — the trips-page cover isn't where a touch Traveller
 * adds a photo; the trip Home's own Add-photo / Change controls are.
 */
export function CoverAddPhoto({ tripId, hasCover, coverVersion, focalX, focalY }: CoverAddPhotoProps) {
  return (
    <CoverUploaderDialog
      tripId={tripId}
      hasCover={hasCover}
      coverVersion={coverVersion}
      focalX={focalX}
      focalY={focalY}
      trigger={
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute inset-0 z-10 flex items-end justify-center rounded-[8px] pb-1 opacity-0 transition-opacity",
            "hover:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden",
            "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="whitespace-nowrap shrink-0 rounded-full border-2 border-border bg-card px-2.5 py-1 text-[11px] font-extrabold text-foreground shadow-hard-1">
            {hasCover ? "Change" : "Add photo"}
            <span className="sr-only"> cover photo</span>
          </span>
        </button>
      }
    />
  );
}
