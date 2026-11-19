"use client";
import type { Route } from "next";
import * as React from "react";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { useDayCarousel } from "@/components/trip/day/day-carousel";
import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** ← / → change day (DAY_VIEW §2), never while typing, inside a dialog, or
 *  in a map (Google pans with the arrow keys). Through the carousel, from
 *  the day in view (ADR 0065), else a typed navigation from the day shown. */
export function DayKeyboardNav({ prevHref, nextHref }: { prevHref: Route | null; nextHref: Route | null }) {
  const router = useAppRouter();
  const carousel = useDayCarousel();
  React.useEffect(() => {
    const go = (by: -1 | 1, href: Route | null) => {
      if (carousel) carousel.step(by);
      else if (href) router.push(href, { scroll: false, transitionTypes: [by < 0 ? DAY_BACK : DAY_FORWARD] });
    };
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && (TYPING.test(t.tagName) || (t as HTMLElement).isContentEditable || t.closest("[role=dialog],.tp-map"))) return;
      if (e.key === "ArrowRight") go(1, nextHref);
      else if (e.key === "ArrowLeft") go(-1, prevHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, carousel, prevHref, nextHref]);
  return null;
}
