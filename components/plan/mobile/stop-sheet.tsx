"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, Check, ChevronRight, Ellipsis, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { m } from "motion/react";
import { LayoutMotion } from "@/components/ui/layout-motion";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { categoryDotClass } from "@/components/trip/category-dot";
import { cn } from "@/lib/cn";
import { formatDayLabel, nightsBetween } from "@/lib/dates";
import { Stepper } from "@/components/ui/stepper";
import { stopHue } from "@/lib/stop-colours";
import { HUE_CLASSES } from "@/lib/hues";
import { dayTag, type DaySlot } from "@/lib/plan/day-density";
import { type StayStatus } from "@/lib/plan/plan-model";
import { buildStopDays, ownerMarker, type StopDayItem } from "@/lib/stop-days";
import type { StopCardStop, ThingToDo } from "@/components/plan/types";
import { stopSheetMeta } from "./stop-sheet-meta";

export { stopSheetMeta } from "./stop-sheet-meta";

export interface StopSheetProps {
  open: boolean;
  onClose(): void;
  stop: StopCardStop;
  number: number;
  slots: DaySlot[];
  dayItems: StopDayItem[];
  /** Every Stop's name by id, for the ADR 0049 owning-Stop marker on a Changeover day. */
  stopNames?: ReadonlyMap<string, string>;
  ideas: ThingToDo[];
  stay: StayStatus | null;
  accommodationRows: React.ReactNode;
  onAddStay(): void;
  onEditItem(item: StopDayItem): void;
  onAddPlan(dateISO?: string): void;
  onOpenIdea(idea: ThingToDo): void;
  onEditDates(): void;
  onActions(): void;
  /** Spec 2026-10-06 §N: the −/+ nights stepper on the meta line. */
  onSetNights?(nights: number): void;
}

type Tab = "days" | "stay" | "ideas";

/** "Thu 10" from "Thu 10 Dec". */
export const dayLabelNoMonth = (dateISO: string) => formatDayLabel(dateISO).replace(/ [A-Z][a-z]{2}$/, "");

/**
 * The first day block whose bottom has not scrolled above the scroller's top edge
 * (viewport coordinates, so the header above the scroller doesn't skew it);
 * the last block once everything has scrolled past.
 */
export function pickTopDay(blocks: readonly { day: string; bottom: number }[], scrollerTop: number): string | undefined {
  return (blocks.find((b) => b.bottom >= scrollerTop) ?? blocks.at(-1))?.day;
}

/*
 * MOTION.md P12: the active tab's ink pill is a shared layoutId that slides
 * between tabs, as on Money's breakdown switch (MOTION.md M6). The item's own
 * "on" fill is cleared so only the pill shows.
 */
const TAB_ITEM =
  "isolate transition-colors delay-[90ms] duration-[90ms] motion-reduce:delay-0 data-[state=on]:bg-transparent data-[state=on]:text-primary-foreground";

function TabPill({ stopId }: { stopId: string }) {
  return (
    <LayoutMotion>
      <m.span
        data-slot="stop-tab-pill"
        layoutId={`stop-tab-pill-${stopId}`}
        aria-hidden="true"
        className="absolute inset-0 -z-10 rounded-full bg-primary"
        transition={{ duration: 0.18 }}
      />
    </LayoutMotion>
  );
}

function NeedsDates() {
  return <p className="py-6 text-center text-[13px] font-semibold text-muted-foreground">Needs dates first</p>;
}

