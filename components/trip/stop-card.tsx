import * as React from "react";
import { ChevronUp, ChevronDown, Pencil, Trash2, MapPin, Calendar, Clock, BookOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { formatDateRange, nightsBetween, tzAbbrev } from "@/lib/dates";
import { MapLink } from "./map-link";
import { NoteThread, type NoteView } from "./note-thread";
import { MoreActionsMenu } from "./card-actions";

export interface StopCardStop {
  id: string;
  name: string;
  country?: string | null;
  timezone: string;
  arriveDate: string;
  departDate: string;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  sortOrder: number;
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
  /** Pending state (e.g. while a server action is in flight) */
  isPending?: boolean;
  /** Notes attached to this stop */
  notes?: NoteView[];
  /** Trip ID (required for notes) */
  tripId?: string;
  /** Current user's ID (required for notes) */
  currentUserId?: string;
}

/**
 * Presentational card for a single stop.
 * Shows name, country, date range, nights count, notes preview,
 * and controls for editing, deleting, and reordering.
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
  isPending = false,
  notes,
  tripId,
  currentUserId,
}: StopCardProps) {
  const nights = nightsBetween(stop.arriveDate, stop.departDate);
  const dateRange = formatDateRange(stop.arriveDate, stop.departDate);
  const tz = tzAbbrev(stop.timezone, stop.arriveDate);

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft transition-shadow hover:shadow-soft-lg",
        isPending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Top row: name + country + controls */}
      <div className="flex items-start justify-between gap-3">
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
          {/* Reorder — inline on sm+, collapsed into the overflow menu on mobile */}
          <div className="hidden items-center gap-1 sm:flex">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={isFirst || isPending}
              onClick={() => onMoveUp?.(stop.id)}
              aria-label={`Move ${stop.name} up`}
              title="Move up"
            >
              <ChevronUp className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={isLast || isPending}
              onClick={() => onMoveDown?.(stop.id)}
              aria-label={`Move ${stop.name} down`}
              title="Move down"
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
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
          </div>

          {/* Edit */}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isPending}
            onClick={() => onEdit?.(stop)}
            aria-label={`Edit ${stop.name}`}
            title="Edit stop"
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

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isPending}
            onClick={() => onDelete?.(stop.id)}
            aria-label={`Delete ${stop.name}`}
            title="Delete stop"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>

          {/* Reorder overflow — mobile only */}
          <div className="sm:hidden">
            <MoreActionsMenu
              label={`More actions for ${stop.name}`}
              items={[
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
                {
                  key: "start-chapter",
                  label: "Start a chapter here",
                  icon: <BookOpen className="size-4" aria-hidden="true" />,
                  onSelect: () => onStartChapter?.(stop),
                  disabled: isPending,
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Dates + nights */}
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

      {/* Notes preview */}
      {stop.notes && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {stop.notes}
        </p>
      )}
    </div>
  );
}
