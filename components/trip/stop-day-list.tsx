"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Plus, ArrowUpRight, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { formatDayLabel } from "@/lib/dates";
import { buildStopDays, type StopDay, type StopDayItem } from "@/lib/stop-days";
import { scheduleItem } from "@/server/actions/items";
import { useDayTitleEditor, DAY_TITLE_MAX_LENGTH } from "./day-title-editor";
import { fitTitles } from "./fit-titles";
import { categoryDotClass } from "./category-dot";
import { CategoryPill } from "./category-pill";
import type { Category } from "@/lib/categories";
import { DayPickerMenu } from "./day-picker-menu";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import { UnscheduleItemButton } from "./unschedule-item-button";
import type { ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import type { AttachmentView } from "./attachment-list";
import { ItemPhotoThumb } from "./item-photo-thumb";

export interface StopDayListProps {
  tripId: string;
  stop: { id: string; arriveDate: string; departDate: string };
  /**
   * Scheduled items for this stop's slice of the Timeline, arrive → depart
   * inclusive (`lib/stop-days.ts`'s `buildStopDays`, keyed by date coverage —
   * NOT by `stopId`). On a Changeover day (ADR 0049) this includes Items
   * owned by the adjoining Stop too; `ownerLabelFor` below marks those.
   */
  items: StopDayItem[];
  stops: StopOption[];
  forkId?: string | null;
  homeCurrency?: string;
  itemCostsById?: Map<string, CostRow[]>;
  itemAttachmentsById?: Map<string, AttachmentView[]>;
  isPending?: boolean;
  /**
   * Day titles (CONTEXT.md "Day title") keyed by dateISO, across the whole
   * plan — not just this Stop — so a Changeover day (ADR 0049) shows its
   * title under both Stop cards regardless of which one owns the row.
   * `lib/day-titles.ts`'s `titlesByDate`, serialised to a plain object.
   */
  dayTitles?: Record<string, { title: string; stopId: string }>;
}

const PREVIEW_COUNT = 2;

/**
 * Width of `ref`'s element, live via ResizeObserver. 0 on the server and in
 * jsdom (no ResizeObserver, no layout) — callers fall back to PREVIEW_COUNT
 * rather than trusting a bogus 0px measurement.
 */
function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const el = ref.current;
      if (!el || typeof ResizeObserver === "undefined") return () => {};
      const observer = new ResizeObserver(() => onStoreChange());
      observer.observe(el);
      return () => observer.disconnect();
    },
    [ref],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => ref.current?.getBoundingClientRect().width ?? 0,
    () => 0,
  );
}

/**
 * The Stop card's day-by-day view of its slice of the Timeline (CONTEXT.md
 * "Timeline"; grilling 2026-09-13). Items only — accommodation and transport
 * render elsewhere on the plan. Rows are collapsed by default; expansion is
 * ephemeral. Every day of the stay renders, empty ones muted with their own
 * "+ Add".
 */
