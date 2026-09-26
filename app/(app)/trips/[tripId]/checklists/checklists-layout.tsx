"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * Tab list: keeps the primitive's `overflow-x-auto` so the pill scrolls on
 * 360/375px phones instead of spilling. That overflow clips at the padding
 * box, so on touch the list grows to hold the 44px hit area: its padding box
 * then holds each trigger's full 44px hit area without clipping (LA-052).
 * Exported for tests.
 */
export const CHECKLISTS_TABS_LIST_CLASS = "max-sm:gap-0 pointer-coarse:h-[3.25rem]";

/**
 * Kit Segmented, teal tone (together.jsx Checklists). Overrides the Tabs
 * primitive's ink active fill; on a coarse pointer the trigger itself grows
 * to a 44px hit area (LA-052), and its `after` pseudo-element still pads out
 * the hit area a little further so adjacent triggers don't compete for taps.
 * At ≤360px the label padding shrinks so "Booking parser" stops clipping.
 * LA-052 residual: below 375px (the audit found 360 broken, 375 already
 * clean) the third trigger's own right edge sat only ~5px shy of the
 * viewport edge, so the list's rounded-full corner still ate into the last
 * "r" — one more padding step buys back enough width that the label clears
 * the border by ≥4px. The two ranges are written so they never overlap
 * (`min-[375px]:max-sm` / `max-[375px]`, which Tailwind compiles as
 * `not (min-width: 375px)` — i.e. strictly below 375, abutting rather than
 * double-covering the boundary) rather than as two competing `max-width`
 * rules at the same breakpoint: Tailwind doesn't order two arbitrary
 * `max-[…]` variants by their breakpoint size, so whichever happened to be
 * generated later in the stylesheet would otherwise silently win.
 * Exported for tests.
 */
export const CHECKLISTS_TAB_CLASS =
  "relative shrink-0 min-[375px]:max-sm:px-2 max-[375px]:px-1.5 data-[state=active]:bg-teal data-[state=active]:text-on-accent pointer-coarse:h-11 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:content-['']";

/** Breakpoint the card grid takes over from the tab strip at (spec §3). */
const DESKTOP_QUERY = "(min-width: 1024px)";

/** The server (and first client render, to match it) never has a viewport to ask about. */
function getDesktopServerSnapshot(): boolean {
  return false;
}

// Cached against the *current* `window.matchMedia` function reference (see
// components/feedback/feedback-launcher.tsx's identical pattern) rather than
// created once forever: useSyncExternalStore calls getSnapshot on every
// render, and an uncached `window.matchMedia(...)` call constructs a fresh
// MediaQueryList every time for no reason.
let cachedMatchMediaFn: typeof window.matchMedia | undefined;
let cachedDesktopMql: MediaQueryList | null = null;

function getDesktopMql(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    cachedMatchMediaFn = undefined;
    cachedDesktopMql = null;
    return null;
  }
  if (window.matchMedia !== cachedMatchMediaFn) {
    cachedMatchMediaFn = window.matchMedia;
    cachedDesktopMql = window.matchMedia(DESKTOP_QUERY);
  }
  return cachedDesktopMql;
}

function subscribeToDesktop(onChange: () => void) {
  const mql = getDesktopMql();
  if (!mql || typeof mql.addEventListener !== "function") return () => {};
  mql.addEventListener("change", onChange);
  return () => {
    if (typeof mql.removeEventListener === "function") {
      mql.removeEventListener("change", onChange);
    }
  };
}

function getDesktopSnapshot(): boolean {
  return getDesktopMql()?.matches ?? false;
}

/**
 * Is the viewport wide enough for the card grid? Server snapshot is `false`
 * (tabs) so hydration never mismatches; a desktop viewer briefly sees tabs
 * before this flips to the grid on mount — an accepted one-time switch, not a
 * layout that thrashes on every render.
 */
function useIsDesktop(): boolean {
  return React.useSyncExternalStore(subscribeToDesktop, getDesktopSnapshot, getDesktopServerSnapshot);
}

export type ChecklistsPanel = {
  value: "pretrip" | "packing" | "booking";
  label: React.ReactNode;
  content: React.ReactNode;
};

/**
 * Below 1024px: the existing teal Segmented tabs, one panel visible at a
 * time. At ≥1024px: all three panels as their own Card in a grid — the kit's
 * companion-column treatment for Checklists (LA-017, spec §3). Only one of
 * the two shapes is ever mounted, never both at once.
 */
export function ChecklistsLayout({ panels }: { panels: ChecklistsPanel[] }) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {panels.map((panel) => (
          <Card key={panel.value}>
            <CardHeader className="p-5 pb-0">
              <CardTitle className="flex items-center gap-2">{panel.label}</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-3">{panel.content}</CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Tabs defaultValue="pretrip" className="w-full">
      <TabsList className={CHECKLISTS_TABS_LIST_CLASS}>
        {panels.map((panel) => (
          <TabsTrigger key={panel.value} value={panel.value} className={CHECKLISTS_TAB_CLASS}>
            {panel.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {panels.map((panel) => (
        <TabsContent key={panel.value} value={panel.value}>
          {panel.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
