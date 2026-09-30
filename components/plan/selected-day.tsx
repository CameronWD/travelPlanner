"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronRight, EyeOff, GripVertical, Pencil } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
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

/** dnd-kit draggable id prefix for a scheduled Item row (consumed by the plan page's drag handler). */
export const ITEM_DRAG_PREFIX = "item:";

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
function SelectedDayTitle({ stopId, dateISO, dayTitle }: DayTitleProps) {
  const ed = useDayTitleEditor({ stopId, date: dateISO, title: dayTitle ?? null });
  const inputId = React.useId();

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
        <span className="truncate">{dayTitle}</span>
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
  onEditItem(item: StopDayItem): void;
}

/** One scheduled Item row: draggable onto a day-strip slot (deviation 1 — no within-day reorder). */
function DayRow({ stopId, dateISO, item, costs, onEditItem }: DayRowProps) {
  const { setNodeRef, listeners, attributes } = useDraggable({
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
      className="grid min-h-10 grid-cols-[14px_46px_12px_minmax(0,1fr)_auto] items-center gap-2.5 border-b-2 border-muted px-3.5 last:border-b-0"
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

export interface SelectedDayProps {
  tripId: string;
  stopId: string;
  dateISO: string;
  dayTitle?: string;
  items: StopDayItem[];
  costsById?: Map<string, CostRow[]>;
  homeCurrency?: string;
  ideasCount: number;
  panelId: string;
  tabId: string;
  showDragHint: boolean;
  onAdd(dateISO: string): void;
  onEditItem(item: StopDayItem): void;
  onPickIdea(): void;
}

/**
 * The selected-day panel (PLAN.md §4.3): sun head with the inline Day title
 * and a live summary, one row per scheduled Item (draggable onto a day-strip
 * slot only — deviation 1), an empty state, and a footer that repeats + Add
 * and, once per session, the drag hint.
 */
export function SelectedDay({
  tripId,
  stopId,
  dateISO,
  dayTitle,
  items,
  costsById,
  homeCurrency,
  ideasCount,
  panelId,
  tabId,
  showDragHint,
  onAdd,
  onEditItem,
  onPickIdea,
}: SelectedDayProps) {
  const tripHref = useTripHref(tripId);
  const day = buildStopDays(dateISO, dateISO, items)[0];
  const rows = [...day.timed, ...day.untimed];
  const summary = daySummary(items, costsById, homeCurrency);

  return (
    <section role="tabpanel" id={panelId} aria-labelledby={tabId} className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-hard-3">
      <div className="flex flex-wrap items-center gap-2.5 border-b-2 border-border bg-sun px-3.5 py-2.5 text-on-accent">
        <span className="text-[11px] font-extrabold tracking-[0.08em]">{formatDayLabel(dateISO).toUpperCase()}</span>
        <SelectedDayTitle stopId={stopId} dateISO={dateISO} dayTitle={dayTitle} />
        <span className="text-xs font-semibold text-on-accent-muted">{summary}</span>
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
      </div>

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
              onEditItem={onEditItem}
            />
          ))}
          <div className="flex items-center justify-between px-3.5 py-2">
            <button type="button" className="tap-target text-[13px] font-bold text-coral-text" onClick={() => onAdd(dateISO)}>
              + Add to {shortDayLabel(dateISO)}
            </button>
            {showDragHint && <span className="text-[13px] text-on-accent-muted">Drag a plan onto a day above to move it</span>}
          </div>
        </>
      )}
    </section>
  );
}
