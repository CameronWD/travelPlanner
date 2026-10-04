"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, EyeOff, GripVertical, Pencil } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useDayTitleEditor, DAY_TITLE_MAX_LENGTH } from "@/components/trip/day-title-editor";
import { useTripHref } from "@/components/trip/use-trip-href";
import { categoryDotClass } from "@/components/trip/category-dot";
import { ItemPhotoThumb } from "@/components/trip/item-photo-thumb";
import { buildStopDays, type StopDayItem } from "@/lib/stop-days";
import { formatMoney, sumMinorToHome } from "@/lib/money";
import { formatDayLabel } from "@/lib/dates";
import type { CostRow } from "@/server/actions/costs";
import { PresenceDiv } from "./presence";
import { useMotionTiming } from "./use-motion-timing";

/** dnd-kit draggable id prefix for a scheduled Item row (consumed by the plan page's drag handler). */
export const ITEM_DRAG_PREFIX = "item:";

/** Prefix for a day section's dnd-kit droppable id — the strip slot's id before it (spec D5: same-stop-only drops). */
export const SLOT_DROP_PREFIX = "slot:";

export function slotDropId(stopId: string, dateISO: string): string {
  return `${SLOT_DROP_PREFIX}${stopId}:${dateISO}`;
}

/** A day section's DOM id: what a `day=` hash link and a scheduled idea scroll to (spec 2026-10-04 §A). */
export function daySectionId(stopId: string, dateISO: string): string {
  return `plan-day-${stopId}-${dateISO}`;
}

/** How long a dragged plan hovers a folded day before it opens (spec 2026-10-04 §A). */
export const HOVER_OPEN_MS = 600;

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

const DRAG_HINT_KEY = "plan-drag-hint";

/**
 * Whether the once-per-session drag hint (PLAN.md §4.3) should still show.
 * True the first time it's asked in a browser session; false after that, and
 * whenever sessionStorage throws (private mode, quota, no storage at all).
 */
