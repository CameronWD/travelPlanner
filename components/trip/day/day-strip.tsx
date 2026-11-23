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
 * full load — a first render is positioned cold, with no glide. The phone
 * strip in the carousel neither reads nor writes it: it is placed from the
 * day in view (ADR 0065, amended 2026-11-22).
 */
const lastScrollLeft = new Map<string, number>();

/** The phone strip's widths, read once per placement so a frame of a gesture only writes. */
function measureStrip(nav: HTMLElement) {
  return { chip: nav.querySelector("a")?.getBoundingClientRect().width ?? 0, viewport: nav.clientWidth };
}

/** The centred scroll position for `chip`. */
function targetFor(nav: HTMLElement, chip: HTMLElement, from: number): number {
  const rect = chip.getBoundingClientRect();
  const input: StripScrollInput = {
    scrollLeft: from,
    viewportWidth: nav.clientWidth,
    contentWidth: nav.scrollWidth,
    chipLeft: rect.left - nav.getBoundingClientRect().left + nav.scrollLeft,
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
  const geometry = React.useRef<ReturnType<typeof measureStrip> | null>(null);

  // aria-current="date" is the day the body mostly shows: the carousel's
  // nearest, which moves as a drag crosses halfway (ADR 0065, amended
  // 2026-11-22), else the server's. The chip lights the moment it is tapped
  // (ADR 0063): while a navigation to another day is in flight it names that
  // day. Any other pending target (a section switch) keeps the day shown.
  const { pendingPathname } = useNavState();
  const serverCurrent = dates.find((d) => d.isCurrent)?.iso ?? null;
  const inView = React.useSyncExternalStore(carousel?.subscribeDay ?? noSubscription, () => carousel?.current() ?? serverCurrent, () => carousel?.current() ?? serverCurrent);
  const [nearest, setNearest] = React.useState<string | null>(null);
  React.useEffect(() => carousel?.subscribeNearest?.(setNearest), [carousel]);
  const shown = nearest ?? inView;
  const pendingDay = pendingPathname ? dayFromPathname(pendingPathname) : null;
  const litIso = pendingDay ?? shown;
  const isLit = (iso: string) => iso === litIso;
  const isPendingChip = (iso: string) => pendingPathname != null && pendingPathname.endsWith(tripHref(`/day/${iso}`));
  // Where the strip is placed: the tapped day or the day in view, not the
  // halfway light, which moves while the body is still on its way.
  const placedIndex = dates.findIndex((d) => d.iso === (pendingDay ?? inView));
  const centreIndex = placedIndex >= 0 ? placedIndex : dates.findIndex((d) => d.iso === inView);
  const viewIndex = dates.findIndex((d) => d.iso === inView);
  const hydrating = React.useSyncExternalStore(noSubscription, () => false, () => true);
  const isos = React.useRef<string[]>([]);
  React.useLayoutEffect(() => {
    isos.current = dates.map((d) => d.iso);
  }, [dates]);

  // The phone strip in the carousel is placed from the day in view's index
  // and nothing else: never from where it was left, and never with a glide
  // of its own, so a far tap cuts it with the body (ADR 0065, amended
  // 2026-11-22). While the body moves, the subscription below places it.
  //
  // Every other strip centres the lit chip. Below lg (the md–lg band shows
  // the desktop strip) it is measured against the strip's viewport; from lg
  // it goes under the fixed centre frame, the strip's one movement (spec
  // 2026-11-18 D2). A first render after a full load is positioned cold;
  // every later mount or lit change glides from where the strip was, except
  // mid-gesture.
  React.useLayoutEffect(() => {
    const nav = scroller.current;
    if (!nav) return;
    const chip = nav.querySelector<HTMLElement>('[data-lit="true"]') ?? nav.querySelector<HTMLElement>('[aria-current="date"]');
    if (!chip) return;
    if (phone && carousel) {
      if (carousel.isMoving() || viewIndex < 0) return;
      cancelGlide.current();
      geometry.current = measureStrip(nav);
      nav.style.scrollSnapType = "";
      nav.scrollLeft = centredScrollLeft(viewIndex, geometry.current.chip, STRIP_CHIP_GAP_PX, geometry.current.viewport);
      return;
    }
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
  }, [phone, memoryKey, centreIndex, viewIndex, carousel]);

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
    if (!(phone && carousel)) lastScrollLeft.set(memoryKey, nav.scrollLeft);
    if (home.current == null || gliding.current) return;
    centreFrame.current?.toggleAttribute("data-away", Math.abs(nav.scrollLeft - home.current) > 1);
    waitThenReturn();
  };

  // Phone: the strip moves with the body. Progress is in panels from the day
  // in view, so it is counted from that day's index: not from the lit chip
  // (a glide lights its target at once) nor aria-current (it moves at halfway).
  // A frame only writes, from widths read when the strip was last placed; a
  // resize (rotation) reads them again.
  React.useEffect(() => {
    if (!phone || !carousel) return;
    const nav = scroller.current;
    if (!nav) return;
    const forget = () => {
      geometry.current = null;
    };
    window.addEventListener("resize", forget);
    const off = carousel.subscribe((progress, settled) => {
      const from = isos.current.indexOf(carousel.current());
      if (from < 0) return;
      const g = (geometry.current ??= measureStrip(nav));
      cancelGlide.current();
      const at = from + progress;
      nav.style.scrollSnapType = "none";
      nav.scrollLeft = centredScrollLeft(settled ? Math.round(at) : at, g.chip, STRIP_CHIP_GAP_PX, g.viewport);
      if (settled) nav.style.scrollSnapType = "";
    });
    return () => {
      off();
      window.removeEventListener("resize", forget);
    };
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
              aria-current={d.iso === shown ? "date" : undefined}
              data-pending={isPendingChip(d.iso) ? "true" : undefined}
              data-lit={isLit(d.iso) ? "true" : undefined}
              aria-label={label}
              transitionTypes={[inView ? dayTransitionType(inView, d.iso) : DAY_FORWARD]}
              // The carousel brings any day into view: a glide below lg, a crossfade from lg.
              onNavigate={(e) => {
                if (d.iso !== inView && !carousel?.isMoving()) recordUsageDayChange("chip", d.iso);
                if (carousel?.goTo(href)) e.preventDefault();
              }}
              className={cn(
                "relative isolate flex shrink-0 flex-col items-center justify-center rounded-[14px] border-2 border-border text-foreground",
                // Below lg the 200ms colour fade matches the highlight layer's fade.
                // From lg the fill lights at once (ADR 0063) and the strip's glide is
                // the only movement.
                phone ? "transition-colors duration-200 ease-out" : "max-lg:transition-colors max-lg:duration-200 max-lg:ease-out",
                "motion-reduce:transition-none",
                phone ? "h-[58px] w-12 snap-center" : "h-[62px] w-14 snap-start",
                // The lit chip paints its own coral under the island ink: the
                // [data-strip-highlight] layer behind the label is a sibling of the
                // label, invisible to anything reading its ancestor background (the
                // contrast audit read dark-on-dark).
                isLit(d.iso) ? "island bg-coral" : "bg-card",
              )}
            >
              {/* Below lg each chip has its own highlight: the selection crossfades
                  between days in place (replaces the 2026-09-29 D4 glide at the
                  owner's request). A per-chip layer, not one moving box, so a lit
                  day changed mid-swipe or mid-scroll still fades the old and new
                  together. From lg the fixed centre frame is the highlight. */}
              <span
                data-strip-highlight
                aria-hidden="true"
                className={cn(
                  "island pointer-events-none absolute -inset-0.5 -z-10 rounded-[14px] border-2 border-border bg-coral shadow-hard-1 transition-opacity duration-200 ease-out motion-reduce:transition-none lg:hidden",
                  isLit(d.iso) ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="text-[11px] font-bold leading-none">{WEEKDAY[dt.getUTCDay()]}</span>
              <span className="mt-0.5 font-display text-[20px] font-extrabold leading-none">{dt.getUTCDate()}</span>
              <span className="mt-1 flex h-1.5 w-[26px] justify-start gap-1">
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
    return (
      <div data-day-strip className="flex flex-col gap-2 -mx-4 sm:-mx-6">
        {strip}
        {/* Cold load: the carousel's own script puts the body on the day shown
            while the HTML parses, and until hydration this strip sat at 0, on
            the Trip's first days with the lit chip off screen. The same here:
            with the end padding, centring chip i is i * (chip + gap)
            (centredScrollLeft). Inside React's hidden streaming container a
            chip has no width, so wait for one. Server and hydration only, as
            the carousel's: a script React creates on the client never runs. */}
        {hydrating && viewIndex >= 0 ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var s=document.currentScript&&document.currentScript.previousElementSibling;if(!s)return;var i=${viewIndex};function w(){var c=s.querySelector("a");return c?c.getBoundingClientRect().width:0}function p(){s.scrollLeft=i*(w()+${STRIP_CHIP_GAP_PX})}if(w()){p();return}new ResizeObserver(function(_,o){if(w()){p();o.disconnect()}}).observe(s)})()`,
            }}
          />
        ) : null}
      </div>
    );
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
