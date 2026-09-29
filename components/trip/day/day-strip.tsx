"use client";

import * as React from "react";
import { AppLink } from "@/components/navigation/app-link";
import { useNavState } from "@/components/navigation/navigation-pending";
import { DAY_FORWARD, dayTransitionType } from "@/components/trip/day/day-transition";
import { cn } from "@/lib/cn";
import { formatDayLabel, parseISODate } from "@/lib/dates";
import { stopDotClass } from "@/lib/stop-colours";
import { dotsFor, type CitySegment } from "@/lib/day-view-model";
import { desktopStripScroll, phoneStripScroll, STRIP_CHIP_GAP_PX } from "@/components/trip/day/strip-scroll";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Where the Traveller left each desktop strip, keyed `${tripId}:${size}`.
 * The strip lives inside the Day page, which remounts on every day change
 * (ADR 0063), so without this it would snap back to the first day each time.
 * Module state: kept across client navigations, reset by a full load — so a
 * first render starts at the first day (spec 2026-09-29 D2).
 */
const lastScrollLeft = new Map<string, number>();

export function DayStrip({ tripId, dates, segments, size }: { tripId: string; dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; segments: CitySegment[]; size: "desktop" | "phone" }) {
  const phone = size === "phone";
  const scroller = React.useRef<HTMLDivElement>(null);
  const memoryKey = `${tripId}:${size}`;

  // Put the selected chip in view with scrollLeft (not scrollIntoView —
  // DAY_VIEW §3.3), before paint so the strip never visibly jumps. `scroller`
  // wraps both the chip nav and the desktop line row (one scroll container,
  // DV-01). Desktop at lg+ uses the minimal-scroll rule; phone — and the
  // md–lg band, which shows this desktop strip but is "< lg" — keep the old
  // selected-day-third rule.
  React.useLayoutEffect(() => {
    const nav = scroller.current;
    if (!nav) return;
    const el = nav.querySelector<HTMLElement>('[aria-current="date"]');
    if (!el) return;
    const wide = !phone && window.matchMedia("(min-width: 1024px)").matches;
    const chip = el.getBoundingClientRect();
    const input = {
      scrollLeft: wide ? (lastScrollLeft.get(memoryKey) ?? 0) : nav.scrollLeft,
      viewportWidth: nav.clientWidth,
      contentWidth: nav.scrollWidth,
      chipLeft: chip.left - nav.getBoundingClientRect().left + nav.scrollLeft,
      chipWidth: chip.width,
      gap: STRIP_CHIP_GAP_PX,
    };
    nav.scrollLeft = wide ? desktopStripScroll(input) : phoneStripScroll(input);
  }, [phone, memoryKey]);

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
  // aria-current="date" is the server's answer alone — the day actually shown.
  const { effectivePathname: path, pendingPathname } = useNavState();
  const serverCurrent = dates.find((d) => d.isCurrent)?.iso ?? null;
  const isLit = (iso: string) => (path.includes("/day/") ? path.endsWith(`/day/${iso}`) : iso === serverCurrent);
  const isPendingChip = (iso: string) => pendingPathname != null && pendingPathname.endsWith(`/trips/${tripId}/day/${iso}`);

  const n = dates.length;
  return (
    <div data-day-strip className={cn("flex flex-col gap-2", phone && "-mr-[18px]")}>
      <div
        ref={scroller}
        data-day-strip-scroller
        // One scroll container for the chip nav and the desktop city legend
        // (DV-01: they used to scroll separately, so the legend's cells drifted
        // out from under their chips). Snap is phone-only — desktop never had it.
        className={cn(
          "flex flex-col gap-2 overflow-x-auto [scrollbar-width:none]",
          phone ? "snap-x snap-mandatory pr-[18px]" : "",
        )}
        onScroll={phone ? undefined : (e) => lastScrollLeft.set(memoryKey, e.currentTarget.scrollLeft)}
      >
        <nav aria-label="Days" className="flex w-max gap-2">
          {dates.map((d) => {
            const dt = parseISODate(d.iso);
            const dots = dotsFor(d.count);
            const label = `${formatDayLabel(d.iso)}, ${d.count === 0 ? "nothing planned" : `${d.count} ${d.count === 1 ? "thing" : "things"} planned`}`;
            return (
              <AppLink
                key={d.iso}
                href={`/trips/${tripId}/day/${d.iso}`}
                aria-current={d.isCurrent ? "date" : undefined}
                data-pending={isPendingChip(d.iso) ? "true" : undefined}
                aria-label={label}
                transitionTypes={[serverCurrent ? dayTransitionType(serverCurrent, d.iso) : DAY_FORWARD]}
                className={cn(
                  "relative flex shrink-0 snap-start flex-col items-center justify-center rounded-[14px] border-2 border-border text-foreground",
                  phone ? "h-[58px] w-12" : "h-[62px] w-14",
                  isLit(d.iso) ? "island bg-coral shadow-hard-1" : "bg-card",
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
          <div className="grid w-max gap-2" style={{ gridTemplateColumns: `repeat(${n}, 3.5rem)` }} aria-hidden="true">
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
    </div>
  );
}
