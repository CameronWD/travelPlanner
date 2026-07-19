import * as React from "react";
import {
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  MapPin,
  Calendar,
  Clock,
  BookOpen,
  Pin,
  CalendarClock,
  Sparkles,
  X,
  Plus,
  MessageCircle,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { formatDateRange, formatNights, nightsBetween, tzAbbrev } from "@/lib/dates";
import { MapLink } from "./map-link";
import { NoteThread, type NoteView } from "./note-thread";
import { AttachmentPopover } from "./attachment-popover";
import { AttachmentList, type AttachmentView } from "./attachment-list";
import { MoreActionsMenu, type CardActionItem } from "./card-actions";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import type { ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { stopBandBorderClass, stopPillClass } from "@/lib/stop-colours";
import { categoryDotClass } from "./category-dot";

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
  thingsToDoItemCosts,
  thingsToDoItemAttachments,
  stops = [],
  forkId,
  homeCurrency,
  attachments,
}: StopCardProps) {
  const isRough = !stop.arriveDate || !stop.departDate;

  // Things-to-do dialog state (ADR 0022)
  const [addThingOpen, setAddThingOpen] = React.useState(false);
  const [editingThing, setEditingThing] = React.useState<ItemCardItem | null>(null);

  // Mobile-only Notes/Attachments bottom sheets (ADR n/a — reversible CSS
  // decluttering pass, see fix/modal-mobile-styling).
  const [notesSheetOpen, setNotesSheetOpen] = React.useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = React.useState(false);

  // Overflow menu items (rough-only reorder + scheduled-only actions).
  const overflowItems: CardActionItem[] = [];
  if (isRough) {
    overflowItems.push(
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
    overflowItems.push({
      key: "start-chapter",
      label: "Start a chapter here",
      icon: <BookOpen className="size-4" aria-hidden="true" />,
      onSelect: () => onStartChapter(stop),
      disabled: isPending,
    });
  }
  if (onAssignToChapter) {
    overflowItems.push(
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
  if (!isRough && onAdjustDates) {
    overflowItems.push({
      key: "adjust-dates",
      label: "Adjust dates",
      icon: <CalendarClock className="size-4" aria-hidden="true" />,
      onSelect: () => onAdjustDates(stop),
      disabled: isPending,
    });
  }
  if (!isRough && onMakeRough) {
    overflowItems.push({
      key: "make-rough",
      label: "Make rough",
      icon: <Sparkles className="size-4" aria-hidden="true" />,
      onSelect: () => onMakeRough(stop.id),
      disabled: isPending,
    });
  }

  // Mobile overflow menu: every secondary action folds in here so the card
  // face shows only the drag handle, Edit, and this ⋯ menu. Desktop keeps the
  // inline buttons (below, behind `hidden sm:*`) and the scheduled-only menu.
  const mobileOverflowItems: CardActionItem[] = [];
  if (notes !== undefined && tripId && currentUserId) {
    mobileOverflowItems.push({
      key: "notes",
      label: notes.length > 0 ? `Notes (${notes.length})` : "Notes",
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
      onSelect: () => setNotesSheetOpen(true),
    });
  }
  if (attachments !== undefined && tripId) {
    mobileOverflowItems.push({
      key: "attachments",
      label: attachments.length > 0 ? `Attachments (${attachments.length})` : "Attachments",
      icon: <Paperclip className="size-4" aria-hidden="true" />,
      onSelect: () => setAttachSheetOpen(true),
    });
  }
  // Chapter / reorder / date actions reuse the same shapes as overflowItems.
  mobileOverflowItems.push(...overflowItems);
  if (!isRough && onTogglePin) {
    mobileOverflowItems.push({
      key: "pin",
      label: stop.pinned ? "Unpin dates" : "Pin dates",
      icon: <Pin className={cn("size-4", stop.pinned && "fill-current")} aria-hidden="true" />,
      onSelect: () => onTogglePin(stop.id),
      disabled: isPending,
    });
  }
  if (onDelete) {
    mobileOverflowItems.push({
      key: "delete",
      label: "Delete",
      icon: <Trash2 className="size-4" aria-hidden="true" />,
      onSelect: () => onDelete(stop.id),
      disabled: isPending,
      destructive: true,
    });
  }

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
      {/* Top row: drag handle + name + country + controls. ADR 0021: dated
          stops are draggable too, so the handle renders whenever it's provided. */}
      <div className="flex items-start justify-between gap-3">
        {dragHandle}
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="font-display text-xl font-semibold leading-tight text-foreground truncate">
            {stop.name}
          </h3>
          {stop.country && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{stop.country}</span>
              <MapLink
                lat={stop.lat}
                lng={stop.lng}
                label={stop.country ? `${stop.name}, ${stop.country}` : stop.name}
                className="text-muted-foreground/60"
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Inline "Start a chapter here" button */}
          {onStartChapter && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 hidden sm:inline-flex"
              disabled={isPending}
              onClick={() => onStartChapter(stop)}
              aria-label="Start a chapter here"
              title="Start a chapter here"
            >
              <BookOpen className="size-4" aria-hidden="true" />
            </Button>
          )}

          {/* Pin toggle — scheduled stops only */}
          {!isRough && onTogglePin && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 hidden sm:inline-flex",
                stop.pinned
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
              disabled={isPending}
              aria-pressed={stop.pinned}
              onClick={() => onTogglePin(stop.id)}
              aria-label={
                stop.pinned ? `Unpin ${stop.name}` : `Pin ${stop.name}`
              }
              title={stop.pinned ? "Unpin dates" : "Pin dates"}
            >
              <Pin
                className={cn("size-4", stop.pinned && "fill-current")}
                aria-hidden="true"
              />
            </Button>
          )}

          {/* Clear dates — primary action for scheduled stops (bug #8) */}
          {!isRough && onMakeRough && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hidden sm:inline-flex"
              disabled={isPending}
              onClick={() => onMakeRough(stop.id)}
              aria-label={`Clear dates for ${stop.name}`}
              title="Clear dates"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}

          {/* Edit */}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isPending}
            onClick={() => onEdit?.(stop)}
            aria-label={`Edit ${stop.name}`}
            title="Edit Stop"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>

          {/* Notes trigger */}
          {notes !== undefined && tripId && currentUserId && (
            <div className="hidden sm:block">
              <NoteThread
                tripId={tripId}
                targetType="STOP"
                targetId={stop.id}
                notes={notes}
                currentUserId={currentUserId}
              />
            </div>
          )}

          {/* Attachment popover */}
          {attachments !== undefined && tripId && (
            <div className="hidden sm:block">
              <AttachmentPopover
                tripId={tripId}
                targetType="STOP"
                targetId={stop.id}
                attachments={attachments}
              />
            </div>
          )}

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isPending}
            onClick={() => onDelete?.(stop.id)}
            aria-label={`Delete ${stop.name}`}
            title="Delete Stop"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>

          {/* Overflow menu — mobile: all secondary actions. */}
          <div className="sm:hidden">
            <MoreActionsMenu
              label={`More actions for ${stop.name}`}
              items={mobileOverflowItems}
            />
          </div>
          {!isRough && (onAdjustDates || onMakeRough) && (
            <div className="hidden sm:block">
              <MoreActionsMenu
                label={`More actions for ${stop.name}`}
                items={overflowItems.filter(
                  (i) => i.key === "adjust-dates" || i.key === "make-rough",
                )}
              />
            </div>
          )}
        </div>
      </div>

      {/* Rough draft badge OR scheduled dates + nights */}
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

      {/* Notes preview */}
      {stop.notes && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {stop.notes}
        </p>
      )}

      {/* Things to do (ADR 0022) — shown when tripId is provided */}
      {tripId && (
        <>
          {/* List of existing things to do */}
          {thingsToDo && thingsToDo.length > 0 && (
            <ul className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
              {thingsToDo.map((thing) => (
                <li key={thing.id} className="flex items-center gap-2">
                  {/* Category/stop hue dot */}
                  <span
                    data-testid="thing-dot"
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      categoryDotClass(thing.category),
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-sm text-foreground">{thing.title}</span>
                  {/* Right-aligned time when item is timed */}
                  {thing.startTime && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {thing.startTime}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground"
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

      {/* Notes sheet — opened from the mobile overflow menu (Notes is a
          Popover on desktop; on mobile it opens here as a bottom sheet). */}
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

      {/* Attachments sheet — mobile counterpart to the desktop AttachmentPopover. */}
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
