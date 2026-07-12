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

export function hasOutboundLeg(
  transports: readonly { depIsHome?: boolean | null; toStopId?: string | null }[],
  firstStopId: string | null,
): boolean {
  if (!firstStopId) return false;
  return transports.some((t) => Boolean(t.depIsHome) && t.toStopId === firstStopId);
}

export function hasReturnLeg(
  transports: readonly { arrIsHome?: boolean | null; fromStopId?: string | null }[],
  lastStopId: string | null,
): boolean {
  if (!lastStopId) return false;
  return transports.some((t) => Boolean(t.arrIsHome) && t.fromStopId === lastStopId);
}
