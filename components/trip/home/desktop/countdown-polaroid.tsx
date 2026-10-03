"use client";

import { cn } from "@/lib/cn";
import { isPortrait } from "@/lib/cover";
import { CoverUploaderDialog } from "@/components/trip/home/desktop/cover-uploader-dialog";
import { CoverPhotoImage } from "@/components/trips/cover-photo-image";

export interface CountdownPolaroidProps {
  tripId: string;
  url: string;
  /** Trip.coverAspect (width/height); null = unknown → portrait crop. */
  aspect: number | null;
  version?: string | null;
  focalX?: number | null;
  focalY?: number | null;
}

/**
 * The countdown tile's polaroid (spec §4): white frame, 8px sides / 30px
 * bottom, 176px wide, a static 4° tilt (never animated). Portrait is the
 * default crop; a cover known to be landscape gets a landscape window.
 * "Change" opens the cover uploader.
 */
export function CountdownPolaroid({ tripId, url, aspect, version, focalX, focalY }: CountdownPolaroidProps) {
  const landscape = aspect != null && !isPortrait(aspect);
  return (
    <div
      data-polaroid
      className="pointer-events-auto relative mr-[18px] w-[176px] shrink-0 rotate-[4deg] self-center rounded-[10px] border-2 border-border bg-card p-2 pb-[30px] shadow-hard-2"
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[4px] border-2 border-border bg-muted",
          landscape ? "aspect-[4/3]" : "aspect-[3/4]",
        )}
      >
        {/* CoverPhotoImage hides itself on a load error (returns null) rather
            than showing a broken-image glyph — the bg-muted ground above
            shows through, same fallback trip-cover.tsx's CoverArt relies on
            for its generated art. */}
        <CoverPhotoImage
          url={url}
          alt="Trip cover"
          focalX={focalX ?? null}
          focalY={focalY ?? null}
          sizes="176px"
        />
      </div>
      <CoverUploaderDialog
        tripId={tripId}
        hasCover
        coverVersion={version}
        focalX={focalX}
        focalY={focalY}
        trigger={
          <button
            type="button"
            className="absolute inset-0 flex items-end justify-center rounded-[8px] pb-[7px] text-[11px] font-bold text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Change<span className="sr-only"> cover photo</span>
          </button>
        }
      />
    </div>
  );
}

/** No-photo variant's "+ Add a photo" pill (2px dashed ink border); the
 * ::after stretches its hit area to 44px without growing the pill. */
export function AddCoverPhotoButton({ tripId }: { tripId: string }) {
  return (
    <CoverUploaderDialog
      tripId={tripId}
      hasCover={false}
      trigger={
        <button
          type="button"
          className="pointer-events-auto relative inline-flex items-center whitespace-nowrap rounded-full border-2 border-dashed border-border px-2.5 py-1 text-xs font-bold after:absolute after:inset-x-0 after:-inset-y-[9px] after:content-[''] text-foreground hover:bg-card/40 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          + Add a photo
        </button>
      }
    />
  );
}
