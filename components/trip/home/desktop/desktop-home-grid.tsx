import type { ReactNode } from "react";
import { HOME_GRID_GAP_DESKTOP_ONLY } from "@/components/trip/home/spacing";

/**
 * The desktop Home's 12-column content grid (spec 2026-09-27-desktop-home §3).
 * Row 1 is 300px with a cover photo (Countdown 8 · Shared pot 4), 200px
 * without (6 · 6) — so the map and "Sort these out" get the extra height.
 * Row 2 is always Route map 7 · Sort these out 5 and fills what's left; the
 * min-height gives that row real room when the page itself isn't
 * height-constrained. Every slot stretches to fill its cell.
 */
const GRID_BASE = `grid grid-cols-12 ${HOME_GRID_GAP_DESKTOP_ONLY} flex-1 min-h-[calc(100dvh-14rem)]`;

const DESKTOP_GRID_CLASS_COVER = `${GRID_BASE} grid-rows-[300px_1fr]`;
const DESKTOP_GRID_CLASS_NO_COVER = `${GRID_BASE} grid-rows-[200px_1fr]`;

export function desktopHomeGridClass(hasCover: boolean): string {
  return hasCover ? DESKTOP_GRID_CLASS_COVER : DESKTOP_GRID_CLASS_NO_COVER;
}

const SLOT = "flex min-h-0 min-w-0 flex-col *:flex-1";

export const DESKTOP_GRID_SPANS = {
  cover: {
    countdown: `col-span-8 ${SLOT}`,
    pot: `col-span-4 ${SLOT}`,
  },
  noCover: {
    countdown: `col-span-6 ${SLOT}`,
    pot: `col-span-6 ${SLOT}`,
  },
  map: `col-span-7 ${SLOT}`,
  sort: `col-span-5 ${SLOT}`,
} as const;

export interface DesktopHomeGridProps {
  hasCover: boolean;
  countdown: ReactNode;
  pot: ReactNode;
  map: ReactNode;
  sort: ReactNode;
}

export function DesktopHomeGrid({ hasCover, countdown, pot, map, sort }: DesktopHomeGridProps) {
  const row1 = hasCover ? DESKTOP_GRID_SPANS.cover : DESKTOP_GRID_SPANS.noCover;
  return (
    <div className={desktopHomeGridClass(hasCover)}>
      <div className={row1.countdown}>{countdown}</div>
      <div className={row1.pot}>{pot}</div>
      <div className={DESKTOP_GRID_SPANS.map}>{map}</div>
      <div className={DESKTOP_GRID_SPANS.sort}>{sort}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Travelling (spec D): row 1 the "Day N of M" countdown + Spend so far (same
// 300px/200px heights and 8·4 / 6·6 split as Planning), row 2 Today 7 · Day
// map 5 (at least 26rem, grows with the day's plan), row 3 Today's journal
// full width — always last.
// ---------------------------------------------------------------------------

const TRAVELLING_BASE = `grid grid-cols-12 ${HOME_GRID_GAP_DESKTOP_ONLY}`;

export const TRAVELLING_GRID_CLASS_COVER = `${TRAVELLING_BASE} grid-rows-[300px_minmax(26rem,auto)_auto]`;
export const TRAVELLING_GRID_CLASS_NO_COVER = `${TRAVELLING_BASE} grid-rows-[200px_minmax(26rem,auto)_auto]`;

export function travellingDesktopGridClass(hasCover: boolean): string {
  return hasCover ? TRAVELLING_GRID_CLASS_COVER : TRAVELLING_GRID_CLASS_NO_COVER;
}

export const TRAVELLING_GRID_SPANS = {
  cover: {
    countdown: `col-span-8 ${SLOT}`,
    spend: `col-span-4 ${SLOT}`,
  },
  noCover: {
    countdown: `col-span-6 ${SLOT}`,
    spend: `col-span-6 ${SLOT}`,
  },
  today: `col-span-7 ${SLOT}`,
  map: `col-span-5 ${SLOT}`,
  journal: `col-span-12 ${SLOT}`,
} as const;

export interface TravellingDesktopGridProps {
  hasCover: boolean;
  countdown: ReactNode;
  spend: ReactNode;
  today: ReactNode;
  map: ReactNode;
  /** Today's journal — null (no row) when there is no signed-in Traveller slot. */
  journal: ReactNode | null;
}

export function TravellingDesktopGrid({ hasCover, countdown, spend, today, map, journal }: TravellingDesktopGridProps) {
  const row1 = hasCover ? TRAVELLING_GRID_SPANS.cover : TRAVELLING_GRID_SPANS.noCover;
  return (
    <div className={travellingDesktopGridClass(hasCover)}>
      <div className={row1.countdown}>{countdown}</div>
      <div className={row1.spend}>{spend}</div>
      <div className={TRAVELLING_GRID_SPANS.today}>{today}</div>
      <div className={TRAVELLING_GRID_SPANS.map}>{map}</div>
      {journal != null ? <div className={TRAVELLING_GRID_SPANS.journal}>{journal}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Past (spec D): the existing wrap-up content as tiles — row 1 the "Back
// home" countdown + the "That's a wrap" tile (heading + CTAs), row 2 the three
// stat tiles 4 · 4 · 4, row 3 the route map full width.
// ---------------------------------------------------------------------------

const PAST_BASE = `grid grid-cols-12 ${HOME_GRID_GAP_DESKTOP_ONLY}`;

const PAST_GRID_CLASS_COVER = `${PAST_BASE} grid-rows-[300px_auto_auto]`;
const PAST_GRID_CLASS_NO_COVER = `${PAST_BASE} grid-rows-[200px_auto_auto]`;

export function pastDesktopGridClass(hasCover: boolean): string {
  return hasCover ? PAST_GRID_CLASS_COVER : PAST_GRID_CLASS_NO_COVER;
}

export const PAST_GRID_SPANS = {
  cover: {
    countdown: `col-span-8 ${SLOT}`,
    wrap: `col-span-4 ${SLOT}`,
  },
  noCover: {
    countdown: `col-span-6 ${SLOT}`,
    wrap: `col-span-6 ${SLOT}`,
  },
  stat: `col-span-4 ${SLOT}`,
  map: `col-span-12 ${SLOT}`,
} as const;

export interface PastDesktopGridProps {
  hasCover: boolean;
  countdown: ReactNode;
  wrap: ReactNode;
  /** The three stat tiles (Nights · Trip cost · Paid so far). */
  stats: ReactNode[];
  map: ReactNode;
}

export function PastDesktopGrid({ hasCover, countdown, wrap, stats, map }: PastDesktopGridProps) {
  const row1 = hasCover ? PAST_GRID_SPANS.cover : PAST_GRID_SPANS.noCover;
  return (
    <div className={pastDesktopGridClass(hasCover)}>
      <div className={row1.countdown}>{countdown}</div>
      <div className={row1.wrap}>{wrap}</div>
      {stats.map((stat, i) => (
        <div key={i} className={PAST_GRID_SPANS.stat}>
          {stat}
        </div>
      ))}
      <div className={PAST_GRID_SPANS.map}>{map}</div>
    </div>
  );
}
