"use client";

import * as React from "react";
import { AppLink } from "@/components/navigation/app-link";
import { useEffectivePathname } from "@/components/navigation/navigation-pending";
import { DAY_FORWARD, dayTransitionType } from "@/components/trip/day/day-transition";
import { cn } from "@/lib/cn";
import { formatDayLabel, parseISODate } from "@/lib/dates";
import { stopDotClass } from "@/lib/stop-colours";
import { dotsFor, type CitySegment } from "@/lib/day-view-model";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function DayStrip({ tripId, dates, segments, size }: { tripId: string; dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; segments: CitySegment[]; size: "desktop" | "phone" }) {
  const phone = size === "phone";
  const scroller = React.useRef<HTMLElement>(null);

  // Phone: put the current chip in view with scrollLeft (not scrollIntoView — DAY_VIEW §3.3).
  // useLayoutEffect (not useEffect) so the scroll offset is applied before the
  // browser paints — otherwise the chip visibly starts at the left edge and
  // jumps into place on the first frame.
  React.useLayoutEffect(() => {
    if (!phone || !scroller.current) return;
    const nav = scroller.current;
    const el = nav.querySelector<HTMLElement>('[aria-current="date"]');
    if (!el) return;
    // The chip's offset within the scroller (offsetLeft is relative to the
    // offsetParent, not the nav), less two chips (48px + 8px gap each) so the
    // current day sits third with its two predecessors fully in view — as in
    // the handoff's day-mobile-*.png.
    const offset = el.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    nav.scrollLeft = Math.max(0, offset - 2 * 56);
  }, [phone]);

  // Desktop: a vertical wheel gesture over the strip scrolls it horizontally
  // instead — but only when the strip actually has overflow to scroll, and
  // only by *not* also scrolling the page vertically. React's onWheel is
  // registered passively at the root, so calling preventDefault from a
  // synthetic handler is a no-op (and can warn); a native listener with
  // `{ passive: false }` is required to actually suppress the page scroll.
  React.useEffect(() => {
    if (phone) return;
    const el = scroller.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.deltaX !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [phone]);

  // The chip lights the moment it is tapped (ADR 0063): while a navigation to
  // another day is in flight the effective pathname already names it. Any
  // other pending target (a section switch) keeps the server's answer.
  const path = useEffectivePathname();
  const serverCurrent = dates.find((d) => d.isCurrent)?.iso ?? null;
  const isCurrent = (iso: string) => (path.includes("/day/") ? path.endsWith(`/day/${iso}`) : iso === serverCurrent);

  const n = dates.length;
  return (
    <div data-day-strip className={cn("flex flex-col gap-2", phone && "-mr-[18px]")}>
      <nav
        ref={scroller}
        aria-label="Days"
        className={cn(
          phone
            ? "flex snap-x snap-mandatory gap-2 overflow-x-auto pr-[18px] [scrollbar-width:none]"
            : "grid gap-2 overflow-x-auto [scrollbar-width:none]",
        )}
        style={phone ? undefined : { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {dates.map((d) => {
          const dt = parseISODate(d.iso);
          const dots = dotsFor(d.count);
          const label = `${formatDayLabel(d.iso)}, ${d.count === 0 ? "nothing planned" : `${d.count} ${d.count === 1 ? "thing" : "things"} planned`}`;
          return (
            <AppLink
              key={d.iso}
              href={`/trips/${tripId}/day/${d.iso}`}
              aria-current={isCurrent(d.iso) ? "date" : undefined}
              aria-label={label}
              transitionTypes={[serverCurrent ? dayTransitionType(serverCurrent, d.iso) : DAY_FORWARD]}
              className={cn(
                "relative flex shrink-0 snap-start flex-col items-center justify-center rounded-[14px] border-2 border-border text-foreground",
                phone ? "h-[58px] w-12" : "h-[62px] min-w-0",
                isCurrent(d.iso) ? "island bg-coral shadow-hard-1" : "bg-card",
              )}
            >
              <span className="text-[11px] font-bold leading-none">{WEEKDAY[dt.getUTCDay()]}</span>
              <span className="mt-0.5 font-display text-[20px] font-extrabold leading-none">{dt.getUTCDate()}</span>
              <span className="mt-1 flex h-1.5 gap-1">
                {Array.from({ length: dots }, (_, i) => <span key={i} data-dot className="size-1.5 rounded-full bg-current" />)}
              </span>
              {d.isToday ? <span data-today-underline aria-hidden="true" className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-coral" /> : null}
            </AppLink>
          );
        })}
      </nav>
      {!phone && segments.length > 0 ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
          {segments.map((s) => (
            <div key={`${s.name}-${s.startIndex}`} data-city-segment className="flex min-w-0 items-center gap-1.5" style={{ gridColumn: `${s.startIndex + 1} / span ${s.span}` }}>
              <span className={cn("size-2 shrink-0 rounded-full border border-border", stopDotClass(s.hueIndex))} />
              <span className="truncate text-xs font-bold text-foreground">{s.name}</span>
              <span className="h-0.5 min-w-2 flex-1 rounded-full bg-border-soft" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
