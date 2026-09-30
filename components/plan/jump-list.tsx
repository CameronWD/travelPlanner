"use client";

import * as React from "react";
import { House, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { HUE_CLASSES, type Hue } from "@/lib/hues";
import { Button } from "@/components/ui/button";
import { scrollToId, ringId } from "@/lib/scroll-to";
import { usePlanBody } from "./plan-body";

export interface JumpListStop {
  id: string;
  name: string;
  /** The Stop's colour on the ramp (lib/stop-colours' `stopHue`). */
  colourHue: Hue;
  /** "10–13 Dec" (scheduled) or "~3 nights" (rough). */
  dateLabel: string;
  /** Resolved chapter membership (dated: by date band; rough: explicit). Null = ungrouped. */
  chapterId: string | null;
  /** Rough stops get a dashed dot instead of their hue's solid fill. */
  rough: boolean;
}

export interface JumpListChapter {
  id: string;
  name: string;
}

export interface JumpListHomeBase {
  name: string;
  roundTrip: boolean;
}

export interface JumpListProps {
  /** Stops in plan order (lib/plan-order's `orderPlanStops`). */
  stops: JumpListStop[];
  /** Null when Chapters are off for this Trip — renders a flat list either way. */
  chapters: JumpListChapter[] | null;
  homeBase: JumpListHomeBase | null;
}

interface Row {
  chapterHeading: string | null;
  stop: JumpListStop;
}

/** Stops in their given (already plan-ordered) order, with a heading inserted whenever the chapter changes. */
function buildRows(stops: JumpListStop[], chapters: JumpListChapter[] | null): Row[] {
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

/** Home base bookend rows aren't Stops — jump straight to their DOM id, no `open`/desktop-vs-mobile resolution. */
function jumpToHomeBase(id: "home-base-top" | "home-base-bottom") {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scrollToId(id, { reduced });
  ringId(id);
}

const ROW_CLASS =
  "tap-target flex h-9 w-full items-center gap-2.5 rounded-[10px] border-2 border-transparent px-2 text-left text-sm font-semibold";

/**
 * The Plan page's restyled Jump list (PLAN.md §6.1, §6.3 — replaces
 * plan-stops-nav.tsx's "Stops" panel): Home base bookends the Stop rows
 * (origin first, return last on a round trip), grouped under Chapter
 * headings in plan order. Click jumps the main column to that Stop or bookend
 * and briefly rings it; scroll-spy keeps the row under the reader's eye
 * marked `aria-current`. A footer "+ Add a stop" row keeps that action
 * reachable while the list scrolls (spec §D1).
 *
 * The hash deep-link effect plan-stops-nav.tsx used to own now lives on
 * PlanBody (Task 6) — every consumer of this list shares one hash reader.
 */
export function JumpList({ stops, chapters, homeBase }: JumpListProps) {
  const { jumpTo, actions } = usePlanBody();
  const [activeStopId, setActiveStopId] = React.useState<string | null>(null);

  // Scroll-spy: the topmost Stop card currently in view is "active". Moved
  // verbatim from plan-stops-nav.tsx — it observes `[data-stop-id]`, which
  // only desktop Stop rows carry, rendered by a sibling subtree
  // (ItineraryManager), not by this component.
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

  const rows = buildRows(stops, chapters);

  return (
    <nav aria-label="Jump to" className="flex min-h-0 flex-col gap-2 rounded-[22px] border-2 border-border bg-card p-3 shadow-hard-4">
      <h2 className="px-2 text-[11px] font-extrabold tracking-[0.08em]">JUMP TO</h2>
      <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {homeBase && (
          <li>
            <button type="button" className={ROW_CLASS} onClick={() => jumpToHomeBase("home-base-top")}>
              <House className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{homeBase.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">Home base</span>
            </button>
          </li>
        )}

        {rows.map(({ chapterHeading, stop }) => {
          const active = activeStopId === stop.id;
          return (
            <React.Fragment key={stop.id}>
              {chapterHeading && (
                <li className="px-2 pb-0.5 pt-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                  {chapterHeading}
                </li>
              )}
              <li>
                <button
                  type="button"
                  aria-current={active ? "location" : undefined}
                  onClick={() => jumpTo(stop.id)}
                  className={cn(ROW_CLASS, active && "border-border bg-teal/15")}
                >
                  <span
                    className={cn(
                      "size-3 shrink-0 rounded-full border-2 border-border",
                      stop.rough ? "border-dashed bg-background" : HUE_CLASSES[stop.colourHue].fill,
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{stop.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{stop.dateLabel}</span>
                </button>
              </li>
            </React.Fragment>
          );
        })}

        {homeBase && homeBase.roundTrip && (
          <li>
            <button type="button" className={ROW_CLASS} onClick={() => jumpToHomeBase("home-base-bottom")}>
              <House className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{homeBase.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">Home base</span>
            </button>
          </li>
        )}
      </ul>

      <Button variant="outline" size="md" className="w-full" onClick={actions.addStop}>
        <Plus aria-hidden="true" />
        Add a stop
      </Button>
    </nav>
  );
}
