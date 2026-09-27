import type { ReactNode } from "react";

/**
 * The desktop Home's 12-column content grid (spec 2026-09-27-desktop-home §3).
 * Row 1 is 300px with a cover photo (Countdown 8 · Shared pot 4), 200px
 * without (6 · 6) — so the map and "Sort these out" get the extra height.
 * Row 2 is always Route map 7 · Sort these out 5 and fills what's left; the
 * min-height gives that row real room when the page itself isn't
 * height-constrained. Every slot stretches to fill its cell.
 */
const GRID_BASE = "grid grid-cols-12 gap-[18px] flex-1 min-h-[calc(100dvh-14rem)]";

export const DESKTOP_GRID_CLASS_COVER = `${GRID_BASE} grid-rows-[300px_1fr]`;
export const DESKTOP_GRID_CLASS_NO_COVER = `${GRID_BASE} grid-rows-[200px_1fr]`;

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
