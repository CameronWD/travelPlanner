import { TripCoverCard } from "@/components/trip/trip-cover-card";
import { CoverPhotoImage } from "@/components/trips/cover-photo-image";

/**
 * Phone Trip Home, portrait cover (spec 2026-10-05 §I): a small 3:4 frame
 * beside the trip name in the trip layout's header, showing the whole photo
 * (object-contain, no focal crop) in place of the full-width band. Phones
 * only (sm:hidden) — from sm the band returns. Not interactive: the band it
 * replaces has no tap action either (CoverArt canEdit=false on Home).
 */
export function PortraitCoverFrame({ url, name }: { url: string; name: string }) {
  return (
    <div data-testid="portrait-cover" className="shrink-0 sm:hidden">
      <TripCoverCard className="h-32 w-24 rounded-xl">
        <CoverPhotoImage url={url} alt={`${name} cover photo`} focalX={null} focalY={null} sizes="96px" fit="contain" />
      </TripCoverCard>
    </div>
  );
}
