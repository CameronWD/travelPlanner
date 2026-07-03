"use client";

import * as React from "react";
import { Check, Heart, MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemCard, type ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import { ScheduleItemDialog } from "./schedule-item-dialog";
import { AddItemButton } from "./item-form-dialog";
import { deleteItem, unscheduleItem, scheduleItem } from "@/server/actions/items";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { toast } from "@/components/ui/use-toast";
import type { NoteView } from "./note-thread";
import type { VoteView } from "./vote-control";
import { sortItemsByVotes } from "@/lib/votes";
import { AiActivitySuggestions } from "./ai-activity-suggestions";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { WishlistMapLoader } from "./wishlist-map-loader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WishlistStop {
  id: string;
  name: string;
  arriveDate: string | null; // null for rough (date-less) stops
  departDate: string | null; // null for rough (date-less) stops
}

export interface WishlistBoardProps {
  tripId: string;
  /** Trip start (YYYY-MM-DD); null/undefined for a date-less trip. */
  tripStartDate?: string | null;
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
  /** Whether the AI features are configured (key is set). */
  aiConfigured?: boolean;
  /** Active fork plan id — scheduling places the copy into this fork. Null/undefined = real plan. */
  activeForkId?: string | null;
  /** Idea ids that already have a scheduled copy in the active plan. */
  placedIdeaIds?: string[];
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
  aiConfigured = false,
  activeForkId,
  placedIdeaIds,
}: WishlistBoardProps) {
  const placedSet = React.useMemo(
    () => new Set(placedIdeaIds ?? []),
    [placedIdeaIds],
  );
  const { confirm, dialog } = useConfirm();
  const stopOptions: StopOption[] = stops.map((s) => ({ id: s.id, name: s.name }));

  // ── View toggle ──
  const [view, setView] = React.useState<"list" | "map">("list");

  // ── Stop filter (for map view chip row) ──
  const [mapStopFilter, setMapStopFilter] = React.useState<string>("all");

  // ── Dialog state ──
  const [editingItem, setEditingItem] = React.useState<ItemCardItem | null>(null);
  const [schedulingItem, setSchedulingItem] = React.useState<ItemCardItem | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // ── Handlers ──
  async function handleDelete(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    const confirmed = await confirm({
      title: `Delete "${item?.title ?? "this item"}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    setPendingId(itemId);
    try {
      await deleteItem(itemId);
    } finally {
      setPendingId(null);
    }
  }

  async function handleUnschedule(itemId: string) {
    const item = items.find((i) => i.id === itemId);

    // Capture the prior schedule BEFORE the mutation; after it succeeds
    // these fields will be cleared on the server.
    const priorDate = item?.date ?? null;
    const priorStartTime = item?.startTime ?? null;
    const priorEndTime = item?.endTime ?? null;

    setPendingId(itemId);
    try {
      const result = await unscheduleItem(itemId);
      if (result.success && priorDate) {
        toastWithUndo({
          title: "Moved to Wishlist",
          description: item?.title,
          onUndo: async () => {
            try {
              await scheduleItem(itemId, {
                date: priorDate,
                ...(priorStartTime ? { startTime: priorStartTime } : {}),
                ...(priorEndTime ? { endTime: priorEndTime } : {}),
              });
            } catch {
              toast({ title: "Couldn't undo", variant: "destructive" });
            }
          },
        });
      }
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

  // Stops that actually have items (still used for the no-key empty-state variant)
  const stopsWithItems = stops.filter((s) => (grouped.get(s.id)?.length ?? 0) > 0);
  const anywhereItems = grouped.get(null) ?? [];
  // When AI is configured, show all stops (even empty) so users can request suggestions per-stop
  const stopsToShow = aiConfigured ? stops : stopsWithItems;

  const isEmpty = items.length === 0;

  // ── Located items (have lat+lng) — used in map view ──
  const locatedItems = React.useMemo(
    () =>
      items
        .filter((i) => i.lat != null && i.lng != null)
        .map((i) => ({ id: i.id, title: i.title, category: i.category, lat: i.lat!, lng: i.lng! })),
    [items],
  );

  // Located items filtered by the stop chip selection
  const mapItems = React.useMemo(() => {
    if (mapStopFilter === "all") return locatedItems;
    return locatedItems.filter((i) => {
      const found = items.find((item) => item.id === i.id);
      return found?.stopId === mapStopFilter;
    });
  }, [locatedItems, mapStopFilter, items]);

  const unlocatedCount = items.length - locatedItems.length;

  // ── onSelect handler for the map: opens ScheduleItemDialog ──
  function handleMapSelect(id: string) {
    const item = items.find((i) => i.id === id) ?? null;
    setSchedulingItem(item);
  }

  // First stop date (for defaulting schedule dialog)
  // Prefer the first stop's arrival; fall back to the trip start. Either may be
  // null/undefined for rough stops / a date-less trip, in which case the
  // scheduling dialog opens with an empty date.
  const defaultScheduleDate = stops[0]?.arriveDate ?? tripStartDate ?? undefined;
  const tripStartDateValue = tripStartDate ?? undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold">Wishlist</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Items you&apos;re not sure about yet — collect them here and schedule later.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Segmented
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as "list" | "map")}
            aria-label="Wishlist view"
          >
            <SegmentedItem value="list">List</SegmentedItem>
            <SegmentedItem value="map">Map</SegmentedItem>
          </Segmented>
          <AddItemButton
            tripId={tripId}
            stops={stopOptions}
            tripStartDate={tripStartDateValue}
            defaultUnscheduled={true}
            homeCurrency={homeCurrency}
          />
        </div>
      </div>

      {/* Empty state — only in list view */}
      {view === "list" && isEmpty && (
        <EmptyState
          icon={Heart}
          title="No Items yet"
          description="Collect activities, sights, and restaurants you'd love to do — schedule them to a Stop when you're ready."
        />
      )}

      {/* ── Map view ── */}
      {view === "map" && (
        <div className="flex flex-col gap-4">
          {/* Stop-filter chip row — "All" is always first */}
          {stops.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMapStopFilter("all")}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  mapStopFilter === "all"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {stops.map((stop) => (
                <button
                  key={stop.id}
                  type="button"
                  onClick={() => setMapStopFilter(stop.id)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    mapStopFilter === stop.id
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {stop.name}
                </button>
              ))}
            </div>
          )}

          {/* The map itself */}
          <WishlistMapLoader items={mapItems} onSelect={handleMapSelect} />

          {/* Unlocated count — collapsed one-liner */}
          {unlocatedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {unlocatedCount} not on the map — add a location
            </p>
          )}
        </div>
      )}

      {/* ── List view — Items grouped by stop ── */}
      {view === "list" && (!isEmpty || aiConfigured) && stops.length > 0 && (
        <div className="flex flex-col gap-6">
          {/* Stop-grouped sections */}
          {stopsToShow.map((stop) => {
            const stopItems = grouped.get(stop.id) ?? [];
            return (
              <section key={stop.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {stop.name}
                  </h3>
                  {stopItems.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({stopItems.length})
                    </span>
                  )}
                </div>
                <AiActivitySuggestions
                  tripId={tripId}
                  stopId={stop.id}
                  stopName={stop.name}
                  aiConfigured={aiConfigured}
                />
                {stopItems.length > 0 && (
                  <AnimatedList className="flex flex-col gap-2">
                    {stopItems.map((item) => (
                      <AnimatedItem key={item.id}>
                        <div className="flex flex-col gap-1">
                          <ItemCard
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
                          {placedSet.has(item.id) && (
                            <span
                              data-testid={`placed-marker-${item.id}`}
                              className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            >
                              <Check className="size-3" aria-hidden="true" />
                              in this plan
                            </span>
                          )}
                        </div>
                      </AnimatedItem>
                    ))}
                  </AnimatedList>
                )}
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
              <AnimatedList className="flex flex-col gap-2">
                {anywhereItems.map((item) => (
                  <AnimatedItem key={item.id}>
                    <div className="flex flex-col gap-1">
                      <ItemCard
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
                      {placedSet.has(item.id) && (
                        <span
                          data-testid={`placed-marker-${item.id}`}
                          className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          <Check className="size-3" aria-hidden="true" />
                          in this plan
                        </span>
                      )}
                    </div>
                  </AnimatedItem>
                ))}
              </AnimatedList>
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
          tripStartDate={tripStartDateValue}
          item={editingItem}
          open={Boolean(editingItem)}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
          homeCurrency={homeCurrency}
          costs={costsByItemId?.get(editingItem.id)}
        />
      )}

      {/* Schedule item */}
      {schedulingItem && (
        <ScheduleItemDialog
          itemId={schedulingItem.id}
          itemTitle={schedulingItem.title}
          defaultDate={defaultScheduleDate}
          forkId={activeForkId}
          open={Boolean(schedulingItem)}
          onOpenChange={(open) => {
            if (!open) setSchedulingItem(null);
          }}
          onSaved={() => setSchedulingItem(null)}
        />
      )}

      {dialog}
    </div>
  );
}
