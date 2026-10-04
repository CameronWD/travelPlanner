"use client";

import * as React from "react";
import { Bell, MessageCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StayPanel, type StayPanelAccommodation } from "./stay-panel";
import { IdeasBox } from "./ideas-box";
import { DaySection, daySectionId } from "./day-section";
import { usePlanBody } from "./plan-body";
import { scrollToId } from "@/lib/scroll-to";
import {
  dayCollapseKey,
  parseCollapsed,
  readCollapsedRaw,
  setDayCollapsed,
  subscribeCollapsed,
} from "@/lib/plan/day-collapse";
import type { DaySlot } from "@/lib/plan/day-density";
import type { StopCardStop, ThingToDo } from "./types";
import type { StopDayItem } from "@/lib/stop-days";
import type { CostRow } from "@/server/actions/costs";

/** The three kinds of "extras" a Stop can have (spec §D2): files, notes, reminders. */
export type ExtrasKind = "notes" | "files" | "reminders";

export interface StopOpenBodyProps {
  tripId: string;
  stop: StopCardStop;
  slots: DaySlot[];
  dayItems: StopDayItem[];
  dayTitles?: Record<string, { title: string }>;
  ideas: ThingToDo[];
  costsById?: Map<string, CostRow[]>;
  homeCurrency?: string;
  /** This Stop's Accommodations, each with its Costs and file count, for the stay panel (spec 2026-10-04 §B). */
  accommodations: StayPanelAccommodation[];
  counts: { files: number; notes: number; reminders: number };
  showDragHint: boolean;
  flashDate?: string | null;
  /** An empty day's "or pick an idea": schedule one of this Stop's ideas onto that day (spec 2026-10-04 §I). */
  onScheduleIdea(idea: ThingToDo, dateISO: string): void;
  /** Every Stop's name by id, for the ADR 0049 owning-Stop marker on a Changeover day. */
  stopNames?: ReadonlyMap<string, string>;
  /** A stay panel block: opens the existing Accommodation view. */
  onOpenAccommodation(accommodationId: string): void;
  onAddStay(): void;
  onAddIdea(): void;
  onOpenIdea(idea: ThingToDo): void;
  onAddPlan(dateISO: string): void;
  onEditItem(item: StopDayItem): void;
  onGiveDates(): void;
  onOpenExtras(kind: ExtrasKind): void;
}

interface ExtrasLink {
  kind: ExtrasKind;
  icon: typeof Paperclip;
  label: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The days this Traveller folded on this Trip (lib/plan/day-collapse.ts). Every day is open on the server and while hydrating. */
function useCollapsedDays(tripId: string): ReadonlySet<string> {
  const raw = React.useSyncExternalStore(subscribeCollapsed, () => readCollapsedRaw(tripId), () => "");
  return React.useMemo(() => parseCollapsed(raw), [raw]);
}

/**
 * The open-stop container (PLAN.md §4, §5): the stay panel + ideas box
 * (spec 2026-10-04 §B), then either "Give it dates" (rough) or every day of
 * the stay as a full, foldable day section in date order (spec 2026-10-04
 * §A), then the quiet extras link row (spec §D2) when any exist.
 */
export function StopOpenBody({
  tripId,
  stop,
  slots,
  dayItems,
  dayTitles,
  ideas,
  costsById,
  homeCurrency,
  accommodations,
  counts,
  showDragHint,
  flashDate,
  onScheduleIdea,
  stopNames,
  onOpenAccommodation,
  onAddStay,
  onAddIdea,
  onOpenIdea,
  onAddPlan,
  onEditItem,
  onGiveDates,
  onOpenExtras,
}: StopOpenBodyProps) {
  const rough = !stop.arriveDate || !stop.departDate;
  const collapsed = useCollapsedDays(tripId);
  // The once-a-session drag hint sits under the first open day with a plan to drag, not under every day (nor a folded one).
  const hintDate = showDragHint
    ? slots.find((s) => !collapsed.has(dayCollapseKey(stop.id, s.dateISO)) && dayItems.some((i) => i.date === s.dateISO))?.dateISO
    : undefined;

  const b = usePlanBody();
  const hashDay = b.hashDay && slots.some((s) => s.dateISO === b.hashDay) ? b.hashDay : null;
  // Spec 2026-10-04 §A: a `day=` hash link opens that day (if folded) and
  // scrolls to it — once, on the first open Stop holding it (a Changeover day
  // sits under two). Only on desktop: below lg this list is display:none.
  React.useEffect(() => {
    if (!hashDay || !b.claimHashDay(hashDay)) return;
    setDayCollapsed(tripId, stop.id, hashDay, false);
    if (!window.matchMedia?.("(min-width: 1024px)").matches) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // After the commit that opened the day, so the window lands on its top.
    requestAnimationFrame(() => scrollToId(daySectionId(stop.id, hashDay), { reduced }));
  }, [hashDay, b, tripId, stop.id]);

  const links: ExtrasLink[] = [];
  if (counts.files > 0) links.push({ kind: "files", icon: Paperclip, label: plural(counts.files, "file") });
  if (counts.notes > 0) links.push({ kind: "notes", icon: MessageCircle, label: plural(counts.notes, "note") });
  if (counts.reminders > 0) links.push({ kind: "reminders", icon: Bell, label: plural(counts.reminders, "reminder") });

  return (
    <div className="flex flex-col gap-2.5 border-t-2 border-border bg-background px-4 pb-3.5 pt-3">
      {/* Spec 2026-10-04 §B: stay panel + ideas box, equal width, stretched
          to equal height (grid cells). Below a 640px-wide card they stack,
          stay first. A container query on the card's own width, not the
          viewport — dock + rail squeeze the card at 1024–1279 whatever the
          window. The wrapper is the container (one can't query itself). */}
      <div className="@container">
        <div data-testid="stop-top-row" className="grid grid-cols-1 gap-2.5 @min-[640px]:grid-cols-2">
          <StayPanel
            stop={stop}
            accommodations={accommodations}
            homeCurrency={homeCurrency}
            onOpen={onOpenAccommodation}
            onAdd={onAddStay}
          />
          <IdeasBox ideas={ideas} onOpen={onOpenIdea} onAdd={onAddIdea} className="items-start" />
        </div>
      </div>

      {rough ? (
        <Button variant="primary" size="sm" className="self-start" onClick={onGiveDates}>
          Give it dates
        </Button>
      ) : (
        <div className="flex flex-col gap-2.5">
          {slots.map((s) => (
            <DaySection
              key={s.dateISO}
              tripId={tripId}
              stopId={stop.id}
              dateISO={s.dateISO}
              dayTitle={dayTitles?.[s.dateISO]?.title}
              items={dayItems.filter((i) => i.date === s.dateISO)}
              costsById={costsById}
              homeCurrency={homeCurrency}
              stopNames={stopNames}
              ideas={ideas}
              collapsed={collapsed.has(dayCollapseKey(stop.id, s.dateISO))}
              onCollapsedChange={(c) => setDayCollapsed(tripId, stop.id, s.dateISO, c)}
              flash={flashDate === s.dateISO}
              showDragHint={s.dateISO === hintDate}
              onAdd={onAddPlan}
              onEditItem={onEditItem}
              onScheduleIdea={onScheduleIdea}
            />
          ))}
        </div>
      )}

      {links.length > 0 && (
        <div data-testid="stop-extras-links" className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
          {links.map((link, i) => (
            <React.Fragment key={link.kind}>
              {i > 0 && <span aria-hidden="true">·</span>}
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => onOpenExtras(link.kind)}
              >
                <link.icon className="size-3.5" aria-hidden="true" />
                {link.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
