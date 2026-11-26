import { bookingPartners, type ConnectionLeg } from "@/lib/connections";
import { legLabel, placeCode, type LegStop, type LegTransport } from "@/lib/plan/leg-label";
import { TRANSPORT_MODE_META } from "@/lib/transport";

export interface SharedFile<A> { attachment: A; filedOn: string | null }

export function filesForLeg<A, T extends ConnectionLeg>(
  leg: T, legs: readonly T[], ownFiles: (id: string) => readonly A[], labelOf: (leg: T) => string,
): SharedFile<A>[] {
  const partners = bookingPartners(legs).get(leg.id) ?? [];
  return [
    ...ownFiles(leg.id).map((attachment) => ({ attachment, filedOn: null })),
    ...partners.flatMap((p) => {
      const filedOn = labelOf(p);
      return ownFiles(p.id).map((attachment) => ({ attachment, filedOn }));
    }),
  ];
}

export function bookingLegLabel(t: LegTransport, stops: readonly LegStop[], homeName?: string | null): string {
  const word = t.mode === "CAR" ? "Drive" : TRANSPORT_MODE_META[t.mode].label;
  const route = legLabel(t, stops, homeName).label.slice(word.length).trim().replace(/^in /, "");
  if (route) return route;
  const end = (isHome: boolean | null | undefined, stopId: string | null | undefined, place: string | null | undefined) =>
    place ? placeCode(place) : isHome ? (homeName ?? "home") : (stops.find((s) => s.id === stopId)?.name ?? null);
  return [end(t.depIsHome, t.fromStopId, t.depPlace), end(t.arrIsHome, t.toStopId, t.arrPlace)].filter(Boolean).join(" → ");
}
