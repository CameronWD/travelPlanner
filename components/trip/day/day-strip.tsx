"use client";

import * as React from "react";
import { AppLink } from "@/components/navigation/app-link";
import { useNavState } from "@/components/navigation/navigation-pending";
import { DAY_FORWARD, dayTransitionType } from "@/components/trip/day/day-transition";
import { useDayCarousel } from "@/components/trip/day/day-carousel";
import { prefersReducedMotion, tweenScrollLeft } from "@/components/trip/day/scroll-tween";
import { LG_UP } from "@/components/ui/use-media-query";
import { cn } from "@/lib/cn";
import { dayFromPathname } from "@/lib/day-path";
import { recordUsageDayChange } from "@/lib/usage/client";
import { formatDayLabel, parseISODate } from "@/lib/dates";
import { stopDotClass } from "@/lib/stop-colours";
import { dotsFor, type StopLine } from "@/lib/day-view-model";
import { centredScrollLeft, phoneStripScroll, STRIP_CHIP_GAP_PX, STRIP_GLIDE_WIDE_MS, STRIP_RETURN_AFTER_MS, type StripScrollInput } from "@/components/trip/day/strip-scroll";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { useTripHref } from "@/components/trip/use-trip-href";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const noSubscription = () => () => {};

/**
 * Where the Traveller left each strip, keyed `${tripId}:${size}`. The strip
 * lives inside the Day page, which remounts when the Traveller comes back to
 * it from another section, so without this it would snap to the day on each
 * remount instead of gliding there. Module state: kept across client navigations, reset by a
 * full load — a first render is positioned cold, with no glide.
 */
const lastScrollLeft = new Map<string, number>();

/** The centred scroll position for `chip`, `shiftPx` to its right. */
function targetFor(nav: HTMLElement, chip: HTMLElement, from: number, shiftPx = 0): number {
  const rect = chip.getBoundingClientRect();
  const input: StripScrollInput = {
    scrollLeft: from,
    viewportWidth: nav.clientWidth,
    contentWidth: nav.scrollWidth,
    chipLeft: rect.left - nav.getBoundingClientRect().left + nav.scrollLeft + shiftPx,
    chipWidth: rect.width,
    gap: STRIP_CHIP_GAP_PX,
  };
  return phoneStripScroll(input);
}

