"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemCard, type ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import { ScheduleItemDialog } from "./schedule-item-dialog";
import { AddItemButton } from "./item-form-dialog";
import { deleteItem, placeIdeaAtStop } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { scheduleDayOptions, type DayOptionStop } from "@/lib/schedule-day-options";
import type { NoteView } from "./note-thread";
import type { VoteView } from "./vote-control";
import { sortItemsByVotes } from "@/lib/votes";
import { AiActivitySuggestions } from "./ai-activity-suggestions";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { WishlistMapLoader } from "./wishlist-map-loader";
import type { MarkerView } from "@/components/globe/types";
import { AddFromGlobeDialog } from "./add-from-globe-dialog";
import { GlobeSuggestionsStrip } from "./globe-suggestions-strip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WishlistStop {
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
  /**
   * The CURRENT Plan's Stops (a Fork's own while one is active) with
   * coordinates and dates — the Schedule dialog offers their days (spec
   * 2026-10-05 §E). Absent = the plain date field.
   */
  planStops?: DayOptionStop[];
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
  /**
   * Plan variants (Forks) on for this trip (spec B3). The "in this plan"
   * marker is a Fork affordance, so it is hidden when off (the default).
   */
  forksEnabled?: boolean;
  /** Whether the viewing user belongs to a Globe (controls the "Add from Globe" affordance). */
  hasGlobe?: boolean;
  /** All Markers on the viewer's Globe (for the browser dialog). */
  globeMarkers?: MarkerView[];
  /** Marker ids already pulled into this trip's wishlist. */
  addedMarkerIds?: string[];
  /** Country-matched, proximity-ranked, added-excluded suggestions (WS-B). */
  suggestedMarkers?: MarkerView[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WishlistBoard({
  tripId,
  tripStartDate,
  stops,
  planStops,
  items,
  costsByItemId,
  homeCurrency,
  notesByItemId,
  votesByItemId,
  currentUserId,
  aiConfigured = false,
  activeForkId,
  placedIdeaIds,
  forksEnabled = false,
  hasGlobe = false,
  globeMarkers = [],
  addedMarkerIds = [],
  suggestedMarkers = [],
}: WishlistBoardProps) {
  const placedSet = React.useMemo(
    () => new Set(forksEnabled ? (placedIdeaIds ?? []) : []),
    [forksEnabled, placedIdeaIds],
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
  const [globeDialogOpen, setGlobeDialogOpen] = React.useState(false);
  const [globeDialogFilterIds, setGlobeDialogFilterIds] = React.useState<string[] | null>(null);

  function openGlobeSuggestionsOverflow() {
    setGlobeDialogFilterIds(suggestedMarkers.map((m) => m.id));
    setGlobeDialogOpen(true);
  }

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
      const r = await deleteItem(itemId);
      if (!r.success) toastRefused(r.errors, "Couldn't delete that idea.");
    } catch {
      toastRejected("Couldn't delete that idea.");
    } finally {
      setPendingId(null);
    }
  }

  // Spec 2026-10-05 §E: the days near this idea, on the current Plan.
  const dayOptions = React.useMemo(
    () => (schedulingItem && planStops ? scheduleDayOptions(schedulingItem, planStops) : undefined),
    [schedulingItem, planStops],
  );

  // The nearest Stop is rough: copy the idea into its things to do via
  // placeIdeaAtStop (Task 15), on the active Plan. placeIdeaAtStop — not
  // createItem — carries the idea's source link, photo and share-hidden
  // flag across intact and doesn't re-geocode its coordinates (controller
  // ruling R1, Task 16 brief). The idea itself stays in the Wishlist.
  async function addIdeaToThingsToDo(idea: ItemCardItem, stopId: string) {
    const result = await placeIdeaAtStop(idea.id, stopId, activeForkId ?? undefined);
    if (result.success) {
      const stopName = planStops?.find((s) => s.id === stopId)?.name ?? "the stop";
      toast({ title: `Added to ${stopName}'s things to do` });
    }
    return result;
  }

  // ── Group items by stopId, sorted by combined vote score ──
  const grouped = React.useMemo(() => {
    const byStop = new Map<string | null, ItemCardItem[]>();
    byStop.set(null, []); // Items "Not tied to a Stop yet" — rendered after the Stop groups

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

  // Schedule-dialog date default: the trip's first Stop, else the trip
  // start. A Wishlist idea is never attached to a Stop (ADR 0022), so the
  // first Stop is the natural default; either may be null/undefined for
  // rough stops / a date-less trip, in which case the scheduling dialog
  // opens with an empty date.
  const tripStartDateValue = tripStartDate ?? undefined;

  // Kit copy (states.jsx EMPTY.Wishlist / DWishlist "+ Add an idea").
  const ADD_LABEL = "Add an idea";
  const addProps = {
    tripId,
    stops: stopOptions,
    tripStartDate: tripStartDateValue,
    defaultUnscheduled: true,
    homeCurrency,
    label: ADD_LABEL,
  };

  // Map filter chips are the kit's 28px pills; on touch the hit area grows to 44px.
  const chipTouch = "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']";

  function renderIdeaGrid(groupItems: ItemCardItem[], withAddTile: boolean) {
    return (
      <AnimatedList
        as="ul"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-[18px] xl:grid-cols-3"
      >
        {groupItems.map((item, i) => (
          <AnimatedItem key={item.id} as="li" className="min-w-0">
            <ItemCard
              item={item}
              mode="wishlist"
              // Kit rhythm (DWishlist.jsx): every second card of three is sun.
              tone={i % 3 === 1 ? "sun" : "white"}
              placed={placedSet.has(item.id)}
              isPending={pendingId === item.id}
              onEdit={setEditingItem}
              onDelete={handleDelete}
              onSchedule={setSchedulingItem}
              costs={costsByItemId?.get(item.id)}
              tripId={tripId}
              homeCurrency={homeCurrency}
              notes={notesByItemId?.get(item.id) ?? []}
              votes={votesByItemId?.get(item.id) ?? []}
              currentUserId={currentUserId}
              forkId={activeForkId ?? null}
            />
          </AnimatedItem>
        ))}
        {withAddTile && (
          // Desktop: the kit's dashed "+ Add an idea" tile closes the grid.
          <AnimatedItem key="add-an-idea" as="li" className="hidden min-w-0 sm:block">
            <AddItemButton
              {...addProps}
              variant="dashed"
              size="md"
              className="size-full min-h-[170px] rounded-lg text-[15px]"
            />
          </AnimatedItem>
        )}
      </AnimatedList>
    );
  }

  function renderGroupHeader(title: string, count: number) {
    return (
      <div className="flex items-center gap-2 px-1">
        <h3 className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">{title}</h3>
        <Badge variant="outline">{count} {count === 1 ? "idea" : "ideas"}</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar — the title, badge and add actions now live in the page's
          PageHeader (WishlistHeaderActions, Task 22); this board keeps only
          the List/Map view switch, right-aligned. */}
      <div className="flex justify-end">
        <Segmented
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as "list" | "map")}
          aria-label="Wishlist view"
        >
          <SegmentedItem value="list">List</SegmentedItem>
          <SegmentedItem value="map">Map</SegmentedItem>
        </Segmented>
      </div>

      {hasGlobe && (
        <GlobeSuggestionsStrip
          tripId={tripId}
          suggestions={suggestedMarkers}
          addedMarkerIds={addedMarkerIds}
          onSeeMore={openGlobeSuggestionsOverflow}
        />
      )}

      {/* Empty state — only in list view (kit states.jsx EMPTY.Wishlist) */}
      {view === "list" && isEmpty && (
        <EmptyState
          icon={Heart}
          tone="lilac"
          title="No ideas yet"
          description="Drop in anything you might want to do. Your people can vote."
          action={<AddItemButton {...addProps} variant="primary" size="md" />}
        />
      )}

      {/* ── Map view ── */}
      {view === "map" && (
        <div className="flex flex-col gap-4">
          {/* Stop-filter chip row — "All" is always first (kit filter chips) */}
          {stops.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter the map by stop">
              <Chip
                tone={mapStopFilter === "all" ? "coral" : "white"}
                selected={mapStopFilter === "all"}
                onClick={() => setMapStopFilter("all")}
                className={chipTouch}
              >
                All
              </Chip>
              {stops.map((stop) => (
                <Chip
                  key={stop.id}
                  tone={mapStopFilter === stop.id ? "coral" : "white"}
                  selected={mapStopFilter === stop.id}
                  onClick={() => setMapStopFilter(stop.id)}
                  className={chipTouch}
                >
                  {stop.name}
                </Chip>
              ))}
            </div>
          )}

          {/* The map itself */}
          <WishlistMapLoader items={mapItems} onSelect={handleMapSelect} />

          {/* Unlocated count — collapsed one-liner */}
          {unlocatedCount > 0 && (
            <p className="text-[13px] font-semibold text-muted-foreground">
              {unlocatedCount} not on the map. Add a location.
            </p>
          )}
        </div>
      )}

      {/* ── List view — Items grouped by stop ── */}
      {view === "list" && (!isEmpty || aiConfigured) && (stops.length > 0 || anywhereItems.length > 0) && (
        <div className="flex flex-col gap-6">
          {/* Stop-grouped sections */}
          {stopsToShow.map((stop) => {
            const stopItems = grouped.get(stop.id) ?? [];
            return (
              <section key={stop.id} className="flex flex-col gap-3">
                {renderGroupHeader(stop.name, stopItems.length)}
                <AiActivitySuggestions
                  tripId={tripId}
                  stopId={stop.id}
                  stopName={stop.name}
                  aiConfigured={aiConfigured}
                />
                {stopItems.length > 0 && renderIdeaGrid(stopItems, false)}
              </section>
            );
          })}

          {/* Not tied to a Stop yet / no stop group */}
          {anywhereItems.length > 0 && (
            <section className="flex flex-col gap-3">
              {renderGroupHeader("Not tied to a stop yet", anywhereItems.length)}
              {renderIdeaGrid(anywhereItems, true)}
            </section>
          )}
        </div>
      )}

      {/* Mobile: the kit's block "+ Add an idea" under the grid. Outside the
          stops guard so a phone always has an add in list view (it replaces
          the header add, which is max-sm:hidden there). */}
      {view === "list" && !isEmpty && (
        <AddItemButton {...addProps} variant="secondary" size="md" className="w-full sm:hidden" />
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
          defaultDate={stops[0]?.arriveDate ?? tripStartDate ?? undefined}
          forkId={activeForkId}
          dayOptions={dayOptions}
          onAddToThingsToDo={(stopId) => addIdeaToThingsToDo(schedulingItem, stopId)}
          open={Boolean(schedulingItem)}
          onOpenChange={(open) => {
            if (!open) setSchedulingItem(null);
          }}
          onSaved={() => setSchedulingItem(null)}
        />
      )}

      {hasGlobe && (
        <AddFromGlobeDialog
          tripId={tripId}
          markers={globeMarkers}
          addedMarkerIds={addedMarkerIds}
          filterToIds={globeDialogFilterIds ?? undefined}
          open={globeDialogOpen}
          onOpenChange={setGlobeDialogOpen}
        />
      )}

      {dialog}
    </div>
  );
}
