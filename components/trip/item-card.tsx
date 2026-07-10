"use client";

import * as React from "react";
import {
  Pencil,
  Trash2,
  MapPin,
  ExternalLink,
  Hash,
  StickyNote,
  Clock,
  CalendarX,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { safeWebHref } from "@/lib/url";
import { Button } from "@/components/ui/button";
import { CategoryPill } from "./category-pill";
import type { Category } from "@/lib/categories";
import { CostEditor } from "./cost-editor";
import { MapLink } from "./map-link";
import type { CostRow } from "@/server/actions/costs";
import { NoteThread, type NoteView } from "./note-thread";
import { VoteControl, type VoteView } from "./vote-control";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ItemCardItem {
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
  stopName?: string | null; // resolved from stop relation
  lat?: number | null;
  lng?: number | null;
}

export interface ItemCardProps {
  item: ItemCardItem;
  /** "wishlist" = show Schedule action; "scheduled" = show time + Unschedule action */
  mode: "wishlist" | "scheduled";
  isPending?: boolean;
  onEdit?: (item: ItemCardItem) => void;
  onDelete?: (itemId: string) => void;
  onSchedule?: (item: ItemCardItem) => void;
  onUnschedule?: (itemId: string) => void;
  /** Costs attached to this item */
  costs?: CostRow[];
  /** Trip ID (required when costs are provided) */
  tripId?: string;
  /** Trip's home currency */
  homeCurrency?: string;
  /** Notes on this item — only shown in wishlist mode */
  notes?: NoteView[];
  /** Votes on this item — only shown in wishlist mode */
  votes?: VoteView[];
  /** Current user's ID — required for notes & votes */
  currentUserId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItemCard({
  item,
  mode,
  isPending = false,
  onEdit,
  onDelete,
  onSchedule,
  onUnschedule,
  costs,
  tripId,
  homeCurrency,
  notes,
  votes,
  currentUserId,
}: ItemCardProps) {
  const hasTime = Boolean(item.startTime);
  const timeLabel = hasTime
    ? item.endTime
      ? `${item.startTime} – ${item.endTime}`
      : item.startTime!
    : null;

  return (
    <div
      className={cn(
        "group flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-soft transition-shadow hover:shadow-soft-lg",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      {/* Top row: title + controls */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-display text-base font-semibold leading-tight text-foreground">
            {item.title}
          </h4>

          {/* Stop name (when linked) */}
          {item.stopName && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.stopName}</span>
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Wishlist mode → Schedule button */}
          {mode === "wishlist" && onSchedule && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              disabled={isPending}
              onClick={() => onSchedule(item)}
              aria-label={`Schedule ${item.title}`}
              title="Schedule this item"
            >
              <CalendarCheck className="size-3.5" aria-hidden="true" />
              Schedule
            </Button>
          )}

          {/* Scheduled mode → Unschedule button */}
          {mode === "scheduled" && onUnschedule && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              disabled={isPending}
              onClick={() => onUnschedule(item.id)}
              title="Move back to wishlist"
            >
              <CalendarX className="size-3.5" aria-hidden="true" />
              Unschedule
            </Button>
          )}

          {/* Edit */}
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={isPending}
              onClick={() => onEdit(item)}
              aria-label={`Edit ${item.title}`}
              title="Edit"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          )}

          {/* Notes trigger (wishlist mode) */}
          {mode === "wishlist" && notes !== undefined && tripId && currentUserId && (
            <NoteThread
              tripId={tripId}
              targetType="ITEM"
              targetId={item.id}
              notes={notes}
              currentUserId={currentUserId}
            />
          )}

          {/* Delete */}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isPending}
              onClick={() => onDelete(item.id)}
              aria-label={`Delete ${item.title}`}
              title="Delete"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {/* Second row: category pill + time (if scheduled) */}
      <div className="flex flex-wrap items-center gap-2">
        <CategoryPill category={item.category as Category} size="sm" />

        {mode === "scheduled" && timeLabel && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" aria-hidden="true" />
            {timeLabel}
          </span>
        )}
      </div>

      {/* Address / link / booking affordances */}
      {(item.address || item.link || item.booking) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {item.address && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[18ch]">{item.address}</span>
              <MapLink lat={item.lat} lng={item.lng} address={item.address} label={item.title} className="text-muted-foreground/60" />
            </span>
          )}
          {safeWebHref(item.link) && (
            <a
              href={safeWebHref(item.link)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
              Link
            </a>
          )}
          {item.booking && (
            <span className="flex items-center gap-1 font-mono">
              <Hash className="size-3 shrink-0" aria-hidden="true" />
              {item.booking}
            </span>
          )}
        </div>
      )}

      {/* Notes snippet */}
      {item.notes && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <StickyNote
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <p className="line-clamp-2">{item.notes}</p>
        </div>
      )}

      {/* Vote control (wishlist mode only) */}
      {mode === "wishlist" && votes !== undefined && tripId && currentUserId && (
        <div className="border-t border-border/40 pt-2">
          <VoteControl
            tripId={tripId}
            itemId={item.id}
            votes={votes}
            currentUserId={currentUserId}
          />
        </div>
      )}

      {/* Costs */}
      {costs !== undefined && tripId && (
        <div className="border-t border-border/40 pt-2">
          <CostEditor
            tripId={tripId}
            ownerType="ITEM"
            ownerId={item.id}
            costs={costs}
            homeCurrency={homeCurrency}
            defaultCurrency={homeCurrency}
          />
        </div>
      )}
    </div>
  );
}
