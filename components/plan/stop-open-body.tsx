"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageCircle, Paperclip } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useTripHref } from "@/components/trip/use-trip-href";
import { StayChip } from "./stay-chip";
import { IdeasBox } from "./ideas-box";
import { DayStrip } from "./day-strip";
import { SelectedDay } from "./selected-day";
import { usePlanBody } from "./plan-body";
import { PresenceDiv } from "./presence";
import { defaultSelectedDay, type DaySlot } from "@/lib/plan/day-density";
import type { StopCardStop, ThingToDo } from "./types";
import type { StopDayItem } from "@/lib/stop-days";
import type { CostRow } from "@/server/actions/costs";
import type { StayStatus } from "@/lib/plan/plan-model";

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
  stay: StayStatus | null;
  counts: { files: number; notes: number; reminders: number };
  showDragHint: boolean;
  flashDate?: string | null;
  onOpenStay(): void;
  onAddStay(): void;
  onAddIdea(): void;
  onScheduleIdea(idea: ThingToDo, dateISO: string): void;
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

/** MOTION.md P3: the panel cross-fades with a 6px slide in the direction of travel. */
const DAY_PANEL = {
  enter: (d: number) => ({ opacity: 0, x: 6 * d }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: -6 * d }),
};

/**
 * The open-stop container (PLAN.md §4, §5): the stay + ideas strip, then
 * either "Give it dates" (rough) or the day strip and selected-day panel
 * (dated), then the quiet extras link row (spec §D2) when any exist.
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
  stay,
  counts,
  showDragHint,
  flashDate,
  onOpenStay,
  onAddStay,
  onAddIdea,
  onScheduleIdea,
  onAddPlan,
  onEditItem,
  onGiveDates,
  onOpenExtras,
}: StopOpenBodyProps) {
  const rough = !stop.arriveDate || !stop.departDate;
  const router = useRouter();
  const tripHref = useTripHref(tripId);
  const b = usePlanBody();
  // Fallback for a StopOpenBody rendered with no enclosing PlanBody (its
  // inert default has today: "") — plan-body.tsx's INERT_VALUE.
  const connected = b.today !== "";
  const [local, setLocal] = React.useState<string | null>(null);

  const fromHash = b.hashDay && slots.some((s) => s.dateISO === b.hashDay) ? b.hashDay : null;
  const selected = connected
    ? (b.selectedDay(stop.id) ?? fromHash ?? defaultSelectedDay(slots, b.today) ?? slots[0]?.dateISO)
    : (local ?? defaultSelectedDay(slots, "") ?? slots[0]?.dateISO);

  // Forward (a later day) slides in from the right, back from the left.
  const [prevSelected, setPrevSelected] = React.useState(selected);
  const [dir, setDir] = React.useState(1);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    if (selected && prevSelected) setDir(selected > prevSelected ? 1 : -1);
  }

  function onSelect(dateISO: string) {
    if (connected) b.selectDay(stop.id, dateISO);
    else setLocal(dateISO);
  }

  const panelId = `day-panel-${stop.id}`;

  const links: ExtrasLink[] = [];
  if (counts.files > 0) links.push({ kind: "files", icon: Paperclip, label: plural(counts.files, "file") });
  if (counts.notes > 0) links.push({ kind: "notes", icon: MessageCircle, label: plural(counts.notes, "note") });
  if (counts.reminders > 0) links.push({ kind: "reminders", icon: Bell, label: plural(counts.reminders, "reminder") });

  return (
    <div className="flex flex-col gap-2.5 border-t-2 border-border bg-background px-4 pb-3.5 pt-3">
      <div className="flex items-stretch gap-2.5">
        <StayChip stay={stay} rough={rough} onOpen={onOpenStay} onAdd={onAddStay} />
        <IdeasBox ideas={ideas} days={rough ? [] : slots.map((s) => s.dateISO)} onPick={onScheduleIdea} onAdd={onAddIdea} />
      </div>

      {rough ? (
        <Button variant="primary" size="sm" className="self-start" onClick={onGiveDates}>
          Give it dates
        </Button>
      ) : (
        selected && (
          <>
            <DayStrip
              stopId={stop.id}
              slots={slots}
              selected={selected}
              onSelect={onSelect}
              onOpen={(d) => router.push(tripHref(`/day/${d}`))}
              panelId={panelId}
              flashDate={flashDate}
            />
            {/* The height follows the day's rows (layout) so a 2-plan and a 6-plan day don't snap. */}
            <motion.div layout transition={{ layout: { duration: 0.18 } }}>
              <AnimatePresence mode="wait" initial={false} custom={dir}>
                <PresenceDiv
                  key={selected}
                  data-day={selected}
                  custom={dir}
                  variants={DAY_PANEL}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.18 }}
                >
                  <SelectedDay
                    tripId={tripId}
                    stopId={stop.id}
                    dateISO={selected}
                    dayTitle={dayTitles?.[selected]?.title}
                    items={dayItems.filter((i) => i.date === selected)}
                    costsById={costsById}
                    homeCurrency={homeCurrency}
                    ideasCount={ideas.length}
                    panelId={panelId}
                    tabId={`${panelId}-tab-${selected}`}
                    showDragHint={showDragHint}
                    onAdd={onAddPlan}
                    onEditItem={onEditItem}
                    onPickIdea={() =>
                      document.querySelector<HTMLButtonElement>(`#stop-${stop.id} [aria-label^="Pick a day for"]`)?.click()
                    }
                  />
                </PresenceDiv>
              </AnimatePresence>
            </motion.div>
          </>
        )
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
