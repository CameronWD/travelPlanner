"use client";
import * as React from "react";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";

const THRESHOLD = 40;
const IGNORE = "[data-day-strip],[data-journal],.leaflet-container,[data-day-map]";

/**
 * Horizontal swipe on the page body changes day (DAY_VIEW §3.4). The motion
 * itself is the body's View Transition (ADR 0063), tagged here by direction —
 * the page holds until the next day is ready, then slides.
 */
export function DaySwipe({ prevHref, nextHref, children }: { prevHref: string | null; nextHref: string | null; children: React.ReactNode }) {
  const router = useAppRouter();
  const start = React.useRef<{ x: number; y: number; ignore: boolean } | null>(null);

  return (
    <div
      onTouchStart={(e) => {
        const t = e.target as Node;
        // React touch events bubble through portals, so a gesture inside an
        // Item/edit dialog (Radix portal) reaches this handler even though
        // its node lives outside the wrapper — `contains` excludes those.
        // The strip and journal scroll on their own, and the Day map pans.
        const own = e.currentTarget.contains(t);
        const el = t instanceof Element ? t : t.parentElement;
        const ignore = !own || !!el?.closest(IGNORE);
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ignore };
      }}
      onTouchEnd={(e) => {
        const s = start.current; start.current = null;
        if (!s || s.ignore) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
        const href = dx < 0 ? nextHref : prevHref;
        if (!href) return;
        router.push(href, { transitionTypes: [dx < 0 ? DAY_FORWARD : DAY_BACK] });
      }}
    >
      {children}
    </div>
  );
}
