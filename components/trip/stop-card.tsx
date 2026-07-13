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
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { formatDateRange, nightsBetween, tzAbbrev } from "@/lib/dates";
import { MapLink } from "./map-link";
import { NoteThread, type NoteView } from "./note-thread";
import { AttachmentPopover } from "./attachment-popover";
import type { AttachmentView } from "./attachment-list";
import { MoreActionsMenu, type CardActionItem } from "./card-actions";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import type { ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";

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
  stops = [],
  forkId,
  homeCurrency,
  attachments,
}: StopCardProps) {
  const isRough = !stop.arriveDate || !stop.departDate;

  // Things-to-do dialog state (ADR 0022)
  const [addThingOpen, setAddThingOpen] = React.useState(false);
  const [editingThing, setEditingThing] = React.useState<ItemCardItem | null>(null);

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

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-soft-lg",
        isRough
          ? "border-l-4 border-dashed border-border/70 bg-card/60"
          : "border-border",
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
              className="size-8"
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
                "size-8",
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
              className="size-8 text-muted-foreground"
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
            <NoteThread
              tripId={tripId}
              targetType="STOP"
              targetId={stop.id}
              notes={notes}
              currentUserId={currentUserId}
            />
          )}

          {/* Attachment popover */}
          {attachments !== undefined && tripId && (
            <AttachmentPopover
              tripId={tripId}
              targetType="STOP"
              targetId={stop.id}
              attachments={attachments}
            />
          )}

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isPending}
            onClick={() => onDelete?.(stop.id)}
            aria-label={`Delete ${stop.name}`}
            title="Delete Stop"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>

          {/* Overflow menu — mobile reorder + scheduled-only secondary actions.
              On sm+ only the scheduled actions remain (reorder is inline), so
              hide the trigger entirely when nothing but reorder would show. */}
          <div className="sm:hidden">
            <MoreActionsMenu
              label={`More actions for ${stop.name}`}
              items={overflowItems}
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            {(() => {
              const n = stop.nights ?? 1;
              return `~${n} ${n === 1 ? "night" : "nights"}`;
            })()}
          </span>
        </div>
      ) : (
        <DatedMeta arriveDate={stop.arriveDate!} departDate={stop.departDate!} timezone={stop.timezone} />
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
            <ul className="flex flex-col gap-1 border-t border-border/40 pt-2">
              {thingsToDo.map((thing) => (
                <li key={thing.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-foreground">{thing.title}</span>
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

          {/* Add a thing to do button */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
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
            />
          )}
        </>
      )}
    </div>
  );
}

function DatedMeta({
  arriveDate,
  departDate,
  timezone,
}: {
  arriveDate: string;
  departDate: string;
  timezone: string | null;
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
      {nights > 0 && (
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {nights} {nights === 1 ? "night" : "nights"}
          </span>
        </div>
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
