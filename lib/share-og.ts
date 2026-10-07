/**
 * The Share link's OG image model (SHARE.md §3: the hero at 1200×630) —
 * name, sub line and the cover's route sketch. Pure, and built only from the
 * public projection (lib/share-lookup.ts): never the uploaded cover photo,
 * never a Traveller.
 */
import { formatDayRange, formatMonthSpan, nightsBetween } from "@/lib/dates";
import { shareStage } from "@/lib/share-view";
import { computeTripPhase } from "@/lib/trip-phase";
import { sketchModel, type Point, type SketchStop } from "@/lib/trips/route-sketch";

/** Same 3:4 box as the hero polaroid's CoverArt (components/trips/trip-cover.tsx). */
const BOX = { w: 100, h: 133, pad: 0.12 } as const;

interface ShareOgSketch {
  points: Point[];
  vbH: number;
  solid: boolean;
}

export interface ShareOgModel {
  name: string;
  subLine: string;
  sketch: ShareOgSketch | null;
}

export function shareOgModel({
  trip,
  stops,
  today,
}: {
  trip: { name: string; startDate: string; endDate: string };
  stops: { id: string; name: string; lat: number | null; lng: number | null; arriveDate: string; departDate: string }[];
  today: string;
}): ShareOgModel {
  const { startDate, endDate } = trip;
  const stage = shareStage(computeTripPhase({ startDate, endDate, today }));
  const s = (n: number) => (n === 1 ? "" : "s");
  const nights = nightsBetween(startDate, endDate);
  const subLine =
    stage === "after"
      ? formatMonthSpan(startDate, endDate)
      : `${formatDayRange(startDate, endDate)} · ${nights} night${s(nights)} · ${stops.length} stop${s(stops.length)}`;

  const located: SketchStop[] = stops.flatMap((st) =>
    st.lat != null && st.lng != null
      ? [{ id: st.id, name: st.name, lat: st.lat, lng: st.lng, nights: nightsBetween(st.arriveDate, st.departDate) }]
      : [],
  );
  const model = sketchModel(located, BOX);

  return {
    name: trip.name,
    subLine,
    sketch: model ? { points: model.points, vbH: BOX.h, solid: stage === "after" } : null,
  };
}
