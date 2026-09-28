import Image, { type ImageLoader } from "next/image";
import type { Hue } from "@/lib/hues";
import { sketchModel, type SketchStop } from "@/lib/trips/route-sketch";
import { Polaroid, type PolaroidSize } from "@/components/trips/polaroid";
import { CoverRouteSketch } from "@/components/trips/cover-route-sketch";
import { CoverStamp, stampPlace } from "@/components/trips/cover-stamp";
import { CoverAddPhoto } from "@/components/trips/cover-add-photo";
import { cn } from "@/lib/cn";

/** The cover route is member-gated; the optimizer must never fetch it (see countdown-polaroid.tsx). */
const passthroughLoader: ImageLoader = ({ src }) => src;

export interface TripCoverInput {
  tripId: string;
  name: string;
  hue: Hue;
  /** Uploaded photo, or null → generated cover. `url` already carries `?v=`. */
  photo: { url: string; focalX: number | null; focalY: number | null; version?: string | null } | null;
  /** Located real-plan Stops in plan order, Home base excluded. */
  stops: SketchStop[];
  startDate: string | null;
  /** Show the Add photo / Change pill. */
  canEdit: boolean;
}

const BOX = { hero: { w: 100, h: 133, pad: 0.12 }, small: { w: 100, h: 100, pad: 0.12 } } as const;
const SIZES_PX: Record<PolaroidSize, string> = { hero: "(min-width: 768px) 300px, 172px", small: "184px", "mobile-hero": "172px" };

/** TRIP_COVER.md §1: photo → route sketch → passport stamp. The art alone; no frame. */
export function CoverArt({
  tripId, name, hue, photo, stops, startDate, canEdit, size, box = size === "hero" ? "3:4" : "1:1", sizesPx = "300px", className,
}: TripCoverInput & { size: "hero" | "small"; box?: "3:4" | "1:1" | "band"; sizesPx?: string; className?: string }) {
  let art: React.ReactNode;
  let caption: string | null = null;
  // Band mode (trip Home): the hero's 3:4 sketch is centred inside the full-width/-height
  // band rather than stretched to fill it. The band's own ground carries the same faint
  // grid as the sketch (below) so the letterboxed sides read as one continuous map, not a
  // gap either side of the art.
  let bandGround = false;
  if (photo) {
    art = (
      <Image
        src={photo.url}
        alt={`${name} cover photo`}
        fill
        sizes={sizesPx}
        loader={passthroughLoader}
        className="object-cover"
        style={{ objectPosition: `${(photo.focalX ?? 0.5) * 100}% ${(photo.focalY ?? 0.5) * 100}%` }}
      />
    );
  } else {
    const model = sketchModel(stops, box === "1:1" ? BOX.small : BOX.hero);
    if (model) {
      caption = model.caption;
      if (box === "band") {
        bandGround = true;
        art = (
          <div className="relative mx-auto h-full aspect-[3/4]">
            <CoverRouteSketch model={model} size={size} hue={hue} />
          </div>
        );
      } else {
        art = <CoverRouteSketch model={model} size={size} hue={hue} />;
      }
    } else {
      art = <CoverStamp name={name} place={stampPlace({ stops, name, size })} startDate={startDate} hue={hue} size={size} />;
    }
  }
  return (
    <div data-cover-caption={caption ?? undefined} className={cn("relative size-full", bandGround && "bg-map-fill", className)}>
      {bandGround ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
      ) : null}
      {art}
      {canEdit ? <CoverAddPhoto tripId={tripId} hasCover={photo != null} coverVersion={photo?.version} focalX={photo?.focalX} focalY={photo?.focalY} /> : null}
    </div>
  );
}

/** The tilted polaroid used on every trips-page card. */
export function TripCover({ size, index, className, ...input }: TripCoverInput & { size: PolaroidSize; index?: number; className?: string }) {
  const artSize = size === "small" ? "small" : "hero";
  const model = input.photo ? null : sketchModel(input.stops, artSize === "small" ? BOX.small : BOX.hero);
  return (
    <Polaroid size={size} index={index} caption={size === "hero" ? model?.caption : null} className={className}>
      <CoverArt {...input} size={artSize} sizesPx={SIZES_PX[size]} />
    </Polaroid>
  );
}