export function claimDragHint(): boolean {
  try {
    if (sessionStorage.getItem(DRAG_HINT_KEY)) return false;
    sessionStorage.setItem(DRAG_HINT_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Fri 11" from "Fri 11 Dec" — the empty-state / footer + Add label needs no month. */
function shortDayLabel(dateISO: string): string {
  return formatDayLabel(dateISO).replace(/ [A-Z][a-z]{2}$/, "");
}

function daySummary(items: StopDayItem[], costsById: Map<string, CostRow[]> | undefined, homeCurrency: string | undefined): string {
  const booked = items.filter((i) => i.booking).length;
  const costs = items.flatMap((i) => costsById?.get(i.id) ?? []);
  const parts = [plural(items.length, "plan")];
  if (booked > 0) parts.push(`${booked} booked`);
  if (costs.length > 0 && homeCurrency) {
    const total = sumMinorToHome(
      costs.map((c) => ({ amountMinor: c.costMinor, currency: c.currency })),
      homeCurrency,
      (cur) => costs.find((c) => c.currency.toUpperCase() === cur)?.rateToHome ?? undefined,
    ).totalMinor;
    parts.push(`${formatMoney(total, homeCurrency)} so far`);
  }
  return parts.join(" · ");
}

interface DayTitleProps {
  stopId: string;
  dateISO: string;
  dayTitle?: string;
}

/** The sun head's inline-editable Day title (shared editor, day-title-editor.ts). */
function DayTitle({ stopId, dateISO, dayTitle }: DayTitleProps) {
  const ed = useDayTitleEditor({ stopId, date: dateISO, title: dayTitle ?? null });
  const inputId = React.useId();
  // MOTION.md P5: the title pops once a save lands (router.refresh brings the
  // new prop). Same day only, so switching days never pops.
  const [prev, setPrev] = React.useState({ dateISO, dayTitle });
  // The class comes off on animationend, so showing the hidden desktop list
  // (a resize) doesn't replay it.
  const [popKey, setPopKey] = React.useState(0);
  const [popping, setPopping] = React.useState(false);
  if (prev.dateISO !== dateISO || prev.dayTitle !== dayTitle) {
    setPrev({ dateISO, dayTitle });
    if (prev.dateISO === dateISO && dayTitle && !ed.editing) {
      setPopKey((k) => k + 1);
      setPopping(true);
    }
  }

  if (ed.editing) {
    return (
      <>
        <label htmlFor={inputId} className="sr-only">
          Day title for {formatDayLabel(dateISO)}
        </label>
        <input
          id={inputId}
          autoFocus
          value={ed.value}
          onChange={(e) => ed.setValue(e.target.value)}
          onBlur={() => void ed.save()}
          onKeyDown={ed.onKeyDown}
          maxLength={DAY_TITLE_MAX_LENGTH}
          className="min-w-0 flex-1 bg-transparent font-display text-[22px] font-extrabold outline-none"
        />
      </>
    );
  }

  if (dayTitle) {
    return (
      <button
        type="button"
        onClick={ed.startEditing}
        aria-label={`Edit the day title, ${dayTitle}`}
        className="tap-target inline-flex min-w-0 items-center gap-1.5 font-display text-[22px] font-extrabold"
      >
        <span
          key={popKey}
          className={cn("truncate", popping && "tp-pop")}
          onAnimationEnd={(e) => e.target === e.currentTarget && setPopping(false)}
        >
          {dayTitle}
        </span>
        <Pencil className="size-4" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={ed.startEditing}
      aria-label="Add a title"
      className="tap-target inline-flex min-w-0 items-center gap-1.5 font-display text-[22px] font-extrabold"
    >
      <span className="text-foreground/45">Add a title</span>
      <Pencil className="size-4" aria-hidden />
    </button>
  );
}

interface DayRowProps {
  stopId: string;
  dateISO: string;
  item: StopDayItem;
  costs: CostRow[];
  isNew: boolean;
  onRiseInEnd(): void;
  onEditItem(item: StopDayItem): void;
}

/** One scheduled Item row: draggable onto another day section (deviation 1 — no within-day reorder). */
function DayRow({ stopId, dateISO, item, costs, isNew, onRiseInEnd, onEditItem }: DayRowProps) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${ITEM_DRAG_PREFIX}${item.id}`,
    data: {
      type: "item",
      stopId,
      date: dateISO,
      itemId: item.id,
      title: item.title,
      startTime: item.startTime ?? null,
      endTime: item.endTime ?? null,
    },
  });
  const rowCost = costs.length > 0 ? formatMoney(costs.reduce((sum, c) => sum + c.costMinor, 0), costs[0].currency) : null;

  return (
    <div
      ref={setNodeRef}
      data-row
      onAnimationEnd={isNew ? (e) => e.target === e.currentTarget && onRiseInEnd() : undefined}
      className={cn(
        "grid min-h-10 grid-cols-[14px_46px_12px_minmax(0,1fr)_auto] items-center gap-2.5 border-b-2 border-muted px-3.5 last:border-b-0",
        // MOTION.md P6: the lifted copy rides the DragOverlay; this stays as a dashed placeholder.
        isDragging && "rounded-lg border-2 border-dashed border-border bg-background opacity-60 last:border-b-2",
        // P7/P11: a plan that just arrived on this day rises in.
        isNew && "tp-rise-in",
      )}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={`Drag ${item.title} to another day`}
        className="tap-target cursor-grab touch-none text-muted-foreground"
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className={cn("text-[13px] font-extrabold tabular-nums", !item.startTime && "text-muted-foreground")}>
        {item.startTime ?? "—"}
      </span>
      <span className={cn("size-[11px] rounded-full border border-border", categoryDotClass(item.category))} aria-hidden />
      <button
        type="button"
        aria-label={`Edit ${item.title}`}
        onClick={() => onEditItem(item)}
        className="tap-target flex min-w-0 items-baseline gap-2 text-left"
      >
        <span className="shrink-0 text-sm font-bold">{item.title}</span>
        <span className="truncate text-xs text-muted-foreground">{item.address ?? item.notes?.split("\n")[0]}</span>
      </button>
      <div className="flex items-center gap-1.5">
        {item.booking && (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-teal/15 px-2 text-xs font-bold">
            Booked <Check className="size-3" />
          </span>
        )}
        {rowCost && <span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums">{rowCost}</span>}
        {item.photoUrl && <ItemPhotoThumb src={item.photoUrl} alt={item.title} />}
        {item.hiddenFromShares && (
          <span role="img" aria-label="Hidden from shares" className="shrink-0 text-muted-foreground">
            <EyeOff className="size-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Calls `onOpen` once `armed` has held for `delayMs`: a plan held over a
 * folded day's header opens it, so it can be dropped among that day's rows.
 * Moving on first (armed → false) cancels.
 */
export function useHoverOpen(armed: boolean, onOpen: () => void, delayMs: number = HOVER_OPEN_MS): void {
  const latest = React.useRef(onOpen);
  React.useEffect(() => {
    latest.current = onOpen;
  });
  React.useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => latest.current(), delayMs);
    return () => window.clearTimeout(timer);
  }, [armed, delayMs]);
}

export interface DaySectionProps {
  tripId: string;
  stopId: string;
  dateISO: string;
  dayTitle?: string;
  items: StopDayItem[];
  costsById?: Map<string, CostRow[]>;
  homeCurrency?: string;
  ideasCount: number;
  collapsed: boolean;
  /** Folds or opens the day — its header, or a plan held over it. */
  onCollapsedChange(collapsed: boolean): void;
  flash?: boolean;
  showDragHint: boolean;
  onAdd(dateISO: string): void;
  onEditItem(item: StopDayItem): void;
  onPickIdea(): void;
}

/**
 * One day of an open Stop (PLAN.md §4.3; spec 2026-10-04 §A): the sun head
 * with the inline Day title, a live summary, Open day and + Add, then one
 * row per scheduled Item, an empty state, and a footer that repeats + Add
 * and, once per session, the drag hint. The head folds the day to just its
 * header line. The whole section — folded or not — is the day's drop target.
 */
export function DaySection({
  tripId,
  stopId,
  dateISO,
  dayTitle,
  items,
  costsById,
  homeCurrency,
  ideasCount,
  collapsed,
  onCollapsedChange,
  flash = false,
  showDragHint,
  onAdd,
  onEditItem,
  onPickIdea,
}: DaySectionProps) {
  const tripHref = useTripHref(tripId);
  const { t } = useMotionTiming();
  const { setNodeRef, isOver, active } = useDroppable({
    id: slotDropId(stopId, dateISO),
    data: { type: "slot", stopId, date: dateISO },
    // An empty list re-measures every droppable, not only this one (dnd-kit
    // 6.3's useDroppableMeasuring): a day opening mid-drag moves every
    // section below it, and their stale rects would catch the drop.
    resizeObserverConfig: { updateMeasurementsFor: [] },
  });
  const planOver = isOver && active?.data.current?.type === "item";
  useHoverOpen(collapsed && planOver, () => onCollapsedChange(false));

  const day = buildStopDays(dateISO, dateISO, items)[0];
  const rows = [...day.timed, ...day.untimed];
  const summary = daySummary(items, costsById, homeCurrency);
  // Rows that weren't here last render (a scheduled idea, a moved or new plan)
  // rise in (MOTION.md P7). Held here, above the fold, so re-opening a day doesn't replay it.
  const ids = rows.map((r) => r.id).join("|");
  const [seen, setSeen] = React.useState({ ids, fresh: new Set<string>() });
  if (seen.ids !== ids) {
    const before = new Set(seen.ids.split("|"));
    setSeen({ ids, fresh: new Set(rows.map((r) => r.id).filter((id) => !before.has(id))) });
  }

  const sectionId = daySectionId(stopId, dateISO);
  const toggleId = `${sectionId}-toggle`;
  const bodyId = `${sectionId}-body`;

  return (
    <section
      ref={setNodeRef}
      id={sectionId}
      aria-labelledby={toggleId}
      data-day={dateISO}
      data-over={planOver || undefined}
      data-flash={flash || undefined}
      className={cn(
        "overflow-hidden rounded-2xl border-2 border-border bg-card shadow-hard-3 outline-offset-2",
        // P6: a plan held over the day outlines it (folded or open); the day it lands on flashes.
        "data-[over]:outline-3 data-[over]:outline-coral data-[flash]:tp-day-flash",
      )}
    >
      {/* The bare head folds the day too; its title, link and buttons keep their own jobs. */}
      <div
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("button, a, input")) onCollapsedChange(!collapsed);
        }}
        className={cn(
          "flex cursor-pointer flex-wrap items-center gap-2.5 bg-sun px-3.5 py-2.5 text-on-accent",
          !collapsed && "border-b-2 border-border",
        )}
      >
        <button
          id={toggleId}
          type="button"
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : bodyId}
          onClick={() => onCollapsedChange(!collapsed)}
          className="tap-target inline-flex items-center gap-1 text-[11px] font-extrabold tracking-[0.08em]"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-[var(--dur-base)]", collapsed && "-rotate-90")}
          />
          {formatDayLabel(dateISO).toUpperCase()}
        </button>
        <DayTitle stopId={stopId} dateISO={dateISO} dayTitle={dayTitle} />
        <span className="text-xs font-semibold text-on-accent-muted">{summary}</span>
        {!collapsed && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={tripHref(`/day/${dateISO}`)}
              className="tap-target pressable inline-flex h-9 items-center gap-1 rounded-full border-2 border-border bg-card px-3 text-[13px] font-extrabold"
            >
              Open day <ChevronRight className="size-4" aria-hidden />
            </Link>
            <Button variant="primary" size="sm" className="tap-target" onClick={() => onAdd(dateISO)}>
              + Add
            </Button>
          </div>
        )}
      </div>

      {/* MOTION.md P2's fold, per day: height 0 ↔ auto, the rows fading in after. */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <PresenceDiv
            key="body"
            id={bodyId}
            data-motion="day-fold"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: t({ height: { duration: 0.32, ease: EASE_POP }, opacity: { delay: 0.06, duration: 0.18 } }),
            }}
            exit={{ height: 0, opacity: 0, transition: t({ duration: 0.2, ease: EASE_EXIT }, "exit") }}
            className="overflow-hidden"
          >
            {rows.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2 px-3.5 py-3 text-sm">
                <span>Nothing planned yet</span>
                <button type="button" className="tap-target font-bold text-coral-text" onClick={() => onAdd(dateISO)}>
                  + Add to {shortDayLabel(dateISO)}
                </button>
                {ideasCount > 0 && (
                  <button type="button" className="tap-target font-bold text-coral-text" onClick={onPickIdea}>
                    or pick an idea
                  </button>
                )}
              </div>
            ) : (
              <>
                {rows.map((item) => (
                  <DayRow
                    key={item.id}
                    stopId={stopId}
                    dateISO={dateISO}
                    item={item}
                    costs={costsById?.get(item.id) ?? []}
                    isNew={seen.fresh.has(item.id)}
                    // Off once played, so a resize showing the hidden desktop list doesn't replay it.
                    onRiseInEnd={() =>
                      setSeen((cur) => ({ ids: cur.ids, fresh: new Set([...cur.fresh].filter((id) => id !== item.id)) }))
                    }
                    onEditItem={onEditItem}
                  />
                ))}
                <div className="flex items-center justify-between px-3.5 py-2">
                  <button type="button" className="tap-target text-[13px] font-bold text-coral-text" onClick={() => onAdd(dateISO)}>
                    + Add to {shortDayLabel(dateISO)}
                  </button>
                  {showDragHint && <span className="text-[13px] text-on-accent-muted">Drag a plan onto another day to move it</span>}
                </div>
              </>
            )}
          </PresenceDiv>
        )}
      </AnimatePresence>
    </section>
  );
}
