import { routeSnapshotModel, routeSnapshotPath, SNAPSHOT_SIZE, type RouteSnapshotModel, type SnapshotShape } from "@/lib/trips/route-snapshot";
import { staticMapUrl } from "@/lib/map/static-map";
import { mapsConfig, staticMapId } from "@/lib/map/google-config";
import { Polaroid, type PolaroidSize } from "@/components/trips/polaroid";
import { CoverRouteSnapshot } from "@/components/trips/cover-route-snapshot";
import { CoverStamp, stampPlace } from "@/components/trips/cover-stamp";
import { CoverAddPhoto } from "@/components/trips/cover-add-photo";
import { CoverPhotoImage } from "@/components/trips/cover-photo-image";
import { cn } from "@/lib/cn";
import type { TripCoverInput } from "@/lib/trips/trip-views";

const SIZES_PX: Record<PolaroidSize, string> = { hero: "(min-width: 768px) 300px, 172px", small: "184px", "mobile-hero": "172px" };

function shapeFor(box: "3:4" | "1:1" | "band"): SnapshotShape {
  return box === "band" ? "band" : box === "1:1" ? "square" : "tall";
}

// The public share page has no signed-in member, so it cannot use the member-gated route:
// it builds the Google static map URL itself, from the same pins.
function directSnapshotUrl(model: RouteSnapshotModel, shape: SnapshotShape): string | null {
  const maps = mapsConfig();
  if (!maps) return null;
  return staticMapUrl({
    key: maps.apiKey,
    mapId: staticMapId() ?? maps.mapId,
    ...SNAPSHOT_SIZE[shape],
    stops: model.pins.map((p) => ({ id: String(p.number), lat: p.lat, lng: p.lng, sortOrder: p.sortOrder, number: p.number })),
    home: null,
    showReturn: false,
  });
}

/** TRIP_COVER.md §1: photo → route snapshot → passport stamp. The art alone; no frame. */
export function CoverArt({
  tripId, name, hue, photo, stops, startDate, stampDateLabel, canEdit, size, box = size === "hero" ? "3:4" : "1:1", sizesPx = "300px", className, snapshot = "api",
}: TripCoverInput & { size: "hero" | "small"; box?: "3:4" | "1:1" | "band"; sizesPx?: string; className?: string; snapshot?: "api" | "direct" }) {
  const stamp = <CoverStamp name={name} place={stampPlace({ stops, name, size })} startDate={startDate} dateLabel={stampDateLabel ?? undefined} hue={hue} size={size} />;
  let generatedArt: React.ReactNode = stamp;
  let caption: string | null = null;
  // A photo layers over the stamp, never over the map: a photo-covered Trip makes no map request.
  const model = photo ? null : routeSnapshotModel(stops);
  if (model) {
    const shape = shapeFor(box);
    const src = snapshot === "direct" ? directSnapshotUrl(model, shape) : routeSnapshotPath(tripId, model, shape);
    if (src) {
      caption = model.caption;
      generatedArt = <CoverRouteSnapshot src={src} chip={model.chip} size={size} fallback={stamp} />;
    }
  }
  // A Client Component: next/image's `loader` function cannot cross the
  // server→client boundary from here (React #441 in production).
  const art = photo ? (
    <>
      {generatedArt}
      <CoverPhotoImage url={photo.url} alt={`${name} cover photo`} focalX={photo.focalX} focalY={photo.focalY} sizes={sizesPx} />
    </>
  ) : (
    generatedArt
  );
  return (
    <div data-cover-caption={caption ?? undefined} className={cn("relative size-full", className)}>
      {art}
      {canEdit ? <CoverAddPhoto tripId={tripId} hasCover={photo != null} coverVersion={photo?.version} focalX={photo?.focalX} focalY={photo?.focalY} /> : null}
    </div>
  );
}

/** The tilted polaroid used on every trips-page card. */
export function TripCover({ size, index, className, ...input }: TripCoverInput & { size: PolaroidSize; index?: number; className?: string }) {
  const artSize = size === "small" ? "small" : "hero";
  const model = input.photo ? null : routeSnapshotModel(input.stops);
  return (
    <Polaroid size={size} index={index} caption={size === "hero" ? model?.caption : null} className={className}>
      <CoverArt {...input} size={artSize} sizesPx={SIZES_PX[size]} />
    </Polaroid>
  );
}
