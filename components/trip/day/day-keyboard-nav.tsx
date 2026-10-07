"use client";
import type { Route } from "next";
import * as React from "react";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { useDayCarousel } from "@/components/trip/day/day-carousel";
import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** ← / → change day (DAY_VIEW §2), never while typing, inside a dialog, or
 *  on the Day map (Leaflet pans with the arrow keys). Through the carousel
 *  when it has the neighbour (ADR 0065), else a typed navigation. */
export function DayKeyboardNav({ prevHref, nextHref }: { prevHref: Route | null; nextHref: Route | null }) {
  const router = useAppRouter();
  const carousel = useDayCarousel();
  React.useEffect(() => {
    const go = (href: Route, type: string) => {
      if (!carousel?.goTo(href)) router.push(href, { scroll: false, transitionTypes: [type] });
    };
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && (TYPING.test(t.tagName) || (t as HTMLElement).isContentEditable || t.closest("[role=dialog],.leaflet-container"))) return;
      if (e.key === "ArrowRight" && nextHref) go(nextHref, DAY_FORWARD);
      else if (e.key === "ArrowLeft" && prevHref) go(prevHref, DAY_BACK);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, carousel, prevHref, nextHref]);
  return null;
}
