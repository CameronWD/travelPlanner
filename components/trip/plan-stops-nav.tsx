"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { HUE_CLASSES, type Hue } from "@/lib/hues";

export interface PlanStopsNavStop {
  id: string;
  name: string;
  /** The Stop's colour on the ramp (lib/stop-colours' `stopHue`). */
  colourHue: Hue;
  /** "10–13 Dec" (scheduled) or "~3 nights" (rough). */
  dateLabel: string;
  /** Resolved chapter membership (dated: by date band; rough: explicit). Null = ungrouped. */
  chapterId: string | null;
}

export interface PlanStopsNavChapter {
  id: string;
  name: string;
}

export interface PlanStopsNavHomeBase {
  name: string;
  roundTrip: boolean;
}

export interface PlanStopsNavProps {
  /** Stops in plan order (lib/plan-order's `orderPlanStops`). */
  stops: PlanStopsNavStop[];
  /** Null when Chapters are off for this Trip — renders a flat list either way. */
  chapters: PlanStopsNavChapter[] | null;
  homeBase: PlanStopsNavHomeBase | null;
}

/** How long the jumped-to Stop card's highlight ring stays on (ms). Mirrors the CSS `animation-duration` below. */
const HIGHLIGHT_MS = 1600;

/**
 * Scrolls to a DOM id (a Stop card or a Home base bookend) and briefly rings
 * it. Operates on the live DOM directly — the target element is rendered by
 * a sibling subtree (ItineraryManager's StopCard / HomeBaseCard), not by this
 * component — so this can't go through React state/refs.
 */
function scrollToAndHighlight(domId: string, reducedMotion: boolean) {
  const el = document.getElementById(domId);
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  el.setAttribute("data-highlight", "true");
  window.setTimeout(() => el.removeAttribute("data-highlight"), HIGHLIGHT_MS);
}

interface Row {
  chapterHeading: string | null;
  stop: PlanStopsNavStop;
}

/** Stops in their given (already plan-ordered) order, with a heading inserted whenever the chapter changes. */
function buildRows(stops: PlanStopsNavStop[], chapters: PlanStopsNavChapter[] | null): Row[] {
  if (!chapters) return stops.map((stop) => ({ chapterHeading: null, stop }));
  const chapterName = new Map(chapters.map((c) => [c.id, c.name]));
  let lastChapterId: string | null | undefined = undefined;
  return stops.map((stop) => {
    const isNewGroup = stop.chapterId !== lastChapterId;
    lastChapterId = stop.chapterId;
    const heading = isNewGroup && stop.chapterId ? (chapterName.get(stop.chapterId) ?? null) : null;
    return { chapterHeading: heading, stop };
  });
}

/**
 * The plan side panel's "Stops" list (CONTEXT.md, spec §G, feedback
 * cmuhvbi4h): every Stop below the Plan overview, with the Home base
 * bookending it (origin first, return last on a round trip). Click jumps the
 * main column to that Stop (or Home base bookend) and briefly rings it;
 * scroll-spy keeps the row under the reader's eye marked `aria-current`.
 * `hidden lg:block` — the aside it lives in only exists at `lg+`.
 */
export function PlanStopsNav({ stops, chapters, homeBase }: PlanStopsNavProps) {
  const reducedMotion = useReducedMotion();
  const [activeStopId, setActiveStopId] = React.useState<string | null>(null);

  // Hash deep-link (Home's route-map tile links to `/trips/<id>/plan#stop-<id>`):
  // on mount, jump straight to it and ring it, same as a click.
  React.useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#stop-")) return;
    scrollToAndHighlight(hash.slice(1), Boolean(reducedMotion));
    // Mount-only: a hash present when this page first loads (including a
    // client-side navigation onto it, which still mounts this component).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-spy: the topmost Stop card currently in view is "active".
  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-stop-id]"));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        const id = topmost.target.getAttribute("data-stop-id");
        if (id) setActiveStopId(id);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [stops]);

  if (stops.length === 0 && !homeBase) return null;

  const rows = buildRows(stops, chapters);

  return (
    <nav aria-label="Stops" className="hidden lg:block">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/40 p-4">
        <h2 className="text-label text-muted-foreground">Stops</h2>
        <ul className="flex flex-col gap-0.5">
          {homeBase && (
            <li>
              <button
                type="button"
                className="tap-target flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={() => scrollToAndHighlight("home-base-top", Boolean(reducedMotion))}
              >
                <span className="size-2.5 shrink-0 rounded-full border-2 border-border bg-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{homeBase.name}</span>
                <span className="shrink-0 text-xs">Home base</span>
              </button>
            </li>
          )}

          {rows.map(({ chapterHeading, stop }) => (
            <React.Fragment key={stop.id}>
              {chapterHeading && (
                <li className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {chapterHeading}
                </li>
              )}
              <li>
                <button
                  type="button"
                  aria-current={activeStopId === stop.id ? "location" : undefined}
                  className={cn(
                    "tap-target flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                    activeStopId === stop.id ? "bg-muted/70 font-semibold text-foreground" : "text-foreground",
                  )}
                  onClick={() => scrollToAndHighlight(`stop-${stop.id}`, Boolean(reducedMotion))}
                >
                  <span className={cn("size-2.5 shrink-0 rounded-full", HUE_CLASSES[stop.colourHue].dot)} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{stop.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{stop.dateLabel}</span>
                </button>
              </li>
            </React.Fragment>
          ))}

          {homeBase && homeBase.roundTrip && (
            <li>
              <button
                type="button"
                className="tap-target flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={() => scrollToAndHighlight("home-base-bottom", Boolean(reducedMotion))}
              >
                <span className="size-2.5 shrink-0 rounded-full border-2 border-border bg-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{homeBase.name}</span>
                <span className="shrink-0 text-xs">Home base</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