export function StopDayList({
  tripId,
  stop,
  items,
  stops,
  forkId,
  homeCurrency,
  itemCostsById,
  itemAttachmentsById,
  isPending = false,
  dayTitles,
}: StopDayListProps) {
  const router = useRouter();
  const days = React.useMemo(
    () => buildStopDays(stop.arriveDate, stop.departDate, items),
    [stop.arriveDate, stop.departDate, items],
  );
  const dayISOs = React.useMemo(() => days.map((d) => d.dateISO), [days]);

  // A Changeover day shows Items owned by the adjoining Stop too (ADR 0049).
  // Naming that Stop is what keeps the Budget's per-Stop roll-up explicable —
  // the money follows the owner, not the card you happen to be looking at.
  const stopNameById = React.useMemo(
    () => new Map(stops.map((s) => [s.id, s.name] as const)),
    [stops],
  );
  const ownerLabelFor = React.useCallback(
    (it: StopDayItem): string | null =>
      it.stopId && it.stopId !== stop.id ? (stopNameById.get(it.stopId) ?? null) : null,
    [stopNameById, stop.id],
  );

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [addForDate, setAddForDate] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<ItemCardItem | null>(null);

  function toggle(dateISO: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dateISO)) next.delete(dateISO);
      else next.add(dateISO);
      return next;
    });
  }

  async function handleMove(item: StopDayItem, targetDateISO: string) {
    // `scheduleItem` overwrites startTime/endTime wholesale, so the item's
    // existing times must be passed through explicitly to survive the move.
    // Which Stop ends up owning the item is the server's call (ADR 0049
    // rule 4) — this used to hand-guard against `stopForDate` re-filing an
    // item off the card on a changeover day, which is now a rule rather than
    // a workaround.
    const res = await scheduleItem(item.id, {
      date: targetDateISO,
      ...(item.startTime ? { startTime: item.startTime } : {}),
      ...(item.endTime ? { endTime: item.endTime } : {}),
    });
    if (!res.success) {
      toast({ title: "Couldn't move it", variant: "destructive" });
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col border-t border-border/40 pt-2" data-testid="stop-day-list">
      {days.map((day) => {
        const isOpen = expanded.has(day.dateISO);
        const all = [...day.timed, ...day.untimed];
        return (
          <div key={day.dateISO} className="group/day relative flex flex-col" data-testid={`day-row-${day.dateISO}`}>
            <DayTitleRow
              stopId={stop.id}
              date={day.dateISO}
              title={dayTitles?.[day.dateISO]?.title}
              isPending={isPending}
            />
            <CollapsedDayRow
              day={day}
              all={all}
              isOpen={isOpen}
              onToggle={() => toggle(day.dateISO)}
              trailingInset={!dayTitles?.[day.dateISO]?.title}
            />

            {isOpen && (
              <div
                data-testid={`day-detail-${day.dateISO}`}
                className="ml-3 flex flex-col gap-1 border-l border-border/40 pb-2 pl-4 pointer-coarse:gap-4 pointer-coarse:pt-2"
              >
                {day.timed.map((it) => (
                  <DayItemRow
                    key={it.id}
                    item={it}
                    timeLabel={it.startTime!}
                    ownerLabel={ownerLabelFor(it)}
                    days={dayISOs}
                    isPending={isPending}
                    onEdit={() => setEditing(toItemCardItem(it))}
                    onMove={(d) => handleMove(it, d)}
                  />
                ))}
                {day.untimed.length > 0 && (
                  <>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Anytime
                    </div>
                    {day.untimed.map((it) => (
                      <DayItemRow
                        key={it.id}
                        item={it}
                        timeLabel={null}
                        ownerLabel={ownerLabelFor(it)}
                        days={dayISOs}
                        isPending={isPending}
                        onEdit={() => setEditing(toItemCardItem(it))}
                        onMove={(d) => handleMove(it, d)}
                      />
                    ))}
                  </>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-0 text-xs text-primary hover:bg-transparent hover:text-primary/80"
                    disabled={isPending}
                    onClick={() => setAddForDate(day.dateISO)}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add to this day
                  </Button>
                  <Link
                    href={`/trips/${tripId}/day/${day.dateISO}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Open day
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Create dialog — pre-dated to the chosen day, scheduled mode */}
      {addForDate && (
        <ItemFormDialog
          tripId={tripId}
          stops={stops}
          defaultUnscheduled={false}
          defaultDate={addForDate}
          defaultStopId={stop.id}
          open={addForDate !== null}
          onOpenChange={(open) => { if (!open) setAddForDate(null); }}
          forkId={forkId}
          homeCurrency={homeCurrency}
        />
      )}

      {/* Edit dialog */}
      {editing && (
        <ItemFormDialog
          tripId={tripId}
          stops={stops}
          item={editing}
          open={editing !== null}
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          forkId={forkId}
          homeCurrency={homeCurrency}
          costs={itemCostsById?.get(editing.id)}
          attachments={itemAttachmentsById?.get(editing.id) ?? []}
        />
      )}
    </div>
  );
}

/**
 * A day row's Day title (CONTEXT.md "Day title"). The Day view is the
 * primary place to add one (spec 2026-09-28 D4); here the row stays quiet:
 * a titled day shows its title as a click-to-edit button, an untitled day
 * shows a small icon button positioned out of the flow at the right end of
 * the collapsed day row (just left of its chevron) — hover/focus-only on
 * pointer-fine devices, a real `tap-target` on touch, but never a rendered
 * row item at any width. Kept as its own sibling above `CollapsedDayRow`'s
 * toggle button rather than nested inside it — a button can't contain a
 * button. Forks keep Day titles through this path (the Day view is
 * real-plan only).
 */
function DayTitleRow({ stopId, date, title, isPending }: { stopId: string; date: string; title: string | undefined; isPending: boolean }) {
  const ed = useDayTitleEditor({ stopId, date, title });
  const inputId = React.useId();

  if (ed.editing) {
    return (
      <div className="px-1.5 pb-1 pt-1.5">
        <label htmlFor={inputId} className="sr-only">
          Day title for {formatDayLabel(date)}
        </label>
        <input
          id={inputId}
          autoFocus
          value={ed.value}
          onChange={(e) => ed.setValue(e.target.value)}
          onBlur={() => void ed.save()}
          onKeyDown={ed.onKeyDown}
          disabled={isPending}
          placeholder="Sintra day trip"
          maxLength={DAY_TITLE_MAX_LENGTH}
          className="h-8 w-full max-w-xs rounded-md border-2 border-input bg-card px-2 text-sm font-semibold text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
        />
      </div>
    );
  }

  if (title) {
    return (
      <button
        type="button"
        onClick={ed.startEditing}
        disabled={isPending}
        aria-label={`Edit the day title, ${title}`}
        className="mx-1.5 mb-0.5 mt-1.5 flex max-w-fit items-center truncate rounded px-1 py-0.5 text-left text-xs font-semibold text-foreground hover:bg-muted/50 pointer-coarse:min-h-11"
      >
        {title}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={ed.startEditing}
      disabled={isPending}
      aria-label={`Add a title for ${formatDayLabel(date)}`}
      title="Add a title"
      className={cn(
        "tap-target absolute right-7 top-1.5 z-[1] inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
        // Pointer-fine: out of sight until the row is hovered or the button is focused.
        "pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:group-hover/day:opacity-100 pointer-fine:focus-visible:opacity-100",
      )}
    >
      <Plus className="size-3.5" aria-hidden="true" />
    </button>
  );
}

/**
 * One collapsed day row's toggle button. Owns the width measurement so the
 * preview shows as many titles as fit the actual column (task 3) instead of
 * a fixed `PREVIEW_COUNT` — jsdom and SSR have no layout, so `useElementWidth`
 * reports 0 there and this falls back to `PREVIEW_COUNT` as before.
 */
function CollapsedDayRow({
  day,
  all,
  isOpen,
  onToggle,
  trailingInset,
}: {
  day: StopDay;
  all: StopDayItem[];
  isOpen: boolean;
  onToggle: () => void;
  /** True when the untitled-day icon button is floating over this row's right end (task A). */
  trailingInset?: boolean;
}) {
  const previewRef = React.useRef<HTMLSpanElement>(null);
  const width = useElementWidth(previewRef);
  const shown = width ? fitTitles(all.map((it) => it.title), width).shown : PREVIEW_COUNT;

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-muted/50 pointer-coarse:min-h-11",
        trailingInset && "pr-9",
      )}
    >
      <span className="w-24 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {formatDayLabel(day.dateISO)}
      </span>
      {all.length === 0 ? (
        <span className="min-w-0 flex-1 break-words text-xs italic text-muted-foreground/60">
          Nothing planned
        </span>
      ) : (
        <span
          ref={previewRef}
          data-testid="day-preview"
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
        >
          {all.slice(0, shown).map((it) => (
            <span key={it.id} className="inline-flex min-w-0 items-center gap-1">
              <span
                className={cn("size-1.5 shrink-0 rounded-full", categoryDotClass(it.category))}
                aria-hidden="true"
              />
              <span className="truncate text-xs text-foreground">{it.title}</span>
            </span>
          ))}
          {shown < all.length && (
            <span className="shrink-0 text-xs text-muted-foreground">+{all.length - shown}</span>
          )}
        </span>
      )}
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          isOpen && "rotate-180",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

function toItemCardItem(it: StopDayItem): ItemCardItem {
  return {
    id: it.id,
    title: it.title,
    category: it.category,
    date: it.date ?? null,
    startTime: it.startTime ?? null,
    endTime: it.endTime ?? null,
    address: it.address ?? null,
    link: it.link ?? null,
    booking: it.booking ?? null,
    notes: it.notes ?? null,
    stopId: it.stopId ?? null,
    hiddenFromShares: it.hiddenFromShares ?? false,
    photoUrl: it.photoUrl ?? null,
  };
}

function DayItemRow({
  item,
  timeLabel,
  ownerLabel,
  days,
  isPending,
  onEdit,
  onMove,
}: {
  item: StopDayItem;
  timeLabel: string | null;
  /** Set only when another Stop owns this Item — a Changeover day (ADR 0049). */
  ownerLabel: string | null;
  days: string[];
  isPending: boolean;
  onEdit: () => void;
  onMove: (dateISO: string) => void;
}) {
  return (
    <div className="group/dayitem flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
        {timeLabel ?? ""}
      </span>
      {item.photoUrl && <ItemPhotoThumb src={item.photoUrl} alt={item.title} />}
      <CategoryPill category={item.category as Category} size="sm" />
      <span className="min-w-0 flex-1 break-words text-sm text-foreground">{item.title}</span>
      {item.hiddenFromShares && (
        <span role="img" aria-label="Hidden from shares" title="Hidden from shares" className="shrink-0 text-muted-foreground">
          <EyeOff className="size-3.5" aria-hidden="true" />
        </span>
      )}
      {ownerLabel && (
        <span className="shrink-0 text-xs italic text-muted-foreground/70">
          {ownerLabel}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="tap-target size-7 shrink-0 text-muted-foreground"
        disabled={isPending}
        onClick={onEdit}
        aria-label={`Edit ${item.title}`}
        title="Edit"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Button>
      <DayPickerMenu
        days={days}
        label={`Move ${item.title} to another day`}
        currentDate={item.date}
        onPick={onMove}
        disabled={isPending}
      />
      <UnscheduleItemButton
        itemId={item.id}
        itemTitle={item.title}
        date={item.date!}
        startTime={item.startTime ?? null}
        endTime={item.endTime ?? null}
        hadStop={Boolean(item.stopId)}
      />
    </div>
  );
}
