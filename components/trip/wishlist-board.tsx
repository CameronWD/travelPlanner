"use client";

import * as React from "react";
import { Heart, MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemCard, type ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import { ScheduleItemDialog } from "./schedule-item-dialog";
import { AddItemButton } from "./item-form-dialog";
import { deleteItem, unscheduleItem } from "@/server/actions/items";
import type { NoteView } from "./note-thread";
import type { VoteView } from "./vote-control";
import { sortItemsByVotes } from "@/lib/votes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WishlistStop {
  id: string;
  name: string;
  arriveDate: string;
  departDate: string;
}

export interface WishlistBoardProps {
  tripId: string;
  tripStartDate: string;
  stops: WishlistStop[];
  items: ItemCardItem[];
  /** Map of itemId → costs for that item */
  costsByItemId?: Map<string, CostRow[]>;
  homeCurrency?: string;
  /** Map of itemId → notes for that item */
  notesByItemId?: Map<string, NoteView[]>;
  /** Map of itemId → votes for that item */
  votesByItemId?: Map<string, VoteView[]>;
  /** Current authenticated user's ID */
  currentUserId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WishlistBoard({
  tripId,
  tripStartDate,
  stops,
  items,
  costsByItemId,
  homeCurrency,
  notesByItemId,
  votesByItemId,
  currentUserId,
}: WishlistBoardProps) {
  const stopOptions: StopOption[] = stops.map((s) => ({ id: s.id, name: s.name }));

  // ── Dialog state ──
  const [editingItem, setEditingItem] = React.useState<ItemCardItem | null>(null);
  const [schedulingItem, setSchedulingItem] = React.useState<ItemCardItem | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // ── Handlers ──
  async function handleDelete(itemId: string) {
    if (!confirm("Delete this idea? This cannot be undone.")) return;
    setPendingId(itemId);
    try {
      await deleteItem(itemId);
    } finally {
      setPendingId(null);
    }
  }

  async function handleUnschedule(itemId: string) {
    setPendingId(itemId);
    try {
      await unscheduleItem(itemId);
    } finally {
      setPendingId(null);
    }
  }

  // ── Group items by stopId, sorted by combined vote score ──
  const grouped = React.useMemo(() => {
    const byStop = new Map<string | null, ItemCardItem[]>();
    byStop.set(null, []); // "Anywhere" group always first

    for (const item of items) {
      const key = item.stopId ?? null;
      const arr = byStop.get(key) ?? [];
      arr.push(item);
      byStop.set(key, arr);
    }

    // Sort each group by combined vote score (desc), tie-break by title
    if (votesByItemId) {
      for (const [key, groupItems] of byStop.entries()) {
        const enriched = groupItems.map((item) => ({
          ...item,
          votes: (votesByItemId.get(item.id) ?? []).map((v) => ({ level: v.level })),
        }));
        const sorted = sortItemsByVotes(enriched);
        byStop.set(key, sorted);
      }
    }

    return byStop;
  }, [items, votesByItemId]);

  // Stops that actually have items
  const stopsWithItems = stops.filter((s) => (grouped.get(s.id)?.length ?? 0) > 0);
  const anywhereItems = grouped.get(null) ?? [];

  const isEmpty = items.length === 0;

  // First stop date (for defaulting schedule dialog)
  const defaultScheduleDate = stops[0]?.arriveDate ?? tripStartDate;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Wishlist</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ideas you&apos;re not sure about yet — collect them here and schedule later.
          </p>
        </div>
        <AddItemButton
          tripId={tripId}
          stops={stopOptions}
          tripStartDate={tripStartDate}
          defaultUnscheduled={true}
        />
      </div>

      {/* Empty state */}
      {isEmpty && (
        <EmptyState
          icon={Heart}
          title="No ideas yet"
          description="Collect activities, restaurants, and sights you'd love to do — schedule them when you're ready."
        />
      )}

      {/* Items grouped by stop */}
      {!isEmpty && (
        <div className="flex flex-col gap-6">
          {/* Stop-grouped sections */}
          {stopsWithItems.map((stop) => {
            const stopItems = grouped.get(stop.id) ?? [];
            if (stopItems.length === 0) return null;
            return (
              <section key={stop.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {stop.name}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    ({stopItems.length})
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {stopItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      mode="wishlist"
                      isPending={pendingId === item.id}
                      onEdit={setEditingItem}
                      onDelete={handleDelete}
                      onSchedule={setSchedulingItem}
                      onUnschedule={handleUnschedule}
                      costs={costsByItemId?.get(item.id)}
                      tripId={tripId}
                      homeCurrency={homeCurrency}
                      notes={notesByItemId?.get(item.id) ?? []}
                      votes={votesByItemId?.get(item.id) ?? []}
                      currentUserId={currentUserId}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Anywhere / no stop group */}
          {anywhereItems.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Heart className="size-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="font-display text-base font-semibold text-foreground">
                  Anywhere
                </h3>
                <span className="text-xs text-muted-foreground">
                  ({anywhereItems.length})
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {anywhereItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    mode="wishlist"
                    isPending={pendingId === item.id}
                    onEdit={setEditingItem}
                    onDelete={handleDelete}
                    onSchedule={setSchedulingItem}
                    onUnschedule={handleUnschedule}
                    costs={costsByItemId?.get(item.id)}
                    tripId={tripId}
                    homeCurrency={homeCurrency}
                    notes={notesByItemId?.get(item.id) ?? []}
                    votes={votesByItemId?.get(item.id) ?? []}
                    currentUserId={currentUserId}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ─── Dialogs ─── */}

      {/* Edit item */}
      {editingItem && (
        <ItemFormDialog
          tripId={tripId}
          stops={stopOptions}
          tripStartDate={tripStartDate}
          item={editingItem}
          open={Boolean(editingItem)}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
        />
      )}

      {/* Schedule item */}
      {schedulingItem && (
        <ScheduleItemDialog
          itemId={schedulingItem.id}
          itemTitle={schedulingItem.title}
          defaultDate={defaultScheduleDate}
          open={Boolean(schedulingItem)}
          onOpenChange={(open) => {
            if (!open) setSchedulingItem(null);
          }}
          onSaved={() => setSchedulingItem(null)}
        />
      )}
    </div>
  );
}
