"use client";

import type { Route } from "next";
import * as React from "react";
import { tripPath } from "@/lib/trip-path";
import { formatDayLabel } from "@/lib/dates";
import type { TravellerLike } from "@/lib/traveller";
import type { RecentActivity } from "@/components/trip/notification-bell";
import { DayCarousel, DayChromeRegistryContext, type DayChromeRegistryApi, type DayPanel } from "@/components/trip/day/day-carousel";
import { DayHeader } from "@/components/trip/day/day-header";

/**
 * `seed` is the headers the server rendered with this page, so the first paint
 * shows the real one before any slot registers. It is read on every render: a
 * day change keeps this registry mounted and brings a new seed.
 */
export function DayChromeRegistry({ seed, children }: { seed: Record<string, React.ReactNode>; children: React.ReactNode }) {
  const [chromes, setChromes] = React.useState(() => new Map<string, React.ReactNode>());
  const register = React.useCallback((iso: string, chrome: React.ReactNode) => {
    setChromes((prev) => (prev.get(iso) === chrome ? prev : new Map(prev).set(iso, chrome)));
  }, []);
  const api = React.useMemo<DayChromeRegistryApi>(() => ({ register, chromeFor: (iso) => seed[iso] ?? chromes.get(iso) }), [register, seed, chromes]);
  return <DayChromeRegistryContext.Provider value={api}>{children}</DayChromeRegistryContext.Provider>;
}

export function RegisterDayChrome({ iso, chrome }: { iso: string; chrome: React.ReactNode }) {
  const { register } = React.useContext(DayChromeRegistryContext);
  React.useEffect(() => register(iso, chrome), [register, iso, chrome]);
  return null;
}

export interface DayChromeFallbackInputs {
  tripId: string;
  tripSlug: string;
  tripName: string;
  days: Array<{ iso: string; heading: string }>;
  unreadCount: number;
  recent: RecentActivity[];
  members: TravellerLike[];
  slimOnPhone: boolean;
}

/**
 * The Day carousel with its header registry. The page cannot hand
 * `DayCarousel` a function, so the date-only header for a slot that has not
 * filled is built here, from what the page could serialise.
 */
export function DayCarouselFrame({
  panels,
  shownDate,
  chrome,
  seed,
  fallback,
}: {
  panels: DayPanel[];
  shownDate: string;
  chrome: React.ReactNode;
  seed: Record<string, React.ReactNode>;
  fallback: DayChromeFallbackInputs;
}) {
  const chromeFallback = React.useCallback(
    (iso: string) => {
      const { days } = fallback;
      const i = days.findIndex((d) => d.iso === iso);
      const prev = days[i - 1]?.iso ?? null;
      const next = days[i + 1]?.iso ?? null;
      const href = (day: string | null): Route | null => (day ? tripPath(fallback.tripSlug, `/day/${day}`) : null);
      return (
        <DayHeader
          tripId={fallback.tripId}
          tripSlug={fallback.tripSlug}
          tripName={fallback.tripName}
          eyebrow=""
          heading={days[i]?.heading ?? formatDayLabel(iso)}
          subLine=""
          subLineCompact=""
          dayTitle={null}
          prevHref={href(prev)}
          nextHref={href(next)}
          prevLabel={prev ? `Previous day: ${formatDayLabel(prev)}` : null}
          nextLabel={next ? `Next day: ${formatDayLabel(next)}` : null}
          unreadCount={fallback.unreadCount}
          recent={fallback.recent}
          members={fallback.members}
          addButton={null}
          slimOnPhone={fallback.slimOnPhone}
        />
      );
    },
    [fallback],
  );
  return (
    <DayChromeRegistry seed={seed}>
      <DayCarousel panels={panels} shownDate={shownDate} chrome={chrome} chromeFallback={chromeFallback} />
    </DayChromeRegistry>
  );
}
