"use client";

import type { Route } from "next";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PENDING_NAVIGATION_TIMEOUT_MS, useBeginNavigation, useSettleNavigation } from "@/components/navigation/navigation-pending";
import { ViewTransition } from "@/components/ui/view-transition";
import { DAY_BODY_TRANSITION_WIDE, dayTransitionType } from "@/components/trip/day/day-transition";
import { isFar, panelProgress, panelWidth, settledPanel } from "@/components/trip/day/carousel-maths";
import { prefersReducedMotion, tweenScrollLeft } from "@/components/trip/day/scroll-tween";
import { LG_UP, useMediaQuery } from "@/components/ui/use-media-query";
import { cn } from "@/lib/cn";
import { recordUsageSwipe } from "@/lib/usage/client";

export interface DayPanel {
  iso: string;
  href: Route;
  content: React.ReactNode;
}

export interface DayCarouselApi {
  /** Brings that Trip day into view (a glide below lg, a crossfade from lg) and navigates there. False only when the href is not a Trip day. */
  goTo: (href: Route) => boolean;
  /** goTo the day before (-1) or after (1) the day in view; false past the Trip's ends. */
  step: (by: -1 | 1) => boolean;
  /** The day in view. It changes the moment a gesture settles; the page's own date catches up when the navigation lands. */
  current: () => string;
  subscribeDay: (cb: (iso: string) => void) => () => void;
  /** The body's offset from the day in view, in panels; `settled` is true once only, on arrival. */
  subscribe: (cb: (progress: number, settled: boolean) => void) => () => void;
  /** True while a drag or glide is under way — the strip then follows progress, not the lit chip. */
  isMoving: () => boolean;
}

/** Below lg the carousel moves the body itself: no view transition, not even React's default crossfade. */
const PHONE_BODY_TRANSITION = { default: "none" } as const;

/** Quiet time on a snap point that counts as "settled" where the browser has no scrollend. */
export const SETTLE_QUIET_MS = 120;

/** The side column's `lg:top-6`: taller than the viewport less this, it cannot stick without hiding its foot. */
const SIDE_STICKY_TOP_PX = 24;

export const DayCarouselContext = React.createContext<DayCarouselApi | null>(null);

/** Each filled day's own header, by date; provided by `DayChromeRegistry` (day-chrome-registry.tsx). */
export interface DayChromeRegistryApi {
  register: (iso: string, chrome: React.ReactNode) => void;
  chromeFor: (iso: string) => React.ReactNode | undefined;
}

export const DayChromeRegistryContext = React.createContext<DayChromeRegistryApi>({ register: () => {}, chromeFor: () => undefined });

export function useDayCarousel(): DayCarouselApi | null {
  return React.useContext(DayCarouselContext);
}

/** The date of the carousel panel this sits in. */
export const DayPanelContext = React.createContext<string | null>(null);

const noSubscription = () => () => {};

/** Whether the panel this sits in is the day in view; null outside the carousel. */
export function useIsDayInView(): boolean | null {
  const carousel = useDayCarousel();
  const iso = React.useContext(DayPanelContext);
  const current = () => carousel?.current() ?? null;
  const inView = React.useSyncExternalStore(carousel?.subscribeDay ?? noSubscription, current, current);
  return carousel && iso ? inView === iso : null;
}

/**
 * The Day view's paged carousel (ADR 0065, amended 2026-11-19): a fixed-width
 * slot for every day of the Trip in one snap-mandatory scroller. The day in
 * view is this component's own state. A settle shows that day's header (its
 * slot's, or `chromeFallback` until the slot has filled) and lights the strip
 * at once, then pushes the day's address; the page's `shownDate` catches up
 * when that lands, without remounting anything, and the slots around it fill.
 *
 * From lg only the day in view renders, in a plain block that scrolls with
 * the page, and a day change crossfades it before the same push. The server
 * markup is the phone tree with lg: classes hiding the others, so the first
 * paint is already one day before the viewport is known.
 */
