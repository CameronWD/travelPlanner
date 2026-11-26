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
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useDeletePaid, paidCostsForDelete } from "@/components/money/delete-paid-dialog";
import type { DeleteRefundAnswer } from "@/lib/money/delete-refund";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Chip } from "@/components/ui/chip";
import { WishlistMapLoader } from "./wishlist-map-loader";
import type { MarkerView } from "@/components/globe/types";
import { AddFromGlobeDialog } from "./add-from-globe-dialog";
import { GlobeSuggestionsStrip } from "./globe-suggestions-strip";
import { WishlistAddMenu } from "./wishlist-add-menu";
import { wishlistNear, ALL } from "@/lib/wishlist-near";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WishlistStop {
  id: string;
  name: string;
  arriveDate: string | null; // null for rough (date-less) stops
  departDate: string | null; // null for rough (date-less) stops
  lat?: number | null;
  lng?: number | null;
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
  const { ask: askDeletePaid, dialog: deletePaidDialog } = useDeletePaid();
  const stopOptions: StopOption[] = stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));

  // ── View toggle ──
  const [view, setView] = React.useState<"list" | "map">("list");

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
    const title = `Delete “${item?.title ?? "this item"}”?`;
    const paid = paidCostsForDelete(costsByItemId?.get(itemId));
    let refunds: DeleteRefundAnswer[] | undefined;
    if (paid.length > 0) {
      const answer = await askDeletePaid({ title, costs: paid });
      if (!answer.confirmed) return;
      refunds = answer.refunds;
    } else {
      const confirmed = await confirm({
        title,
        description: "This can’t be undone.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!confirmed) return;
    }
    setPendingId(itemId);
    try {
      const r = refunds ? await deleteItem(itemId, refunds) : await deleteItem(itemId);
      if (!r.success) toastRefused(r.errors, "Couldn’t delete that idea.");
    } catch {
      toastRejected("Couldn’t delete that idea.");
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

  const near = React.useMemo(() => wishlistNear(items, stops), [items, stops]);
  const [chosenChip, setChosenChip] = React.useState<string>(ALL);
  const chip = near.chips.some((c) => c.key === chosenChip) ? chosenChip : ALL;

  const sortedIdeas = React.useMemo(
    () =>
      sortItemsByVotes(
        items.map((item) => ({
          ...item,
          votes: (votesByItemId?.get(item.id) ?? []).map((v) => ({ level: v.level })),
        })),
      ),
    [items, votesByItemId],
  );
  const visibleIdeas = React.useMemo(
    () => sortedIdeas.filter((item) => near.inChip(item.id, chip)),
    [sortedIdeas, near, chip],
  );

  const isEmpty = items.length === 0;

  const mapItems = React.useMemo(
    () =>
      visibleIdeas
        .filter((i) => i.lat != null && i.lng != null)
        .map((i) => ({ id: i.id, title: i.title, category: i.category, lat: i.lat!, lng: i.lng! })),
    [visibleIdeas],
  );

  const unlocatedCount = visibleIdeas.length - mapItems.length;

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {near.chips.length > 0 && (
          <div
            role="group"
            aria-label="Filter ideas by where they are"
            className="-m-2 flex min-w-0 gap-2 overflow-x-auto p-2 sm:flex-wrap sm:overflow-visible"
          >
            {near.chips.map((c) => (
              <Chip
                key={c.key}
                tone={chip === c.key ? "coral" : "white"}
                selected={chip === c.key}
                onClick={() => setChosenChip(c.key)}
                touch
              >
                {c.label}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex justify-end sm:ml-auto">
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
      </div>

      {hasGlobe && (
        <GlobeSuggestionsStrip
          suggestions={suggestedMarkers}
          addedMarkerIds={addedMarkerIds}
          onSeeMore={openGlobeSuggestionsOverflow}
        />
      )}

      {view === "list" && isEmpty && (
        <EmptyState
          icon={Heart}
          tone="lilac"
          title="No ideas yet"
          description="Drop in anything you might want to do. Your people can vote."
          action={<AddItemButton {...addProps} variant="primary" size="md" />}
        />
      )}

      {view === "map" && (
        <div className="flex flex-col gap-4">
          <WishlistMapLoader items={mapItems} onSelect={handleMapSelect} />
          {unlocatedCount > 0 && (
            <p className="text-[13px] font-semibold text-muted-foreground">
              {unlocatedCount} not on the map. Add a location.
            </p>
          )}
        </div>
      )}

      {view === "list" && !isEmpty && (
        <AnimatedList
          as="ul"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-[18px] xl:grid-cols-3"
        >
          {visibleIdeas.map((item, i) => (
            <AnimatedItem key={item.id} as="li" className="min-w-0">
              <div aria-busy={pendingId === item.id || undefined} className="h-full">
                <ItemCard
                  item={{ ...item, stopName: near.nearLabel.get(item.id) ?? null }}
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
              </div>
            </AnimatedItem>
          ))}
          <AnimatedItem key="add-an-idea" as="li" className="hidden min-w-0 sm:block">
            <AddItemButton
              {...addProps}
              variant="dashed"
              size="md"
              className="size-full min-h-[170px] rounded-lg text-[15px]"
            />
          </AnimatedItem>
        </AnimatedList>
      )}

      {view === "list" && (
        <WishlistAddMenu
          tripId={tripId}
          stops={stopOptions}
          tripStartDate={tripStartDate}
          homeCurrency={homeCurrency}
          hasGlobe={hasGlobe}
          globeMarkers={globeMarkers}
          addedMarkerIds={addedMarkerIds}
          aiConfigured={aiConfigured}
          variant="secondary"
          className="w-full md:hidden"
        />
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
      {deletePaidDialog}
    </div>
  );
}
