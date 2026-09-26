"use client";

import * as React from "react";
import {
  Pencil,
  Trash2,
  ExternalLink,
  Hash,
  StickyNote,
  Clock,
  Check,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { safeWebHref } from "@/lib/url";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "./category-pill";
import type { Category } from "@/lib/categories";
import { CostEditor } from "./cost-editor";
import { MapLink } from "./map-link";
import type { CostRow } from "@/server/actions/costs";
import type { NoteView } from "./note-thread";
import { VoteControl, type VoteView } from "./vote-control";
import type { AttachmentView } from "./attachment-list";
import { CardActionCluster } from "./card-action-cluster";

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
  /** CONTEXT.md "Share link" — never leaves via a share link (ADR 0051 floor); still fully visible to every Traveller. */
  hiddenFromShares?: boolean;
}

export interface ItemCardProps {
  item: ItemCardItem;
  /** "wishlist" = show Schedule action; "scheduled" = show time (Unschedule lives on the day-view row, not here) */
  mode: "wishlist" | "scheduled";
  isPending?: boolean;
  onEdit?: (item: ItemCardItem) => void;
  onDelete?: (itemId: string) => void;
  onSchedule?: (item: ItemCardItem) => void;
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
  /** Attachments for this item */
  attachments?: AttachmentView[];
  /** The Plan this item's costs belong to — `null`/absent is the real plan */
  forkId?: string | null;
  /**
   * Kit card fill (DWishlist.jsx alternates white/sun). Decorative only —
   * identity is the CategoryPill's hue, state is `placed`.
   */
  tone?: "white" | "sun";
  /**
   * Wishlist idea already has a scheduled copy in the active plan. Renders the
   * kit's "in plan ✓" card: a --success fill (status token) plus a status chip.
   * Wins over `tone`.
   */
  placed?: boolean;
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
  costs,
  tripId,
  homeCurrency,
  notes,
  votes,
  currentUserId,
  attachments,
  forkId,
  tone = "white",
  placed = false,
}: ItemCardProps) {
  const hasTime = Boolean(item.startTime);
  const timeLabel = hasTime
    ? item.endTime
      ? `${item.startTime} – ${item.endTime}`
      : item.startTime!
    : null;

  const wishlist = mode === "wishlist";

  return (
    <Card
      data-testid={`item-card-${item.id}`}
      tone={placed || !wishlist ? "white" : tone}
      className={cn(
        "group flex min-w-0 flex-col gap-2.5 p-3.5 sm:p-[18px]",
        wishlist && "h-full sm:min-h-[170px]",
        // Status, not identity: the kit's teal "in plan" card, on --success.
        placed && "island bg-success",
        // On a fill, the red delete glyph drops under 4.5:1 (dark sun) — the
        // kit keeps every glyph on an island in on-accent ink.
        wishlist && (placed || tone !== "white") && "[&_.text-destructive]:text-foreground",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      {/* Top row (wishlist): category chip left, actions right — the kit's
          avatar/heart row. Scheduled mode keeps title + actions. */}
      <div className="flex items-start justify-between gap-3">
        {wishlist ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-1.5">
            <CategoryPill category={item.category as Category} size="sm" />
            {placed && (
              <span
                data-testid={`placed-marker-${item.id}`}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-card px-2 py-0.5 text-[10px] font-extrabold leading-tight text-foreground"
              >
                <Check className="size-3 shrink-0" strokeWidth={3} aria-hidden="true" />
                in this plan
              </span>
            )}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <h4 className="truncate font-display text-[15px] font-extrabold leading-tight text-foreground">
              {item.title}
            </h4>
            {item.stopName && (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <span className="truncate">{item.stopName}</span>
              </p>
            )}
          </div>
        )}

        {/* Action buttons (top-right cluster) */}
        <div className="flex shrink-0 items-center gap-1">
          {mode === "wishlist" ? (
            <>
              <CardActionCluster
                tripId={tripId}
                targetType="ITEM"
                targetId={item.id}
                editLabel={`Edit ${item.title}`}
                deleteLabel={`Delete ${item.title}`}
                moreLabel={`More actions for ${item.title}`}
                onEdit={onEdit ? () => onEdit(item) : undefined}
                onDelete={onDelete ? () => onDelete(item.id) : undefined}
                isPending={isPending}
                notes={notes}
                currentUserId={currentUserId}
                attachments={attachments}
              />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Title + where (wishlist) — the kit's H3 and muted place line */}
      {wishlist && (
        <div className="min-w-0">
          <h4 className="break-words font-display text-[17px] font-extrabold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[22px]">
            {item.title}
          </h4>
          {/* No decorative pin beside the stop name: the address row below (if
              any) carries MapLink, the real one, and help-legend.tsx teaches
              that glyph as "has a location" (HG-02/HG-10). */}
          {item.stopName && (
            <p className="mt-1 truncate text-[13px] font-semibold text-muted-foreground">
              {item.stopName}
            </p>
          )}
        </div>
      )}

      {/* Category pill + time row (scheduled mode only) */}
      {mode === "scheduled" && (
        <div className="flex flex-wrap items-center gap-2">
          <CategoryPill category={item.category as Category} size="sm" />

          {timeLabel && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3 shrink-0" aria-hidden="true" />
              {timeLabel}
            </span>
          )}
        </div>
      )}

      {/* Address / link / booking affordances */}
      {(item.address || item.link || item.booking) && (
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-muted-foreground">
          {item.address && (
            <span className="flex items-center gap-1">
              <span className="truncate max-w-[18ch]">{item.address}</span>
              <MapLink lat={item.lat} lng={item.lng} address={item.address} label={item.title} className="text-muted-foreground" />
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
        <div className="flex items-start gap-1.5 text-xs font-medium text-muted-foreground">
          <StickyNote
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <p className="line-clamp-2">{item.notes}</p>
        </div>
      )}

      {/* Vote control (wishlist mode only) — inline, no border-t */}
      {mode === "wishlist" && votes !== undefined && tripId && currentUserId && (
        <VoteControl
          tripId={tripId}
          itemId={item.id}
          votes={votes}
          currentUserId={currentUserId}
        />
      )}

      {/* Costs */}
      {costs !== undefined && tripId && (
        <div className="border-t-2 border-border-soft pt-2">
          <CostEditor
            tripId={tripId}
            ownerType="ITEM"
            ownerId={item.id}
            costs={costs}
            homeCurrency={homeCurrency}
            defaultCurrency={homeCurrency}
            forkId={forkId}
          />
        </div>
      )}

      {/* Schedule — the kit's secondary "Add to a stop" pill, pushed to the
          card foot. Copy stays ours: the dialog schedules to a date. */}
      {mode === "wishlist" && onSchedule && (
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => onSchedule(item)}
          aria-label={`Schedule ${item.title}`}
          className="mt-auto self-start"
        >
          Schedule this
        </Button>
      )}
    </Card>
  );
}
