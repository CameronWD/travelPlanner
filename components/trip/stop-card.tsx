"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  BookOpen,
  Pin,
  CalendarClock,
  Sparkles,
  Plus,
  Bell,
  MessageCircle,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateRange, formatNights, nightsBetween, tzAbbrev } from "@/lib/dates";
import { MapLink } from "./map-link";
import { NoteThread, type NoteView } from "./note-thread";
import { AttachmentList, type AttachmentView } from "./attachment-list";
import { MoreActionsMenu, type CardActionItem } from "./card-actions";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import type { ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import type { ReminderItem } from "@/server/actions/reminders";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { stopBandBorderClass, stopPillClass } from "@/lib/stop-colours";
import { CategoryPill } from "./category-pill";
import type { Category } from "@/lib/categories";
import { groupByCategory } from "@/lib/group-by-category";
import { enumerateTripDays } from "@/lib/itinerary";
import { scheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { StopDayList } from "./stop-day-list";
import { DayPickerMenu } from "./day-picker-menu";
import type { StopDayItem } from "@/lib/stop-days";

export interface StopCardStop {
  id: string;
  name: string;
  country?: string | null;
  /** Null for rough (date-less) stops. */
  timezone: string | null;
  /** Null for rough (date-less) stops. */
  arriveDate: string | null;
  /** Null for rough (date-less) stops. */
  departDate: string | null;
  /** Rough nights estimate; null once scheduled. */
  nights: number | null;
  /** Whether the (scheduled) stop's dates are pinned. */
  pinned: boolean;
  /** Explicit chapter membership (used while rough); null when unassigned. */
  chapterId: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  sortOrder: number;
}

/** A minimal representation of a thing-to-do (plan-owned Item with date:null) */
export interface ThingToDo {
  id: string;
  title: string;
  category: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  address?: string | null;
  link?: string | null;
  booking?: string | null;
  notes?: string | null;
  stopId?: string | null;
}

export interface StopCardProps {
  stop: StopCardStop;
  isFirst: boolean;
  isLast: boolean;
  /** Called when the edit button is clicked */
  onEdit?: (stop: StopCardStop) => void;
  /** Called when move up is requested */
  onMoveUp?: (stopId: string) => void;
  /** Called when move down is requested */
  onMoveDown?: (stopId: string) => void;
  /** Called when delete is requested */
  onDelete?: (stopId: string) => void;
  /** Called when "Start a chapter here" is selected */
  onStartChapter?: (stop: StopCardStop) => void;
  /** Called when "Assign to chapter" is selected (rough stops only; dated stops show item disabled). */
  onAssignToChapter?: (stop: StopCardStop) => void;
  /** Called when the pin toggle is clicked (scheduled stops only). */
  onTogglePin?: (stopId: string) => void;
  /** Called when "Make rough" is selected (scheduled stops only). */
  onMakeRough?: (stopId: string) => void;
  /** Called when "Adjust dates" is selected (scheduled stops only). */
  onAdjustDates?: (stop: StopCardStop) => void;
  /** Pending state (e.g. while a server action is in flight) */
  isPending?: boolean;
  /** Notes attached to this stop */
  notes?: NoteView[];
  /** Trip ID (required for notes and things-to-do) */
  tripId?: string;
  /** Current user's ID (required for notes) */
  currentUserId?: string;
  /** Attachments for this stop */
  attachments?: AttachmentView[];
  /**
   * Optional drag handle element supplied by the parent (e.g. dnd-kit's
   * draggable button). Rendered at the left of the top row ONLY for rough
   * stops — scheduled stops are date-ordered and not draggable.
   */
  dragHandle?: React.ReactNode;
  // ── Things to do (ADR 0022) ──────────────────────────────────────────────
  /** Plan-owned things to do attached to this stop (stopId set, date null). */
  thingsToDo?: ThingToDo[];
  /** Scheduled items for this stop (date != null) — drives the day rows. */
  dayItems?: StopDayItem[];
  /** Costs keyed by item id (for edit pre-fill). */
  thingsToDoItemCosts?: Map<string, CostRow[]>;
  /** Attachments keyed by item id (for edit pre-fill). */
  thingsToDoItemAttachments?: Map<string, AttachmentView[]>;
  /** All stops in the trip (for the stop picker in ItemFormDialog). */
  stops?: StopOption[];
  /** Active fork/plan id — threaded to createItem. */
  forkId?: string | null;
  /** Trip's home currency — passed to ItemFormDialog cost fields. */
  homeCurrency?: string;
  // ── Accommodation ("Where you're staying") ──────────────────────────────
  /**
   * The Stop's rendered Accommodation rows, built by the parent. Contract:
   * pass `undefined` (never an empty array) when there are zero rows — a
   * nullish value is what shows the "No bed yet" tile. ItineraryManager
   * honours this.
   */
  accommodations?: React.ReactNode;
  /**
   * Called by the section's add button. The parent owns what happens — on a
   * rough Stop that is the "needs dates" explanation, not the form.
   */
  onAddAccommodation?: () => void;
  /**
   * Name of the Stop's first Accommodation, for the compact staying tile in
   * the `lg+` row. Omit when there is none — the tile then says "No bed yet".
   */
  accommodationName?: string;
  /**
   * Called by the overflow menu's "Add a reminder" item. The item renders
   * only when this is provided.
   */
  onAddReminder?: (stop: StopCardStop) => void;
  /**
   * Reminders about this Stop (Task 7), listed under a small "Reminders"
   * line. Omit (or pass an empty array) to render nothing — the line never
   * shows for a Stop with none.
   */
  reminders?: ReminderItem[];
}

/**
 * The Stop card's top block on `lg+`: the kit's DPlan row — place text |
 * dates & nights | staying tile | actions. Below `lg` the block keeps its
 * stacked `flex flex-col gap-3` (phone layout unchanged).
 */
export const STOP_CARD_ROW_CLASS =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_13rem_auto] lg:items-center lg:gap-4";

/** Coral placeholder tile shown when a Stop has no Accommodation yet. */
function NoBedYet({ className }: { className?: string }) {
  return (
    <Card tone="hue-coral" shadow={0} radius="xl" className={cn("border px-3 py-2 text-sm font-bold", className)}>
      No bed yet
    </Card>
  );
}

/**
 * Presentational card for a single stop.
 *
 * Renders one of two ways:
 *  - Rough (no arrive date): name + country, a "~N nights" draft badge, and a
 *    dashed/muted "draft" treatment. No dates, timezone, pin, or adjust-dates.
 *  - Scheduled (has dates): date range, timezone, nights, plus a pin toggle and
 *    "Adjust dates" / "Make rough" actions.
 */
export function StopCard({
  stop,
  isFirst,
  isLast,
  onEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
  onStartChapter,
  onAssignToChapter,
  onTogglePin,
  onMakeRough,
  onAdjustDates,
  isPending = false,
  notes,
  tripId,
  currentUserId,
  dragHandle,
  thingsToDo,
  dayItems,
  thingsToDoItemCosts,
  thingsToDoItemAttachments,
  stops = [],
  forkId,
  homeCurrency,
  attachments,
  accommodations,
  onAddAccommodation,
  accommodationName,
  onAddReminder,
  reminders,
}: StopCardProps) {
  const stayingHeadingId = React.useId();
  const isRough = !stop.arriveDate || !stop.departDate;
  const router = useRouter();

  const stayDays = React.useMemo(
    () => (isRough ? [] : enumerateTripDays(stop.arriveDate!, stop.departDate!)),
    [isRough, stop.arriveDate, stop.departDate],
  );

  async function handleScheduleThing(thing: ThingToDo, dateISO: string) {
    // Things-to-do can carry times (kept on unschedule "to make undo
    // lossless" — see unscheduleItem's doc comment in server/actions/items.ts).
    // scheduleItem's in-place branch overwrites startTime/endTime wholesale
    // when absent from the input, so pass the thing's existing times through
    // explicitly or picking a day silently wipes them.
    const res = await scheduleItem(thing.id, {
      date: dateISO,
      ...(thing.startTime ? { startTime: thing.startTime } : {}),
      ...(thing.endTime ? { endTime: thing.endTime } : {}),
    });
    if (!res.success) {
      toast({ title: "Couldn't schedule it", variant: "destructive" });
      return;
    }
    router.refresh();
  }

  // Things-to-do dialog state (ADR 0022)
  const [addThingOpen, setAddThingOpen] = React.useState(false);
  const [editingThing, setEditingThing] = React.useState<ItemCardItem | null>(null);

  // Notes/Attachments sheets, opened from the overflow menu at every width
  // (bottom sheets on phones, centred dialogs on wider screens).
  const [notesSheetOpen, setNotesSheetOpen] = React.useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = React.useState(false);

  // One overflow menu at every width (beta feedback Task 6): the card face
  // shows only Edit and Add thing to do; everything else folds in here.
  const menuItems: CardActionItem[] = [];
  if (notes !== undefined && tripId && currentUserId) {
    menuItems.push({
      key: "notes",
      label: notes.length > 0 ? `Notes (${notes.length})` : "Notes",
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
      onSelect: () => setNotesSheetOpen(true),
    });
  }
  if (attachments !== undefined && tripId) {
    menuItems.push({
      key: "attachments",
      label: attachments.length > 0 ? `Attachments (${attachments.length})` : "Attachments",
      icon: <Paperclip className="size-4" aria-hidden="true" />,
      onSelect: () => setAttachSheetOpen(true),
    });
  }
  if (isRough) {
    menuItems.push(
      {
        key: "up",
        label: "Move up",
        icon: <ChevronUp className="size-4" aria-hidden="true" />,
        onSelect: () => onMoveUp?.(stop.id),
        disabled: isFirst || isPending,
      },
      {
        key: "down",
        label: "Move down",
        icon: <ChevronDown className="size-4" aria-hidden="true" />,
        onSelect: () => onMoveDown?.(stop.id),
        disabled: isLast || isPending,
      },
    );
  }
  if (onStartChapter) {
    menuItems.push({
      key: "start-chapter",
      label: "Start a chapter here",
      icon: <BookOpen className="size-4" aria-hidden="true" />,
      onSelect: () => onStartChapter(stop),
      disabled: isPending,
    });
  }
  if (onAssignToChapter) {
    menuItems.push(
      isRough
        ? {
            key: "assign-chapter",
            label: "Assign to chapter",
            icon: <BookOpen className="size-4" aria-hidden="true" />,
            onSelect: () => onAssignToChapter(stop),
            disabled: isPending,
          }
        : {
            key: "assign-chapter",
            label: "Assign to chapter",
            icon: <BookOpen className="size-4" aria-hidden="true" />,
            onSelect: () => {},
            disabled: true,
            hint: "Grouped by its dates — drag or re-date to move",
          },
    );
  }
  if (!isRough && onTogglePin) {
    menuItems.push({
      key: "pin",
      label: stop.pinned ? "Unpin dates" : "Pin dates",
      icon: <Pin className={cn("size-4", stop.pinned && "fill-current")} aria-hidden="true" />,
      onSelect: () => onTogglePin(stop.id),
      disabled: isPending,
    });
  }
  if (!isRough && onAdjustDates) {
    menuItems.push({
      key: "adjust-dates",
      label: "Adjust dates",
      icon: <CalendarClock className="size-4" aria-hidden="true" />,
      onSelect: () => onAdjustDates(stop),
      disabled: isPending,
    });
  }
  // "Make rough" clears a scheduled Stop's dates; the old separate inline
  // "Clear dates" button (bug #8) folded into this one item.
  if (!isRough && onMakeRough) {
    menuItems.push({
      key: "make-rough",
      label: "Make rough",
      icon: <Sparkles className="size-4" aria-hidden="true" />,
      onSelect: () => onMakeRough(stop.id),
      disabled: isPending,
    });
  }
  if (onAddReminder) {
    menuItems.push({
      key: "add-reminder",
      label: "Add a reminder",
      icon: <Bell className="size-4" aria-hidden="true" />,
      onSelect: () => onAddReminder(stop),
      disabled: isPending,
    });
  }
  // Delete — owner-only (ARCH-DAT-1b); absent whenever the caller omits
  // onDelete. Cosmetic only: the server action is the real access control.
  if (onDelete) {
    menuItems.push({
      key: "delete",
      label: `Delete ${stop.name}`,
      icon: <Trash2 className="size-4" aria-hidden="true" />,
      onSelect: () => onDelete(stop.id),
      disabled: isPending,
      destructive: true,
    });
  }

  const showStaying = accommodations != null || onAddAccommodation != null;
  const stayingTile = !showStaying ? null : accommodations == null ? (
    <NoBedYet />
  ) : accommodationName ? (
    <Card tone="hue-lilac" shadow={0} radius="xl" className="truncate border px-3 py-2 text-sm font-bold">
      {accommodationName}
    </Card>
  ) : null;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-l-4 bg-card p-5 shadow-soft transition-shadow hover:shadow-soft-lg",
        isRough
          ? "border-dashed border-border/70 bg-card/60"
          : "border-border",
        stopBandBorderClass(stop.sortOrder),
        isPending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Top block. Phone: the stacked column (name row, then dates). lg+:
          the kit's DPlan row — place | dates & nights | staying tile |
          actions. The name row uses `lg:contents` so its two halves become
          grid cells of their own. ADR 0021: dated stops are draggable too, so
          the handle renders whenever it's provided. */}
      <div
        data-testid="stop-card-header"
        className={cn("flex flex-col gap-3", STOP_CARD_ROW_CLASS)}
      >
        <div className="flex items-start justify-between gap-3 lg:contents">
          <div className="flex min-w-0 flex-1 items-start gap-3 lg:col-start-1 lg:row-start-1 lg:items-center">
            {dragHandle}
            <div data-testid="stop-card-place" className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h3 className="font-display min-w-0 flex-1 break-words text-xl font-semibold leading-tight text-foreground">
                {stop.name}
              </h3>
              {stop.country && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  {/* No decorative pin here: MapLink below renders the real one,
                      and help-legend.tsx teaches that glyph as "has a location"
                      (HG-02/HG-10). */}
                  <span>{stop.country}</span>
                  {/* Gate on real coordinates explicitly: MapLink's own fallback
                      (address || label) would otherwise treat the name/country
                      label as a searchable "location" for every stop, making the
                      pin fire even when there's no actual location on record —
                      exactly the ambiguity this fix removes. */}
                  {stop.lat != null && stop.lng != null && (
                    <MapLink
                      lat={stop.lat}
                      lng={stop.lng}
                      label={stop.country ? `${stop.name}, ${stop.country}` : stop.name}
                      className="text-muted-foreground/60"
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions: two visible icon buttons + one overflow menu. */}
          <div className="flex shrink-0 items-center justify-end gap-2 lg:col-start-4 lg:row-start-1">
            <Button
              variant="ghost"
              size="icon"
              className="tap-target size-8"
              disabled={isPending}
              onClick={() => onEdit?.(stop)}
              aria-label={`Edit ${stop.name}`}
              title="Edit Stop"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            {tripId && (
              <Button
                variant="ghost"
                size="icon"
                className="tap-target size-8"
                disabled={isPending}
                onClick={() => setAddThingOpen(true)}
                aria-label="Add thing to do"
                title="Add Thing to Do"
              >
                <Plus className="size-4" aria-hidden="true" />
              </Button>
            )}
            <MoreActionsMenu label={`More actions for ${stop.name}`} items={menuItems} />
          </div>
        </div>

        {/* Rough draft badge OR scheduled dates + nights */}
        <div className="lg:col-start-2 lg:row-start-1">
          {isRough ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border border-dashed border-border/70",
                  stopPillClass(stop.sortOrder),
                )}
              >
                {formatNights(stop.nights ?? 1, { rough: true })}
              </span>
            </div>
          ) : (
            <DatedMeta arriveDate={stop.arriveDate!} departDate={stop.departDate!} timezone={stop.timezone} sortOrder={stop.sortOrder} />
          )}
        </div>

        {/* Compact staying tile — lg+ only; phones read the full section below. */}
        {stayingTile && (
          <div data-testid="stop-staying-tile" className="hidden min-w-0 lg:col-start-3 lg:row-start-1 lg:block">
            {stayingTile}
          </div>
        )}
      </div>

      {/* Where you're staying — the Stop's Accommodation, inside its card.
          Rendered whenever the parent wires Accommodation in (the plan
          editor); other callers (e.g. StopsManager) leave it out. */}
      {showStaying && (
        <section
          data-testid="stop-staying"
          aria-labelledby={stayingHeadingId}
          className="flex flex-col gap-1.5"
        >
          <h4
            id={stayingHeadingId}
            className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70"
          >
            Where you&apos;re staying
          </h4>
          {accommodations != null ? (
            <div className="flex flex-col gap-2">{accommodations}</div>
          ) : (
            // lg+ shows this in the row's staying tile instead.
            <NoBedYet className="lg:hidden" />
          )}
          {onAddAccommodation && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                disabled={isPending}
                onClick={onAddAccommodation}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add accommodation
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Notes preview */}
      {stop.notes && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {stop.notes}
        </p>
      )}

      {/* Reminders about this Stop (Task 7) */}
      {reminders && reminders.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Reminders
          </div>
          <ul className="flex flex-col gap-1">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Bell className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words text-foreground">{r.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.date}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Day rows — the stop's slice of the Timeline (grilling 2026-09-13) */}
      {tripId && !isRough && (
        <StopDayList
          tripId={tripId}
          stop={{ id: stop.id, arriveDate: stop.arriveDate!, departDate: stop.departDate! }}
          items={dayItems ?? []}
          stops={stops}
          forkId={forkId}
          homeCurrency={homeCurrency}
          itemCostsById={thingsToDoItemCosts}
          itemAttachmentsById={thingsToDoItemAttachments}
          isPending={isPending}
        />
      )}

      {/* Things to do (ADR 0022) — shown when tripId is provided */}
      {tripId && (
        <>
          {/* List of existing things to do, grouped by Category */}
          {thingsToDo && thingsToDo.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Things to do
              </div>
              {groupByCategory(thingsToDo).map((group) => (
                <section key={group.category} data-testid="things-group" className="flex flex-col gap-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {group.label}
                  </h4>
                  <ul className="flex flex-col gap-1.5">
                  {group.items.map((thing) => (
                    <li key={thing.id} className="flex items-center gap-2">
                      <CategoryPill category={thing.category as Category} size="sm" />
                      <span className="min-w-0 flex-1 break-words text-sm text-foreground">{thing.title}</span>
                      {/* Right-aligned time when item is timed */}
                      {thing.startTime && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {thing.startTime}
                        </span>
                      )}
                      {!isRough && stayDays.length > 0 && (
                        <DayPickerMenu
                          days={stayDays}
                          label={`Pick a day for ${thing.title}`}
                          onPick={(d) => handleScheduleThing(thing, d)}
                          disabled={isPending}
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="tap-target size-8 shrink-0 text-muted-foreground"
                        disabled={isPending}
                        onClick={() => {
                          setEditingThing({
                            id: thing.id,
                            title: thing.title,
                            category: thing.category,
                            date: thing.date ?? null,
                            startTime: thing.startTime ?? null,
                            endTime: thing.endTime ?? null,
                            address: thing.address ?? null,
                            link: thing.link ?? null,
                            booking: thing.booking ?? null,
                            notes: thing.notes ?? null,
                            stopId: thing.stopId ?? null,
                          });
                        }}
                        aria-label={`Edit ${thing.title}`}
                        title="Edit"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {/* Add a thing to do — coral text link (D3 design) */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-0 text-xs text-primary hover:text-primary/80 hover:bg-transparent"
              disabled={isPending}
              onClick={() => setAddThingOpen(true)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add Thing to Do
            </Button>
          </div>

          {/* Create dialog */}
          <ItemFormDialog
            tripId={tripId}
            stops={stops}
            defaultUnscheduled={true}
            open={addThingOpen}
            onOpenChange={setAddThingOpen}
            forkId={forkId}
            defaultStopId={stop.id}
            homeCurrency={homeCurrency}
          />

          {/* Edit dialog */}
          {editingThing && (
            <ItemFormDialog
              tripId={tripId}
              stops={stops}
              item={editingThing}
              open={editingThing !== null}
              onOpenChange={(open) => { if (!open) setEditingThing(null); }}
              forkId={forkId}
              homeCurrency={homeCurrency}
              costs={thingsToDoItemCosts?.get(editingThing.id)}
              attachments={thingsToDoItemAttachments?.get(editingThing.id) ?? []}
            />
          )}
        </>
      )}

      {/* Notes sheet — opened from the overflow menu. */}
      {notes !== undefined && tripId && currentUserId && (
        <Dialog open={notesSheetOpen} onOpenChange={setNotesSheetOpen}>
          <DialogContent>
            <DialogTitle className="sr-only">Notes</DialogTitle>
            <NoteThread
              inline
              tripId={tripId}
              targetType="STOP"
              targetId={stop.id}
              notes={notes}
              currentUserId={currentUserId}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Attachments sheet — opened from the overflow menu. */}
      {attachments !== undefined && tripId && (
        <Dialog open={attachSheetOpen} onOpenChange={setAttachSheetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Attachments</DialogTitle>
            </DialogHeader>
            <AttachmentList
              tripId={tripId}
              targetType="STOP"
              targetId={stop.id}
              attachments={attachments}
              compact
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function DatedMeta({
  arriveDate,
  departDate,
  timezone,
  sortOrder,
}: {
  arriveDate: string;
  departDate: string;
  timezone: string | null;
  sortOrder: number;
}) {
  const nights = nightsBetween(arriveDate, departDate);
  const dateRange = formatDateRange(arriveDate, departDate);
  const tz = tzAbbrev(timezone, arriveDate);

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{dateRange}</span>
        {tz && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {tz}
          </span>
        )}
      </div>
      {/* Compact "Nn" nights pill (D3 design) */}
      {nights > 0 && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
            stopPillClass(sortOrder),
          )}
        >
          {formatNights(nights)}
        </span>
      )}
      {nights === 0 && (
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          <span>Same-day visit</span>
        </div>
      )}
    </div>
  );
}