/** The full-screen mobile stop sheet (PLAN.md §7.2), opened by `?stop=<id>`. */
export function StopSheet({
  open,
  onClose,
  stop,
  number,
  slots,
  dayItems,
  stopNames,
  ideas,
  stay,
  accommodationRows,
  onAddStay,
  onEditItem,
  onAddPlan,
  onOpenIdea,
  onEditDates,
  onActions,
  onSetNights,
}: StopSheetProps) {
  const rough = !stop.arriveDate || !stop.departDate;
  const [tab, setTab] = React.useState<Tab>("days");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const days = rough ? [] : buildStopDays(stop.arriveDate!, stop.departDate!, dayItems);
  const itemsByDate = new Map(days.map((d) => [d.dateISO, [...d.timed, ...d.untimed]]));

  // The day block nearest the top of the scroll, so "+ Add a plan" lands where the Traveller is looking.
  function topDay(): string | undefined {
    const el = scrollRef.current;
    if (!el) return slots[0]?.dateISO;
    const blocks = [...el.querySelectorAll<HTMLElement>("[data-day]")].map((b) => ({
      day: b.dataset.day!,
      bottom: b.getBoundingClientRect().bottom,
    }));
    return pickTopDay(blocks, el.getBoundingClientRect().top) ?? slots[0]?.dateISO;
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-background data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down"
        >
          <div className="flex items-center gap-3 border-b-2 border-muted px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <button
              type="button"
              aria-label="Back to the plan"
              onClick={onClose}
              className="pressable grid size-11 shrink-0 place-items-center rounded-full border-2 border-border bg-card"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl border-2 border-border font-display text-lg font-extrabold text-on-accent",
                rough ? "border-dashed bg-muted text-foreground" : HUE_CLASSES[stopHue(stop.sortOrder)].fill,
              )}
            >
              {number}
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate font-display text-[28px] font-extrabold leading-none">
                {stop.name}
              </DialogPrimitive.Title>
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-xs font-semibold text-muted-foreground">{stopSheetMeta(stop)}</p>
                {onSetNights && (
                  <Stepper
                    value={rough ? (stop.nights ?? 1) : nightsBetween(stop.arriveDate!, stop.departDate!)}
                    onChange={onSetNights}
                    min={0}
                    max={366}
                    unit="n"
                    label={`Nights in ${stop.name}`}
                    className="shrink-0"
                  />
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Actions for ${stop.name}`}
              onClick={onActions}
              className="pressable grid size-11 shrink-0 place-items-center rounded-full border-2 border-border bg-card"
            >
              <Ellipsis className="size-5" aria-hidden />
            </button>
          </div>

          <Segmented
            type="single"
            tone="ink"
            value={tab}
            onValueChange={(v) => v && setTab(v as Tab)}
            aria-label="Stop sections"
            className="mx-4 mt-3 grid grid-cols-3"
          >
            <SegmentedItem value="days" className={TAB_ITEM}>
              {tab === "days" && <TabPill stopId={stop.id} />}
              Days
            </SegmentedItem>
            <SegmentedItem value="stay" className={TAB_ITEM}>
              {tab === "stay" && <TabPill stopId={stop.id} />}
              Stay{" "}
              {stay?.kind === "none" ? (
                <span className="text-coral-text">!</span>
              ) : stay ? (
                <Check className="size-3.5" aria-hidden />
              ) : null}
            </SegmentedItem>
            <SegmentedItem value="ideas" className={TAB_ITEM}>
              {tab === "ideas" && <TabPill stopId={stop.id} />}
              Ideas {ideas.length}
            </SegmentedItem>
          </Segmented>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {tab === "days" &&
              (rough ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <p className="text-[13px] font-semibold text-muted-foreground">Needs dates first</p>
                  <Button variant="primary" size="md" onClick={onEditDates}>
                    Give it dates
                  </Button>
                </div>
              ) : (
                slots.map((slot) => {
                  const d = slot.dateISO;
                  const label = dayLabelNoMonth(d);
                  const tag = dayTag({ arriveDate: stop.arriveDate!, departDate: stop.departDate! }, d);
                  const items = itemsByDate.get(d) ?? [];
                  return (
                    <section key={d} data-testid={`sheet-day-${d}`} data-day={d} className="border-b-2 border-muted py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold">{label}</span>
                        {tag && <span className="text-xs font-semibold text-muted-foreground">{tag}</span>}
                        {slot.title && <span className="min-w-0 truncate text-xs font-bold">{slot.title}</span>}
                        <button
                          type="button"
                          aria-label={`Add a plan to ${label}`}
                          onClick={() => onAddPlan(d)}
                          className="pressable tap-target ml-auto grid size-8 shrink-0 place-items-center rounded-full border-2 border-border bg-card"
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-[13px] text-muted-foreground">Free day. Tap + or pick an idea.</p>
                      ) : (
                        items.map((it) => {
                          const owner = ownerMarker(it, stop.id, stopNames);
                          return (
                            <button
                              key={it.id}
                              type="button"
                              aria-label={`${`${it.startTime ?? ""} ${it.title}`.trim()}${owner ? ` (${owner})` : ""}`}
                              onClick={() => onEditItem(it)}
                              className="flex min-h-11 w-full items-center gap-3 text-left text-sm"
                            >
                              <span className="w-12 shrink-0 text-xs font-bold tabular-nums">{it.startTime ?? ""}</span>
                              <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(it.category))} aria-hidden />
                              <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                                <span className="min-w-0 truncate font-semibold">{it.title}</span>
                                {/* ADR 0049 rule 3: on a Changeover day, the Stop whose Budget line this plan counts toward. */}
                                {owner && (
                                  <span data-owner className="shrink-0 text-xs text-muted-foreground">
                                    · {owner}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </section>
                  );
                })
              ))}

            {tab === "stay" &&
              (rough ? (
                <NeedsDates />
              ) : (
                <div className="flex flex-col gap-3 pt-3">
                  {accommodationRows}
                  <Button variant="outline" size="md" onClick={onAddStay}>
                    + Add a stay
                  </Button>
                </div>
              ))}

            {tab === "ideas" &&
              (ideas.length === 0 ? (
                <p className="py-6 text-center text-[13px] font-semibold text-muted-foreground">No ideas yet</p>
              ) : (
                ideas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    aria-label={`Open ${idea.title}`}
                    onClick={() => onOpenIdea(idea)}
                    className="tap-target flex min-h-[52px] w-full items-center gap-3 border-b-2 border-muted text-left"
                  >
                    <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(idea.category))} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{idea.title}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))
              ))}
          </div>

          <div className="flex gap-2.5 border-t-2 border-border bg-background px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            <Button variant="outline" size="lg" onClick={onEditDates}>
              Edit dates
            </Button>
            <Button variant="primary" size="lg" className="flex-1" onClick={() => onAddPlan(topDay())}>
              + Add a plan
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
