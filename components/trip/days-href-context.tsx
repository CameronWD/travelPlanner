"use client";

import type { Route } from "next";
import * as React from "react";

const DaysHrefContext = React.createContext<Route | null>(null);

/**
 * The Days tab's real target — /trips/:id/day/<default date> — supplied by
 * the trip layout, which already knows the trip's dates, so the tab lands on
 * the day in one hop instead of via day/page.tsx's redirect (ADR 0063); for a
 * date-less Trip, /trips/:id/plan (where that redirect would land). Null (no
 * provider: a test, a boundary shell) falls back to /trips/:id/day.
 */
export function DaysHrefProvider({ href, children }: { href: Route | null; children: React.ReactNode }) {
  return <DaysHrefContext.Provider value={href}>{children}</DaysHrefContext.Provider>;
}

export function useDaysHref(): Route | null {
  return React.useContext(DaysHrefContext);
}