export function DayStrip({ tripId, dates, line, size }: { tripId: string; dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean; holiday: "public" | "early" | false }>; line: StopLine; size: "desktop" | "phone" }) {
  const phone = size === "phone";
  const tripHref = useTripHref(tripId);
  const carousel = useDayCarousel();
  const scroller = React.useRef<HTMLDivElement>(null);
  const cancelGlide = React.useRef<() => void>(() => {});
  const centreFrame = React.useRef<HTMLSpanElement>(null);
  // Wide screen only: where the day shown sits under the frame, null below lg.
  const home = React.useRef<number | null>(null);
  const gliding = React.useRef(false);
  const hovering = React.useRef(false);
  const focused = React.useRef(false);
  const returnTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const memoryKey = `${tripId}:${size}`;

  // aria-current="date" is the day in view: the carousel's, which moves the
  // moment a swipe settles, else the server's. The chip lights the moment it
  // is tapped (ADR 0063): while a navigation to another day is in flight it
  // names that day. Any other pending target (a section switch) keeps the day in view.
  const { pendingPathname } = useNavState();
  const serverCurrent = dates.find((d) => d.isCurrent)?.iso ?? null;
  const inView = React.useSyncExternalStore(carousel?.subscribeDay ?? noSubscription, () => carousel?.current() ?? serverCurrent, () => carousel?.current() ?? serverCurrent);
  const litIso = (pendingPathname ? dayFromPathname(pendingPathname) : null) ?? inView;
  const isLit = (iso: string) => iso === litIso;
  const isPendingChip = (iso: string) => pendingPathname != null && pendingPathname.endsWith(tripHref(`/day/${iso}`));
  const litIndex = dates.findIndex((d) => isLit(d.iso));
  const centreIndex = litIndex >= 0 ? litIndex : dates.findIndex((d) => d.iso === inView);

  // Centre the lit chip. Below lg it is measured against the strip's
  // viewport (ADR 0065; the md–lg band shows the desktop strip and centres
  // the same way). From lg it goes under the fixed centre frame, the strip's
  // one movement (spec 2026-11-18 D2). A first render after a full load is
  // positioned cold; every later mount or lit change glides from where the
  // strip was — unless the carousel is driving it, which follows the body.
  React.useLayoutEffect(() => {
    const nav = scroller.current;
    if (!nav) return;
    const chip = nav.querySelector<HTMLElement>('[data-lit="true"]') ?? nav.querySelector<HTMLElement>('[aria-current="date"]');
    if (!chip) return;
    const wide = !phone && window.matchMedia(LG_UP).matches;
    const remembered = lastScrollLeft.get(memoryKey);
    const target = wide
      ? centredScrollLeft(centreIndex, chip.getBoundingClientRect().width, STRIP_CHIP_GAP_PX, nav.clientWidth)
      : targetFor(nav, chip, remembered ?? nav.scrollLeft);
    home.current = wide ? target : null;
    clearTimeout(returnTimer.current);
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
    gliding.current = true;
    cancelGlide.current = tweenScrollLeft(nav, target, {
      reduced: prefersReducedMotion(),
      durationMs: wide ? STRIP_GLIDE_WIDE_MS : undefined,
      onDone: () => {
        gliding.current = false;
        centreFrame.current?.removeAttribute("data-away");
        nav.style.scrollSnapType = "";
      },
    });
    return () => {
      cancelGlide.current();
      gliding.current = false;
      nav.style.scrollSnapType = "";
    };
  }, [phone, memoryKey, centreIndex, carousel]);

  React.useEffect(() => () => clearTimeout(returnTimer.current), []);

  // Wide screen: scrolling the strip by hand only looks (CONTEXT.md). While
  // the day shown is away from the centre the frame fades out, so it never
  // frames another day; after a quiet moment with the pointer and focus
  // elsewhere the strip glides back and the frame returns.
  const glideHome = () => {
    const nav = scroller.current;
    const to = home.current;
    if (!nav || to == null) return;
    cancelGlide.current();
    gliding.current = true;
    cancelGlide.current = tweenScrollLeft(nav, to, {
      reduced: prefersReducedMotion(),
      durationMs: STRIP_GLIDE_WIDE_MS,
      onDone: () => {
        gliding.current = false;
        centreFrame.current?.removeAttribute("data-away");
      },
    });
  };
  const waitThenReturn = () => {
    clearTimeout(returnTimer.current);
    if (hovering.current || focused.current || !centreFrame.current?.hasAttribute("data-away")) return;
    returnTimer.current = setTimeout(glideHome, STRIP_RETURN_AFTER_MS);
  };
  const onStripScroll = (nav: HTMLElement) => {
    lastScrollLeft.set(memoryKey, nav.scrollLeft);
    if (home.current == null || gliding.current) return;
    centreFrame.current?.toggleAttribute("data-away", Math.abs(nav.scrollLeft - home.current) > 1);
    waitThenReturn();
  };

  // Phone: the strip moves with the body. Progress is in panels from the day
  // in view (aria-current, not the lit chip: a glide lights its target at once
  // while progress still counts from the day it left).
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
      nav.scrollLeft = targetFor(nav, shown, nav.scrollLeft, progress * stride);
      if (settled) nav.style.scrollSnapType = "";
    });
  }, [phone, carousel]);

  // 768-1023: a vertical wheel gesture over the strip scrolls it horizontally
  // instead, but only when the strip actually has overflow to scroll, and only
  // by *not* also scrolling the page vertically. From lg the strip always
  // overflows and the page must keep scrolling. React's onWheel is
  // registered passively at the root, so calling preventDefault from a
  // synthetic handler is a no-op (and can warn); a native listener with
  // `{ passive: false }` is required to actually suppress the page scroll.
  React.useEffect(() => {
    if (phone) return;
    const el = scroller.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.deltaX !== 0) return;
      if (window.matchMedia(LG_UP).matches) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [phone]);

  // Below lg, one highlight that moves, rather than each chip painting its own
  // coral, so the selection glides to the tapped day (spec 2026-09-29 D4).
  // Chips are fixed-width: phone 3rem (w-12), desktop 3.5rem (w-14), plus the
  // 0.5rem gap. From lg the highlight is the fixed centre frame instead.
  const strideRem = phone ? 3.5 : 4;

  const n = dates.length;
  const strip = (
    <div
      ref={scroller}
      data-day-strip-scroller
      // One scroll container for the chip nav and the desktop city legend
      // (DV-01: they used to scroll separately, so the legend's cells drifted
      // out from under their chips). The end padding lets the first and last
      // day centre too: phone, where chips also snap (ADR 0065), and from lg
      // under the centre frame (spec 2026-11-18 D2).
      className={cn("flex flex-col gap-2 overflow-x-auto [scrollbar-width:none]", phone && "snap-x snap-mandatory px-[calc(50%-1.5rem)]", !phone && "lg:px-[calc(50%-1.75rem)]")}
      onScroll={(e) => onStripScroll(e.currentTarget)}
    >
      <nav aria-label="Days" className={cn("relative flex w-max gap-2", !phone && "mx-auto")}>
        {litIndex >= 0 ? (
          <span
            data-strip-highlight
            aria-hidden="true"
            className={cn(
              "island pointer-events-none absolute left-0 top-0 rounded-[14px] border-2 border-border bg-coral shadow-hard-1 transition-transform duration-200 ease-out motion-reduce:transition-none",
              phone ? "h-[58px] w-12" : "h-[62px] w-14 lg:hidden",
            )}
            style={{ transform: `translateX(${litIndex * strideRem}rem)` }}
          />
        ) : null}
        {dates.map((d) => {
          const dt = parseISODate(d.iso);
          const dots = dotsFor(d.count);
          const label = `${formatDayLabel(d.iso)}, ${d.count === 0 ? "nothing planned" : `${d.count} ${d.count === 1 ? "thing" : "things"} planned`}${d.holiday === "public" ? ", public holiday" : d.holiday === "early" ? ", places close early" : ""}`;
          const href = tripHref(`/day/${d.iso}`);
          return (
            <AppLink
              key={d.iso}
              href={href}
              scroll={false}
              aria-current={d.iso === inView ? "date" : undefined}
              data-pending={isPendingChip(d.iso) ? "true" : undefined}
              data-lit={isLit(d.iso) ? "true" : undefined}
              aria-label={label}
              transitionTypes={[inView ? dayTransitionType(inView, d.iso) : DAY_FORWARD]}
              // The carousel brings any day into view: a glide below lg, a crossfade from lg.
              onNavigate={(e) => {
                if (d.iso !== inView) recordUsageDayChange("chip", d.iso);
                if (carousel?.goTo(href)) e.preventDefault();
              }}
              className={cn(
                "relative flex shrink-0 flex-col items-center justify-center rounded-[14px] border-2 border-border text-foreground",
                // Below lg the 200ms colour fade matches the highlight's slide. From
                // lg the fill lights at once (ADR 0063) and the strip's glide is the
                // only movement: one coral thing, not a fade beside a slide.
                phone ? "transition-colors duration-200 ease-out" : "max-lg:transition-colors max-lg:duration-200 max-lg:ease-out",
                "motion-reduce:transition-none",
                phone ? "h-[58px] w-12 snap-center" : "h-[62px] w-14 snap-start",
                // The lit chip paints its own coral under the island ink: the sliding
                // [data-strip-highlight] behind it is a sibling, invisible to anything
                // reading the label's ancestor background (the contrast audit read
                // dark-on-dark).
                isLit(d.iso) ? "island bg-coral" : "bg-card",
              )}
            >
              <span className="text-[11px] font-bold leading-none">{WEEKDAY[dt.getUTCDay()]}</span>
              <span className="mt-0.5 font-display text-[20px] font-extrabold leading-none">{dt.getUTCDate()}</span>
              <span className="mt-1 flex h-1.5 gap-1">
                {Array.from({ length: dots }, (_, i) => <span key={i} data-dot className="size-1.5 rounded-full bg-current" />)}
              </span>
              {d.holiday ? <span data-holiday aria-hidden="true" className="absolute right-1.5 top-1.5 size-1.5 rotate-45 border border-current" /> : null}
              {d.isToday ? <span data-today-underline aria-hidden="true" className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-coral" /> : null}
            </AppLink>
          );
        })}
      </nav>
      {!phone && line.segments.length > 0 ? (
        <div className="mx-auto grid w-max gap-2" style={{ gridTemplateColumns: `repeat(${n}, 3.5rem)` }} aria-hidden="true">
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
  );

  if (phone) {
    return <div data-day-strip className="flex flex-col gap-2 -mx-4 sm:-mx-6">{strip}</div>;
  }
  return (
    <div
      data-day-strip
      role="group"
      aria-label="Day strip"
      className="flex items-start gap-2"
      onWheel={waitThenReturn}
      onPointerDown={waitThenReturn}
      onKeyDown={waitThenReturn}
      onPointerEnter={() => {
        hovering.current = true;
        clearTimeout(returnTimer.current);
      }}
      onPointerLeave={() => {
        hovering.current = false;
        waitThenReturn();
      }}
      onFocus={() => {
        focused.current = true;
        clearTimeout(returnTimer.current);
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        focused.current = false;
        waitThenReturn();
      }}
    >
      <div className="relative min-w-0 flex-1">
        {strip}
        {/* The day shown holds the centre and the chips slide beneath this frame.
            Ink, not coral: the lit chip is the one coral thing, so nothing
            coral moves except with the strip. */}
        <span
          ref={centreFrame}
          data-strip-centre
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 hidden h-[62px] w-14 -translate-x-1/2 rounded-[14px] border-2 border-border shadow-hard-1 transition-opacity duration-150 motion-reduce:transition-none data-away:opacity-0 lg:block"
        />
      </div>
    </div>
  );
}
