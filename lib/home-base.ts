export interface HomeBase { name: string; lat: number | null; lng: number | null; countryCode: string | null }
export interface EndpointView { label: string | null; lat: number | null; lng: number | null; isHome: boolean }

export function tripHomeBase(trip: {
  homeName: string | null; homeLat: number | null; homeLng: number | null; homeCountryCode: string | null;
}): HomeBase | null {
  if (!trip.homeName) return null;
  return { name: trip.homeName, lat: trip.homeLat, lng: trip.homeLng, countryCode: trip.homeCountryCode };
}

export function resolveEndpoint(opts: {
  isHome: boolean;
  stopId?: string | null;
  place?: string | null;
  lat?: number | null;
  lng?: number | null;
  home: HomeBase | null;
  stopsById: Record<string, { name: string; lat: number | null; lng: number | null }>;
}): EndpointView {
  if (opts.isHome && opts.home) {
    return { label: opts.home.name, lat: opts.home.lat, lng: opts.home.lng, isHome: true };
  }
  if (opts.stopId && opts.stopsById[opts.stopId]) {
    const s = opts.stopsById[opts.stopId];
    return { label: s.name, lat: s.lat, lng: s.lng, isHome: false };
  }
  if (opts.place) {
    return { label: opts.place, lat: opts.lat ?? null, lng: opts.lng ?? null, isHome: false };
  }
  return { label: null, lat: null, lng: null, isHome: false };
}

/** The fields the leg rule reads (Transport rows, Flag inputs and plan-editor legs all fit). */
export interface LegLike {
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
  fromStopId?: string | null;
  toStopId?: string | null;
}

/**
 * The outbound leg (ADR 0032, amended 2026-09-29): a Transport arriving at the
 * first Stop whose departure is not another Stop — Home-flagged, a free-text
 * place ("Brisbane"), or unset. A Home-flagged candidate wins. This is the one
 * rule: the plan editor's bookends, the Flags and Next steps all use it, and
 * so does the Day view's stop line.
 */
export function findOutboundLeg<T extends LegLike>(transports: readonly T[], firstStopId: string | null): T | null {
  if (!firstStopId) return null;
  const candidates = transports.filter((t) => t.toStopId === firstStopId && !t.fromStopId);
  return candidates.find((t) => Boolean(t.depIsHome)) ?? candidates[0] ?? null;
}

/** The return leg: a Transport departing the last Stop whose arrival is not another Stop. A Home-flagged candidate wins. */
export function findReturnLeg<T extends LegLike>(transports: readonly T[], lastStopId: string | null): T | null {
  if (!lastStopId) return null;
  const candidates = transports.filter((t) => t.fromStopId === lastStopId && !t.toStopId);
  return candidates.find((t) => Boolean(t.arrIsHome)) ?? candidates[0] ?? null;
}

export function hasOutboundLeg(transports: readonly LegLike[], firstStopId: string | null): boolean {
  return findOutboundLeg(transports, firstStopId) !== null;
}

export function hasReturnLeg(transports: readonly LegLike[], lastStopId: string | null): boolean {
  return findReturnLeg(transports, lastStopId) !== null;
}
