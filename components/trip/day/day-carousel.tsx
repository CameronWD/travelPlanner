"use client";

import type { Route } from "next";
import * as React from "react";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { useBeginNavigation, useNavigationPending, useSettleNavigation } from "@/components/navigation/navigation-pending";
import { ViewTransition } from "@/components/ui/view-transition";
import { DAY_BODY_TRANSITION, DAY_SETTLE } from "@/components/trip/day/day-transition";
import { panelProgress, settledPanel } from "@/components/trip/day/carousel-maths";
import { prefersReducedMotion, tweenScrollLeft } from "@/components/trip/day/scroll-tween";
import { cn } from "@/lib/cn";

export interface DayPanel {
  iso: string;
  href: Route;
  content: React.ReactNode;
}

export interface DayCarouselApi {
  /** Glides the body to that day's panel and navigates on arrival. True when handled (or swallowed while a navigation lands); false when the day is not a panel. */
  goTo: (href: Route) => boolean;
  /** The body's offset from the day shown, in panels (−1…1); `settled` is true once only, on arrival. */
  subscribe: (cb: (progress: number, settled: boolean) => void) => () => void;
  /** True while a drag or glide is under way — the strip then follows progress, not the lit chip. */
  isMoving: () => boolean;
}

/** Quiet time on a snap point that counts as "settled" where the browser has no scrollend. */
export const SETTLE_QUIET_MS = 120;

export const DayCarouselContext = React.createContext<DayCarouselApi | null>(null);

export function useDayCarousel(): DayCarouselApi | null {
  return React.useContext(DayCarouselContext);
}

/**
 * The Day view's paged carousel (ADR 0065): the day before, the day shown and
 * the day after as full-width panels in one snap-mandatory scroller. A drag
 * tracks the finger and snaps to a whole day; settling on a neighbour
 * navigates there, and the next page paints with that day already in view.
 * `chrome` (header, strip, keyboard nav) renders inside the context so its
 * controls can glide the body instead of navigating cold.
 */
