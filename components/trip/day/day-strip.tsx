"use client";

import * as React from "react";
import { AppLink } from "@/components/navigation/app-link";
import { useNavState } from "@/components/navigation/navigation-pending";
import { DAY_FORWARD, dayTransitionType } from "@/components/trip/day/day-transition";
import { useDayCarousel } from "@/components/trip/day/day-carousel";
import { prefersReducedMotion, tweenScrollLeft } from "@/components/trip/day/scroll-tween";
import { cn } from "@/lib/cn";
import { formatDayLabel, parseISODate } from "@/lib/dates";
import { stopDotClass } from "@/lib/stop-colours";
import { dotsFor, type StopLine } from "@/lib/day-view-model";
import { desktopStripScroll, phoneStripScroll, STRIP_CHIP_GAP_PX, type StripScrollInput } from "@/components/trip/day/strip-scroll";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { useTripHref } from "@/components/trip/use-trip-href";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Where the Traveller left each strip, keyed `${tripId}:${size}`. The strip
 * lives inside the Day page, which remounts on every day change (ADR 0063),
 * so without this it would snap to the target on each remount instead of
 * gliding there. Module state: kept across client navigations, reset by a
 * full load — a first render is positioned cold, with no glide.
 */
const lastScrollLeft = new Map<string, number>();

/** The scroll position the rule for this size wants for `chip`, `shiftPx` to its right. */
function targetFor(nav: HTMLElement, chip: HTMLElement, useDesktopRule: boolean, from: number, shiftPx = 0): number {
  const rect = chip.getBoundingClientRect();
  const input: StripScrollInput = {
    scrollLeft: from,
    viewportWidth: nav.clientWidth,
    contentWidth: nav.scrollWidth,
    chipLeft: rect.left - nav.getBoundingClientRect().left + nav.scrollLeft + shiftPx,
    chipWidth: rect.width,
    gap: STRIP_CHIP_GAP_PX,
  };
  return useDesktopRule ? desktopStripScroll(input) : phoneStripScroll(input);
}

