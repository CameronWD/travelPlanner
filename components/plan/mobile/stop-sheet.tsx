"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, Check, Ellipsis, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { categoryDotClass } from "@/components/trip/category-dot";
import { cn } from "@/lib/cn";
import { formatDayLabel, nightsBetween, tzAbbrev } from "@/lib/dates";
import { stopHue } from "@/lib/stop-colours";
import { HUE_CLASSES } from "@/lib/hues";
import { dayTag, type DaySlot } from "@/lib/plan/day-density";
import { formatStayRange, type StayStatus } from "@/lib/plan/plan-model";
import { buildStopDays, type StopDayItem } from "@/lib/stop-days";
import type { StopCardStop, ThingToDo } from "@/components/plan/types";

export interface StopSheetProps {
  open: boolean;
  onClose(): void;
  stop: StopCardStop;
  number: number;
  slots: DaySlot[];
  dayItems: StopDayItem[];
  ideas: ThingToDo[];
  stay: StayStatus | null;
  accommodationRows: React.ReactNode;
  onAddStay(): void;
  onEditItem(item: StopDayItem): void;
  onAddPlan(dateISO?: string): void;
  onPickDay(idea: ThingToDo): void;
  onEditDates(): void;
  onActions(): void;
}

type Tab = "days" | "stay" | "ideas";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Thu 10" from "Thu 10 Dec". */
export const dayLabelNoMonth = (dateISO: string) => formatDayLabel(dateISO).replace(/ [A-Z][a-z]{2}$/, "");

/** "Thu 10 – Sat 12 Dec · 2 nights · CET", or "Rough · ~3 nights" (PLAN.md §7.2). Shared with the actions sheet. */
export function stopSheetMeta(stop: Pick<StopCardStop, "arriveDate" | "departDate" | "nights" | "timezone">): string {
  if (!stop.arriveDate || !stop.departDate) return `Rough · ~${plural(stop.nights ?? 1, "night")}`;
  const parts = [formatStayRange(stop.arriveDate, stop.departDate), plural(nightsBetween(stop.arriveDate, stop.departDate), "night")];
  const tz = tzAbbrev(stop.timezone, stop.arriveDate);
  if (tz) parts.push(tz);
  return parts.join(" · ");
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
  ideas,
  stay,
  accommodationRows,
  onAddStay,
  onEditItem,
  onAddPlan,
  onPickDay,
  onEditDates,
  onActions,
}: StopSheetProps) {
  const rough = !stop.arriveDate || !stop.departDate;
  const [tab, setTab] = React.useState<Tab>("days");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const days = rough ? [] : buildStopDays(stop.arriveDate!, stop.departDate!, dayItems);
  const itemsByDate = new Map(days.map((d) => [d.dateISO, [...d.timed, ...d.untimed]]));

  // The day block nearest the top of the scroll, so "+ Add a plan" lands where the Traveller is looking.
  function topDay(): string | undefined {
    const el = scrollRef.current;
    if (el) {
      const blocks = el.querySelectorAll<HTMLElement>("[data-day]");
      for (const b of blocks) {
        if (b.offsetTop + b.offsetHeight > el.scrollTop) return b.dataset.day;
      }
    }
    return slots[0]?.dateISO;
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
              <p className="truncate text-xs font-semibold text-muted-foreground">{stopSheetMeta(stop)}</p>
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
            <SegmentedItem value="days">Days</SegmentedItem>
            <SegmentedItem value="stay">
              Stay{" "}
              {stay?.kind === "none" ? (
                <span className="text-coral-text">!</span>
              ) : stay ? (
                <Check className="size-3.5" aria-hidden />
              ) : null}
            </SegmentedItem>
            <SegmentedItem value="ideas">Ideas {ideas.length}</SegmentedItem>
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
                        items.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            aria-label={`${it.startTime ?? ""} ${it.title}`.trim()}
                            onClick={() => onEditItem(it)}
                            className="flex min-h-11 w-full items-center gap-3 text-left text-sm"
                          >
                            <span className="w-12 shrink-0 text-xs font-bold tabular-nums">{it.startTime ?? ""}</span>
                            <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(it.category))} aria-hidden />
                            <span className="min-w-0 flex-1 truncate font-semibold">{it.title}</span>
                          </button>
                        ))
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
                  <div key={idea.id} className="flex min-h-[52px] items-center gap-3 border-b-2 border-muted">
                    <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(idea.category))} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{idea.title}</span>
                    {!rough && (
                      <button
                        type="button"
                        aria-label={`Pick day for ${idea.title}`}
                        onClick={() => onPickDay(idea)}
                        className="pressable tap-target ml-auto h-8 shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-sun px-3 text-xs font-extrabold text-on-accent"
                      >
                        Pick day
                      </button>
                    )}
                  </div>
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