export function DayCarousel({ panels, shownIndex, chrome }: { panels: DayPanel[]; shownIndex: number; chrome: React.ReactNode }) {
  const router = useAppRouter();
  const begin = useBeginNavigation();
  const settle = useSettleNavigation();
  const pending = useNavigationPending();
  const scroller = React.useRef<HTMLDivElement>(null);
  const listeners = React.useRef(new Set<(progress: number, settled: boolean) => void>());
  const moving = React.useRef(false);
  const navigating = React.useRef(false);
  const cancelGlide = React.useRef<() => void>(() => {});

  const shownIso = panels[shownIndex]?.iso;

  // On the day shown before first paint: no animation, no flash of a neighbour.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = shownIndex * el.clientWidth;
  }, [shownIso, shownIndex]);

  // Neighbours clip to the shown panel's height (they start at h-0), so a
  // short day beside a long one leaves no dead space below. Kept in step as
  // the shown panel's weather streams in. Imperative on purpose: state set
  // from an effect is what react-hooks/set-state-in-effect forbids.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const shown = el.querySelector<HTMLElement>('[data-day-panel][data-shown="true"]');
    if (!shown) return;
    const others = Array.from(el.querySelectorAll<HTMLElement>('[data-day-panel]:not([data-shown="true"])'));
    const fit = () => {
      const h = `${shown.offsetHeight}px`;
      for (const o of others) o.style.height = h;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(shown);
    return () => ro.disconnect();
  }, [shownIso, shownIndex]);

  React.useEffect(() => {
    for (const p of panels) if (p.iso !== panels[shownIndex]?.iso) router.prefetch(p.href);
  }, [panels, shownIndex, router]);

  const navigateTo = React.useCallback(
    (idx: number) => {
      if (navigating.current) return;
      navigating.current = true;
      // A glide's tap already begin()s to light the target early; clear it so
      // push's own begin() starts a fresh clock — the progress bar's 300ms is
      // for the network, not the glide. Both batch into one render. Here, not
      // in the glide's onDone: Chrome's scrollend can push first. A no-op
      // for a drag, which has nothing pending.
      settle(panels[idx].href);
      router.push(panels[idx].href, { scroll: false, transitionTypes: [DAY_SETTLE] });
    },
    [panels, router, settle],
  );

  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      const idx = settledPanel(el.scrollLeft, el.clientWidth);
      if (idx == null) return;
      const was = moving.current;
      moving.current = false;
      if (was) {
        const p = panelProgress(el.scrollLeft, shownIndex, el.clientWidth);
        for (const cb of listeners.current) cb(p, true);
      }
      if (idx !== shownIndex) navigateTo(idx);
    };
    const onScroll = () => {
      const p = panelProgress(el.scrollLeft, shownIndex, el.clientWidth);
      // The mount's own positioning fires a scroll at rest; that is not a gesture.
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
  }, [shownIso, shownIndex, navigateTo]);

  React.useEffect(() => () => cancelGlide.current(), []);

  // A push that lands unmounts this page. One that ends with the URL unchanged
  // — an error boundary, a redirect back, the provider's timeout — would leave
  // the carousel parked on an inert neighbour with `navigating` stuck: park it
  // back on the day shown and re-arm.
  React.useEffect(() => {
    if (pending != null || !navigating.current) return;
    navigating.current = false;
    moving.current = false;
    const el = scroller.current;
    if (!el) return;
    el.style.scrollSnapType = "";
    el.scrollLeft = shownIndex * el.clientWidth;
  }, [pending, shownIndex]);

  const api = React.useMemo<DayCarouselApi>(
    () => ({
      goTo: (href) => {
        const idx = panels.findIndex((p) => p.href === href);
        const el = scroller.current;
        if (idx < 0 || idx === shownIndex || !el) return false;
        if (navigating.current) return true;
        moving.current = true;
        begin(href);
        cancelGlide.current();
        el.style.scrollSnapType = "none";
        cancelGlide.current = tweenScrollLeft(el, idx * el.clientWidth, {
          reduced: prefersReducedMotion(),
          onDone: () => {
            el.style.scrollSnapType = "";
            navigateTo(idx);
          },
        });
        return true;
      },
      subscribe: (cb) => {
        listeners.current.add(cb);
        return () => {
          listeners.current.delete(cb);
        };
      },
      isMoving: () => moving.current,
    }),
    [panels, shownIndex, begin, navigateTo],
  );

  return (
    <DayCarouselContext.Provider value={api}>
      {chrome}
      {/* Only the body runs a view transition, and only on a far jump (ADR 0065); header and strip stay put. */}
      <ViewTransition {...DAY_BODY_TRANSITION}>
        <div>
          <div
            ref={scroller}
            data-day-carousel
            data-shown-day={shownIso}
            className="-mx-4 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 md:mx-0"
          >
            {panels.map((p, i) => {
              const shown = i === shownIndex;
              return (
                <div
                  key={p.iso}
                  data-day-panel={p.iso}
                  data-shown={shown ? "true" : undefined}
                  inert={shown ? undefined : true}
                  aria-hidden={shown ? undefined : "true"}
                  className={cn("w-full shrink-0 snap-start snap-always px-4 sm:px-6 md:px-0", !shown && "h-0 overflow-hidden")}
                >
                  {p.content}
                </div>
              );
            })}
          </div>
          {/* Cold load: the server HTML paints before hydration, and a scroller
              starts at 0 — the day BEFORE the one asked for. Position it while
              the HTML parses. It usually parses inside React's hidden streaming
              container (behind the trips loading boundary), where clientWidth
              is 0, so wait for a width: a ResizeObserver fires after layout and
              before paint in the frame the content is revealed. React never
              executes a script it inserts on a client navigation; the layout
              effect above covers those. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var s=document.currentScript&&document.currentScript.previousElementSibling;if(!s)return;var i=${shownIndex};function p(){s.scrollLeft=i*s.clientWidth}if(s.clientWidth){p();return}new ResizeObserver(function(_,o){if(s.clientWidth){p();o.disconnect()}}).observe(s)})()`,
            }}
          />
        </div>
      </ViewTransition>
    </DayCarouselContext.Provider>
  );
}