export function DayStrip({ tripId, dates, line, size }: { tripId: string; dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; line: StopLine; size: "desktop" | "phone" }) {
  const phone = size === "phone";
  const tripHref = useTripHref(tripId);
  const carousel = useDayCarousel();
  const scroller = React.useRef<HTMLDivElement>(null);
  const cancelGlide = React.useRef<() => void>(() => {});
  const memoryKey = `${tripId}:${size}`;

  // The chip lights the moment it is tapped (ADR 0063): while a navigation to
  // another day is in flight the effective pathname already names it. Any
  // other pending target (a section switch) keeps the server's answer.
  // aria-current="date" is the server's answer alone — the day actually shown.
  const { effectivePathname: path, pendingPathname } = useNavState();
  const serverCurrent = dates.find((d) => d.isCurrent)?.iso ?? null;
  const isLit = (iso: string) => (path.includes("/day/") ? path.endsWith(`/day/${iso}`) : iso === serverCurrent);
  const isPendingChip = (iso: string) => pendingPathname != null && pendingPathname.endsWith(tripHref(`/day/${iso}`));
  const litIndex = dates.findIndex((d) => isLit(d.iso));

  // Put the lit chip where its rule wants it (phone: centred; desktop at lg+:
  // the minimal-scroll rule, spec 2026-09-29 D2; the md–lg band shows the
  // desktop strip but is "< lg" and centres). A first render after a full load
  // is positioned cold; every later mount or lit change glides from where the
  // strip was — unless the carousel is driving it, which follows the body.
  React.useLayoutEffect(() => {
    const nav = scroller.current;
    if (!nav) return;
    const chip = nav.querySelector<HTMLElement>('[data-lit="true"]') ?? nav.querySelector<HTMLElement>('[aria-current="date"]');
    if (!chip) return;
    const useDesktopRule = !phone && window.matchMedia("(min-width: 1024px)").matches;
    const remembered = lastScrollLeft.get(memoryKey);
    const target = targetFor(nav, chip, useDesktopRule, remembered ?? nav.scrollLeft);
    if (remembered == null) {
      nav.scrollLeft = target;
      lastScrollLeft.set(memoryKey, target);
      return;
    }
    // Chrome snaps programmatic scrollLeft writes: snapping is off before the
    // remembered position is restored, not just for the glide that follows —
    // a snap-mandatory remount would otherwise snap `remembered` itself to
    // the nearest chip, and the glide would start from that snapped value.
    nav.style.scrollSnapType = "none";
    nav.scrollLeft = remembered;
    if (carousel?.isMoving()) return;
    cancelGlide.current();
    cancelGlide.current = tweenScrollLeft(nav, target, {
      reduced: prefersReducedMotion(),
      onDone: () => {
        nav.style.scrollSnapType = "";
      },
    });
    return () => {
      cancelGlide.current();
      nav.style.scrollSnapType = "";
    };
  }, [phone, memoryKey, litIndex, carousel]);

  // Phone: the strip moves with the body. Progress is in panels from the day
  // shown (aria-current, not the lit chip: a glide lights its target at once
  // while progress still counts from the day shown).
  React.useEffect(() => {
    if (!phone || !carousel) return;
    const nav = scroller.current;
    if (!nav) return;
    return carousel.subscribe((progress, settled) => {
      const shown = nav.querySelector<HTMLElement>('[aria-current="date"]');
      if (!shown) return;
      cancelGlide.current();
      const stride = shown.getBoundingClientRect().width + STRIP_CHIP_GAP_PX;
      nav.style.scrollSnapType = "none";
      nav.scrollLeft = targetFor(nav, shown, false, nav.scrollLeft, progress * stride);
      if (settled) nav.style.scrollSnapType = "";
    });
  }, [phone, carousel]);

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

  // One highlight that moves, rather than each chip painting its own coral,
  // so the selection glides to the tapped day (spec 2026-09-29 D4). Chips are
  // fixed-width: phone 3rem (w-12), desktop 3.5rem (w-14), plus the 0.5rem gap.
  const strideRem = phone ? 3.5 : 4;

  const n = dates.length;
  return (
    <div data-day-strip className={cn("flex flex-col gap-2", phone && "-mx-4 sm:-mx-6")}>
      <div
        ref={scroller}
        data-day-strip-scroller
        // One scroll container for the chip nav and the desktop city legend
        // (DV-01: they used to scroll separately, so the legend's cells drifted
        // out from under their chips). Phone: chips snap to the centre and the
        // end padding lets the first and last day centre too (ADR 0065).
        className={cn("flex flex-col gap-2 overflow-x-auto [scrollbar-width:none]", phone && "snap-x snap-mandatory px-[calc(50%-1.5rem)]")}
        onScroll={(e) => lastScrollLeft.set(memoryKey, e.currentTarget.scrollLeft)}
      >
        <nav aria-label="Days" className="relative flex w-max gap-2">
          {litIndex >= 0 ? (
            <span
              data-strip-highlight
              aria-hidden="true"
              className={cn(
                "island pointer-events-none absolute left-0 top-0 rounded-[14px] border-2 border-border bg-coral shadow-hard-1 transition-transform duration-200 ease-out motion-reduce:transition-none",
                phone ? "h-[58px] w-12" : "h-[62px] w-14",
              )}
              style={{ transform: `translateX(${litIndex * strideRem}rem)` }}
            />
          ) : null}
          {dates.map((d) => {
            const dt = parseISODate(d.iso);
            const dots = dotsFor(d.count);
            const label = `${formatDayLabel(d.iso)}, ${d.count === 0 ? "nothing planned" : `${d.count} ${d.count === 1 ? "thing" : "things"} planned`}`;
            const href = tripHref(`/day/${d.iso}`);
            return (
              <AppLink
                key={d.iso}
                href={href}
                scroll={false}
                aria-current={d.isCurrent ? "date" : undefined}
                data-pending={isPendingChip(d.iso) ? "true" : undefined}
                data-lit={isLit(d.iso) ? "true" : undefined}
                aria-label={label}
                transitionTypes={[serverCurrent ? dayTransitionType(serverCurrent, d.iso) : DAY_FORWARD]}
                // A neighbour glides in the carousel; a far day is a page-turn (ADR 0065).
                onNavigate={(e) => {
                  if (carousel?.goTo(href)) e.preventDefault();
                }}
                className={cn(
                  "relative flex shrink-0 flex-col items-center justify-center rounded-[14px] border-2 border-border text-foreground",
                  phone ? "h-[58px] w-12 snap-center" : "h-[62px] w-14 snap-start",
                  isLit(d.iso) ? "island bg-transparent" : "bg-card",
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
        {!phone && line.segments.length > 0 ? (
          <div className="grid w-max gap-2" style={{ gridTemplateColumns: `repeat(${n}, 3.5rem)` }} aria-hidden="true">
            {line.segments.map((s, i) => {
              const first = i === 0;
              const last = i === line.segments.length - 1;
              const Icon = s.kind === "gap" && s.mode ? TRANSPORT_MODE_META[s.mode].icon : null;
              return (
                <div
                  key={`${s.kind}-${s.startIndex}`}
                  data-line-segment={s.kind}
                  className="flex min-w-0 items-center gap-1.5"
                  style={{ gridColumn: `${s.startIndex + 1} / span ${s.span}` }}
                >
                  {first && line.homeStart ? (
                    <>
                      {/* The Home base, by name, styled like a Stop's dot (never "Home" — CONTEXT.md). */}
                      <span data-home-dot className="size-2 shrink-0 rounded-full border border-border bg-muted-foreground" />
                      <span className="truncate text-xs font-bold text-foreground">{line.homeStart}</span>
                    </>
                  ) : null}
                  {s.kind === "stop" ? (
                    <>
                      <span className={cn("size-2 shrink-0 rounded-full border border-border", stopDotClass(s.hueIndex))} />
                      <span className="truncate text-xs font-bold text-foreground">{s.name}</span>
                      <span className="h-0.5 min-w-2 flex-1 rounded-full bg-border-soft" />
                    </>
                  ) : (
                    <>
                      {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                      {s.label ? <span className="truncate text-xs font-bold text-muted-foreground">{s.label}</span> : null}
                      <span data-line-dashed className="h-0 min-w-2 flex-1 border-t-2 border-dashed border-border-soft" />
                    </>
                  )}
                  {last && line.homeEnd ? (
                    <>
                      <span data-home-dot className="size-2 shrink-0 rounded-full border border-border bg-muted-foreground" />
                      <span className="truncate text-xs font-bold text-foreground">{line.homeEnd}</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