export function DayCarousel({
  panels,
  shownDate,
  chrome,
  chromeFallback,
}: {
  panels: DayPanel[];
  shownDate: string;
  chrome: React.ReactNode;
  chromeFallback: (iso: string) => React.ReactNode;
}) {
  // Not useAppRouter: the day is already on screen, so a push here raises no progress bar.
  const router = useRouter();
  const begin = useBeginNavigation();
  const settleBegun = useSettleNavigation();
  const [navigating, startNavigation] = React.useTransition();
  const [view, setView] = React.useState(shownDate);
  const [firstDay] = React.useState(shownDate);
  const viewRef = React.useRef(shownDate);
  const panelsRef = React.useRef(panels);
  const scroller = React.useRef<HTMLDivElement>(null);
  const listeners = React.useRef(new Set<(progress: number, settled: boolean) => void>());
  const dayListeners = React.useRef(new Set<(iso: string) => void>());
  const moving = React.useRef(false);
  const glideTo = React.useRef<number | null>(null);
  // The day last pushed, until that navigation ends.
  const target = React.useRef<string | null>(null);
  // The backstop gave up waiting for `target`: the next settle pushes even to
  // that same day, but `target`'s end is still watched, and parks back if it
  // ended with the day unchanged.
  const gaveUp = React.useRef(false);
  // A day shown that arrived mid-gesture, for the settle to apply.
  const deferred = React.useRef<string | null>(null);
  const crossfadeTo = React.useRef<string | null>(null);
  const shownRef = React.useRef(shownDate);
  const backstop = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const headerBox = React.useRef<HTMLDivElement>(null);
  const headerHeight = React.useRef(0);
  const bodyBox = React.useRef<HTMLDivElement>(null);
  const bodyHeight = React.useRef(0);
  const viewHeight = React.useRef(0);
  const cancelGlide = React.useRef<() => void>(() => {});
  const desktop = useMediaQuery(LG_UP) === true;
  const hydrating = React.useSyncExternalStore(noSubscription, () => false, () => true);
  const { chromeFor } = React.useContext(DayChromeRegistryContext);

  React.useLayoutEffect(() => {
    panelsRef.current = panels;
  }, [panels]);

  const viewIndex = panels.findIndex((p) => p.iso === view);

  const machine = React.useMemo(() => {
    const indexOf = (iso: string) => panelsRef.current.findIndex((p) => p.iso === iso);
    const showDay = (iso: string) => {
      viewRef.current = iso;
      setView(iso);
      for (const cb of dayListeners.current) cb(iso);
    };
    const unfilledInView = () => scroller.current?.querySelector('[data-day-panel][data-shown="true"] [data-day-slot-skeleton]') != null;
    const navigate = (p: DayPanel) => {
      if (target.current === p.iso && !gaveUp.current) return;
      target.current = p.iso;
      gaveUp.current = false;
      startNavigation(() => router.push(p.href, { scroll: false }));
      // The provider's own backstop, timed from the latest push. Giving up
      // re-arms the next settle; a day in view that has filled stays, since
      // the Traveller is already reading it. Only one that never will parks back.
      clearTimeout(backstop.current);
      backstop.current = setTimeout(() => {
        gaveUp.current = true;
        if (shownRef.current !== viewRef.current && unfilledInView()) reconcile(shownRef.current);
      }, PENDING_NAVIGATION_TIMEOUT_MS);
    };
    const place = (iso: string) => {
      const el = scroller.current;
      cancelGlide.current();
      glideTo.current = null;
      showDay(iso);
      if (!el || desktop) return;
      el.style.scrollSnapType = "";
      el.scrollLeft = indexOf(iso) * panelWidth(el);
    };
    // A day shown that is not the day in view: Back/Forward, or a push that
    // ended without landing. Never under a gesture: the settle decides.
    const reconcile = (iso: string) => {
      if (moving.current) deferred.current = iso;
      else place(iso);
    };
    const land = (idx: number) => {
      const p = panelsRef.current[idx];
      if (!p) return;
      const el = scroller.current;
      if (moving.current && el) {
        moving.current = false;
        const progress = panelProgress(el.scrollLeft, indexOf(viewRef.current), panelWidth(el));
        for (const cb of listeners.current) cb(progress, true);
      }
      settleBegun(p.href);
      const held = deferred.current;
      deferred.current = null;
      if (p.iso !== viewRef.current) {
        showDay(p.iso);
        navigate(p);
      } else if (held != null && held !== p.iso) place(held);
    };
    const goTo = (href: Route) => {
      const idx = panelsRef.current.findIndex((p) => p.href === href);
      if (idx < 0) return false;
      const p = panelsRef.current[idx];
      if (desktop) {
        if (p.iso === viewRef.current) return true;
        const type = dayTransitionType(viewRef.current, p.iso);
        viewRef.current = p.iso;
        for (const cb of dayListeners.current) cb(p.iso);
        crossfadeTo.current = p.iso;
        React.startTransition(() => {
          React.addTransitionType(type);
          setView(p.iso);
        });
        return true;
      }
      const el = scroller.current;
      if (!el) return false;
      if (idx === indexOf(viewRef.current) && glideTo.current == null) return true;
      moving.current = true;
      glideTo.current = idx;
      begin(href);
      cancelGlide.current();
      el.style.scrollSnapType = "none";
      cancelGlide.current = tweenScrollLeft(el, idx * panelWidth(el), {
        reduced: prefersReducedMotion(),
        onDone: () => {
          el.style.scrollSnapType = "";
          glideTo.current = null;
          land(idx);
        },
      });
      return true;
    };
    const api: DayCarouselApi = {
      goTo,
      step: (by) => {
        const p = panelsRef.current[indexOf(viewRef.current) + by];
        return p ? goTo(p.href) : false;
      },
      current: () => viewRef.current,
      subscribeDay: (cb) => {
        dayListeners.current.add(cb);
        return () => {
          dayListeners.current.delete(cb);
        };
      },
      subscribe: (cb) => {
        listeners.current.add(cb);
        return () => {
          listeners.current.delete(cb);
        };
      },
      isMoving: () => moving.current,
    };
    return { api, indexOf, land, navigate, reconcile, settled: () => clearTimeout(backstop.current) };
  }, [router, begin, settleBegun, desktop]);

  // On the day in view before first paint, and again when the phone tree comes back.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el && !desktop) el.scrollLeft = machine.indexOf(viewRef.current) * panelWidth(el);
  }, [machine, desktop]);

  React.useLayoutEffect(() => {
    shownRef.current = shownDate;
    if (shownDate === viewRef.current) {
      deferred.current = null;
      return;
    }
    // Our own push landing: its end decides. Any other day arriving while it
    // is in flight (Back) is followed at once, and the push is given up.
    if (target.current === shownDate) return;
    target.current = null;
    gaveUp.current = false;
    machine.settled();
    machine.reconcile(shownDate);
  }, [shownDate, machine]);

  React.useEffect(() => {
    if (navigating || target.current == null) return;
    target.current = null;
    gaveUp.current = false;
    machine.settled();
    if (shownDate !== viewRef.current) machine.reconcile(shownDate);
  }, [navigating, shownDate, machine]);

  // From lg the crossfade commits first and the push follows: one transition
  // carrying both would hold the new day back until the server answered.
  React.useEffect(() => {
    if (crossfadeTo.current !== view) return;
    crossfadeTo.current = null;
    const p = panelsRef.current[machine.indexOf(view)];
    if (p) machine.navigate(p);
  }, [view, machine]);

  // These rely on the order each commit runs them in: the insertion effect
  // holds the heights before anything measures; this fit effect releases the
  // day in view's hold; the header effect measures inside its held box,
  // scrolls, then releases. Both ResizeObservers only measure, never scroll.
  //
  // The others clip to the day in view's height (they start at h-0), so a
  // short day beside a long one leaves no dead space below; `items-start`
  // keeps the day in view at its own height rather than stretched to theirs.
  // Kept in step as its weather streams in. Imperative on purpose: state set
  // from an effect is what react-hooks/set-state-in-effect forbids.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || desktop) return;
    const shown = el.querySelector<HTMLElement>('[data-day-panel][data-shown="true"]');
    if (!shown) return;
    // A day that has not filled keeps the height of the day it replaced, so
    // the page does not shrink under the Traveller and lose their place.
    const unfilled = shown.querySelector("[data-day-slot-skeleton]") != null;
    shown.style.minHeight = unfilled ? shown.style.minHeight || shown.style.height : "";
    shown.style.height = "";
    const others = Array.from(el.querySelectorAll<HTMLElement>('[data-day-panel]:not([data-shown="true"])'));
    for (const o of others) o.style.minHeight = "";
    const fit = () => {
      viewHeight.current = shown.offsetHeight;
      const h = `${viewHeight.current}px`;
      for (const o of others) o.style.height = h;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(shown);
    return () => ro.disconnect();
  }, [view, desktop, panels]);

  // Hold the header's, the body's and the day in view's heights through each
  // commit, before anything in it measures the page: a landing can hand the
  // day in view a skeleton for one commit (Back to a day outside the new
  // window), the header remounts when it swaps between a slot's own and the
  // fallback, and from lg the body remounts to crossfade. Out of scroll
  // anchoring, WebKit and Chromium both clamp the scroll position to the
  // briefly shorter page and never give it back. The layout effect below
  // releases them.
  React.useInsertionEffect(() => {
    if (headerBox.current && headerHeight.current) headerBox.current.style.minHeight = `${headerHeight.current}px`;
    if (bodyBox.current && bodyHeight.current) bodyBox.current.style.minHeight = `${bodyHeight.current}px`;
    const shown = desktop ? null : scroller.current?.querySelector<HTMLElement>('[data-day-panel][data-shown="true"]');
    if (shown && !shown.style.minHeight && viewHeight.current && shown.querySelector("[data-day-slot-skeleton]")) shown.style.minHeight = `${viewHeight.current}px`;
  });

  // The header changes height with the day (holiday notes, and the fallback
  // has none). Scrolled into or past it, the Traveller is reading the body:
  // keep that still. Scroll anchoring cannot be trusted with it (WebKit's
  // moved the page the wrong way, and Chromium's doubled this correction).
  // Measured inside the held box and scrolled before it is released, so a
  // page only just long enough is never clamped on the way.
  const ownHeader = chromeFor(view);
  // The header also rewraps with no commit here (rotation, resize, a font
  // landing). Track that as the new baseline, never as a change to correct:
  // the Traveller already saw it move.
  React.useLayoutEffect(() => {
    const box = headerBox.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      headerHeight.current = (box.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  React.useLayoutEffect(() => {
    const box = headerBox.current;
    if (!box) return;
    const held = headerHeight.current;
    const above = box.getBoundingClientRect().top < 0;
    headerHeight.current = (box.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    if (held && above && headerHeight.current !== held) window.scrollBy(0, headerHeight.current - held);
    box.style.minHeight = "";
    const body = bodyBox.current;
    if (body) {
      // From lg a day that has not filled keeps the height of the day it
      // replaced too; below lg its panel does that (the effect above).
      if (!(desktop && body.querySelector("[data-day-slot-skeleton]"))) body.style.minHeight = "";
      bodyHeight.current = body.offsetHeight;
    }
  });

  // A sticky side column taller than the viewport would pin its foot (the
  // Journal) out of reach until the plan ends; CSS cannot compare the two,
  // so mark it and let `lg:data-tall:static` give it back to the page scroll.
  // Static and sticky paint the same at the top of the page, so the mark never flashes.
  React.useLayoutEffect(() => {
    const side = desktop ? scroller.current?.querySelector<HTMLElement>('[data-day-panel][data-shown="true"] [data-day-side]') : null;
    if (!side) return;
    const fit = () => side.toggleAttribute("data-tall", side.offsetHeight > window.innerHeight - SIDE_STICKY_TOP_PX);
    fit();
    window.addEventListener("resize", fit);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    ro?.observe(side);
    return () => {
      window.removeEventListener("resize", fit);
      ro?.disconnect();
    };
  }, [view, desktop]);

  // Subscribed once per tree: a navigation landing re-renders this component,
  // and must not drop a settle that is still waiting for its quiet time.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || desktop) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      const idx = settledPanel(el.scrollLeft, panelWidth(el));
      if (idx == null || (glideTo.current != null && idx !== glideTo.current)) return;
      if (timer) clearTimeout(timer);
      recordUsageSwipe(glideTo.current == null ? panelsRef.current[idx]?.iso ?? null : null, viewRef.current);
      machine.land(idx);
    };
    const onScroll = () => {
      const p = panelProgress(el.scrollLeft, machine.indexOf(viewRef.current), panelWidth(el));
      // Positioning the scroller on the day in view fires a scroll at rest; that is not a gesture.
      if (!moving.current && Math.abs(p) < 0.001) return;
      moving.current = true;
      for (const cb of listeners.current) cb(p, false);
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_QUIET_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const hasScrollEnd = "onscrollend" in el;
    if (hasScrollEnd) el.addEventListener("scrollend", settle);
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (hasScrollEnd) el.removeEventListener("scrollend", settle);
      if (timer) clearTimeout(timer);
    };
  }, [machine, desktop]);

  React.useEffect(
    () => () => {
      cancelGlide.current();
      clearTimeout(backstop.current);
    },
    [],
  );

  const shownIndex = panels.findIndex((p) => p.iso === shownDate);

  return (
    <DayCarouselContext.Provider value={machine.api}>
      {/* Header, strip and body are out of scroll anchoring: the header's
          correction above keeps the body still, and an engine's own would
          move it again. */}
      <div ref={headerBox} className="[overflow-anchor:none]">
        {ownHeader ?? chromeFallback(view)}
      </div>
      <div className="[overflow-anchor:none]">{chrome}</div>
      {/* Only the body runs a view transition; header and strip stay put. From
          lg every day change crossfades: nothing remounts on a day change, so
          the body is keyed by the day to exit and enter. The phone keeps one
          key (the first day, so the switch to lg after hydration remounts nothing). */}
      {/* Out of scroll anchoring: WebKit anchored on the body and moved the
          page by a panel's worth when a day that had not filled came into view. */}
      <div ref={bodyBox} className="[overflow-anchor:none]">
        <ViewTransition key={desktop ? view : firstDay} {...(desktop ? DAY_BODY_TRANSITION_WIDE : PHONE_BODY_TRANSITION)}>
          <div>
            <div
              ref={scroller}
              data-day-carousel
              data-shown-day={shownDate}
              className={
                desktop
                  ? undefined
                  : "-mx-4 flex items-start snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 md:mx-0 lg:block lg:snap-none lg:overflow-visible"
              }
            >
              {panels.map((p, i) => {
                const inView = i === viewIndex;
                if (desktop && !inView) return null;
                return (
                  <div
                    key={p.iso}
                    data-day-panel={p.iso}
                    data-shown={inView ? "true" : undefined}
                    data-far={isFar(i, viewIndex) ? "" : undefined}
                    inert={inView ? undefined : true}
                    aria-hidden={inView ? undefined : "true"}
                    className={desktop ? "relative" : cn("relative w-full shrink-0 snap-start snap-always px-4 sm:px-6 md:px-0", !inView && "h-0 overflow-hidden lg:hidden")}
                  >
                    <DayPanelContext.Provider value={p.iso}>{p.content}</DayPanelContext.Provider>
                  </div>
                );
              })}
            </div>
            {/* Cold load: the server HTML paints before hydration, and a scroller
                starts at 0 — the Trip's first day. Position it while the HTML
                parses. It usually parses inside React's hidden streaming
                container (behind the trips loading boundary), where a panel's width
                is 0, so wait for a width: a ResizeObserver fires after layout and
                before paint in the frame the content is revealed. Rendered only
                for the server and hydration: a script React creates on the
                client never runs (and React says so), and the layout effects
                above position every client render. */}
            {hydrating ? (
              <script
                dangerouslySetInnerHTML={{
                  __html: `(function(){var s=document.currentScript&&document.currentScript.previousElementSibling;if(!s)return;var i=${shownIndex};function w(){var f=s.firstElementChild;return f?f.getBoundingClientRect().width:0}function p(){s.scrollLeft=i*w()}if(w()){p();return}new ResizeObserver(function(_,o){if(w()){p();o.disconnect()}}).observe(s)})()`,
                }}
              />
            ) : null}
          </div>
        </ViewTransition>
      </div>
    </DayCarouselContext.Provider>
  );
}
