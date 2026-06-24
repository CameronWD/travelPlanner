"use client";

import * as React from "react";
import { Plus, BookOpen, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StopCard, type StopCardStop } from "./stop-card";
import { StopFormDialog } from "./stop-form-dialog";
import { QuickAddStops } from "./quick-add-stops";
import { TransportCard, type TransportCardTransport } from "./transport-card";
import { TransportFormDialog, type StopOption } from "./transport-form-dialog";
import { AccommodationCard, type AccommodationCardAccommodation } from "./accommodation-card";
import { AccommodationFormDialog } from "./accommodation-form-dialog";
import { ChapterFormDialog } from "./chapter-form-dialog";
import { ChapterChip } from "./chapter-chip";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  deleteStop,
  moveStop,
  toggleStopPin,
  makeStopRough,
  firmUpSegment,
  setStopDates,
} from "@/server/actions/stops";
import { suggestNextStopDates, formatDateRange } from "@/lib/dates";
import { deleteTransport } from "@/server/actions/transport";
import { deleteAccommodation } from "@/server/actions/accommodation";
import { groupStopsByChapter, isTransportBetweenLegs } from "@/lib/chapters";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import type { TransportMode } from "@/lib/enums";
import type { CostRow } from "@/server/actions/costs";
import type { NoteView } from "./note-thread";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccommodationCardAccommodationWithCosts
  extends AccommodationCardAccommodation {
  costs?: CostRow[];
}

export interface ItineraryStop extends StopCardStop {
  /** Explicit chapter membership (used while rough). */
  chapterId: string | null;
  /** Order within an explicit chapter. */
  chapterSortOrder: number;
  accommodations: AccommodationCardAccommodationWithCosts[];
}

export interface ItineraryTransport {
  id: string;
  mode: TransportMode;
  fromStopId?: string | null;
  toStopId?: string | null;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | null;
  arrAt?: Date | null;
  reference?: string | null;
  notes?: string | null;
  sortOrder: number;
  /** Costs attached to this transport */
  costs?: CostRow[];
}

export interface ItineraryChapter {
  id: string;
  name: string;
  colour: string;
  /** Null for rough (date-less) chapters. */
  startDate: string | null;
  /** Null for rough (date-less) chapters. */
  endDate: string | null;
}

interface ItineraryManagerProps {
  tripId: string;
  initialStops: ItineraryStop[];
  initialTransports: ItineraryTransport[];
  /** Chapters for this trip — drives grouping/seam rendering */
  chapters?: ItineraryChapter[];
  /** Trip's home currency — passed to cost display */
  homeCurrency?: string;
  /** Trip date window — used to default + constrain stop date pickers */
  tripStartDate?: string;
  tripEndDate?: string;
  /** Map of stopId → notes for that stop */
  notesByStopId?: Map<string, NoteView[]>;
  /** Current authenticated user's ID */
  currentUserId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Enrich a transport with stop names and timezones for display.
 */
function enrichTransport(
  t: ItineraryTransport,
  stops: ItineraryStop[],
): TransportCardTransport {
  const fromStop = stops.find((s) => s.id === t.fromStopId);
  const toStop = stops.find((s) => s.id === t.toStopId);
  return {
    ...t,
    fromStopName: fromStop?.name ?? null,
    toStopName: toStop?.name ?? null,
    fromStopTimezone: fromStop?.timezone ?? null,
    toStopTimezone: toStop?.timezone ?? null,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItineraryManager({
  tripId,
  initialStops,
  initialTransports,
  chapters = [],
  homeCurrency,
  tripStartDate,
  tripEndDate,
  notesByStopId,
  currentUserId,
}: ItineraryManagerProps) {
  // ── Stop dialog state ──
  const [editingStop, setEditingStop] = React.useState<StopCardStop | null>(null);
  const [addStopOpen, setAddStopOpen] = React.useState(false);

  // ── Transport dialog state ──
  const [editingTransport, setEditingTransport] =
    React.useState<TransportCardTransport | null>(null);
  const [addTransportDefaults, setAddTransportDefaults] = React.useState<{
    fromStopId?: string;
    toStopId?: string;
  } | null>(null);

  // ── Accommodation dialog state ──
  const [editingAccommodation, setEditingAccommodation] =
    React.useState<AccommodationCardAccommodation | null>(null);
  const [editingAccStop, setEditingAccStop] =
    React.useState<ItineraryStop | null>(null);
  const [addAccommodationStop, setAddAccommodationStop] =
    React.useState<ItineraryStop | null>(null);

  // ── Chapter dialog state ──
  const [chapterDialogOpen, setChapterDialogOpen] = React.useState(false);
  const [chapterDialogDefaults, setChapterDialogDefaults] = React.useState<{
    defaultStart?: string;
    defaultEnd?: string;
  }>({});

  // ── Adjust-dates dialog state (ripple path for already-dated stops) ──
  const [adjustingStop, setAdjustingStop] = React.useState<StopCardStop | null>(
    null,
  );

  // ── Chapter group collapse state (keyed by chapter id or "ungrouped") ──
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // ── Pending mutations ──
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // ── Stop handlers ──
  async function handleDeleteStop(stopId: string) {
    if (!confirm("Delete this stop? This cannot be undone.")) return;
    setPendingId(stopId);
    try {
      await deleteStop(stopId);
    } finally {
      setPendingId(null);
    }
  }

  async function handleMoveStop(stopId: string, direction: "up" | "down") {
    setPendingId(stopId);
    try {
      await moveStop(stopId, direction);
    } finally {
      setPendingId(null);
    }
  }

  async function handleTogglePin(stopId: string) {
    setPendingId(stopId);
    try {
      await toggleStopPin(stopId);
    } finally {
      setPendingId(null);
    }
  }

  async function handleMakeRough(stopId: string) {
    if (!confirm("Make this stop rough again? Its dates will be cleared.")) return;
    setPendingId(stopId);
    try {
      await makeStopRough(stopId);
    } finally {
      setPendingId(null);
    }
  }

  function handleAdjustDates(stop: StopCardStop) {
    setAdjustingStop(stop);
  }

  // Firm up a whole leg — dates every rough stop in a chapter (id) or the
  // ungrouped run (null). The core rough → scheduled transition.
  async function handleFirmUp(chapterId: string | null) {
    setPendingId(`firm-up-${chapterId ?? "ungrouped"}`);
    try {
      await firmUpSegment({ tripId, chapterId });
    } finally {
      setPendingId(null);
    }
  }

  // ── Transport handlers ──
  async function handleDeleteTransport(transportId: string) {
    if (!confirm("Delete this transport leg? This cannot be undone.")) return;
    setPendingId(transportId);
    try {
      await deleteTransport(transportId);
    } finally {
      setPendingId(null);
    }
  }

  // ── Accommodation handlers ──
  async function handleDeleteAccommodation(accId: string) {
    if (!confirm("Delete this accommodation? This cannot be undone.")) return;
    setPendingId(accId);
    try {
      await deleteAccommodation(accId);
    } finally {
      setPendingId(null);
    }
  }

  // ── Chapter handler ──
  function handleStartChapterHere(stop: StopCardStop) {
    setChapterDialogDefaults({
      defaultStart: stop.arriveDate ?? undefined,
      defaultEnd: stop.departDate ?? undefined,
    });
    setChapterDialogOpen(true);
  }

  // Open the "+ New chapter" dialog with NO default dates (creates a rough chapter).
  function handleNewChapter() {
    setChapterDialogDefaults({});
    setChapterDialogOpen(true);
  }

  // Save handler for the adjust-dates dialog (ripple path for dated stops).
  async function handleSaveAdjustDates(
    stopId: string,
    dates: { arriveDate: string; departDate: string },
  ) {
    setPendingId(stopId);
    try {
      await setStopDates(stopId, dates);
    } finally {
      setPendingId(null);
      setAdjustingStop(null);
    }
  }

  // ── Derived data ──
  const stops = initialStops;
  const stopOptions: StopOption[] = stops.map((s) => ({ id: s.id, name: s.name }));
  const hasChapters = chapters.length > 0;

  /** Build a stopsById lookup (used by chapter helpers) */
  const stopsById = React.useMemo(() => {
    const map: Record<string, ItineraryStop> = {};
    for (const s of stops) {
      map[s.id] = s;
    }
    return map;
  }, [stops]);

  /**
   * Transports that link consecutive stops[i] → stops[i+1].
   * Returns a map of `${fromId}-${toId}` → transport[].
   */
  const transportByPair = React.useMemo(() => {
    const map = new Map<string, ItineraryTransport[]>();
    for (const t of initialTransports) {
      if (t.fromStopId && t.toStopId) {
        const key = `${t.fromStopId}-${t.toStopId}`;
        const arr = map.get(key) ?? [];
        arr.push(t);
        map.set(key, arr);
      }
    }
    return map;
  }, [initialTransports]);

  /**
   * Set of transport IDs that are "between-legs" (cross chapters or have a
   * null endpoint). These are NOT rendered inline with the stop loop.
   * When there are no chapters, every transport is intra-chapter → set is empty.
   */
  const betweenLegsIds = React.useMemo<Set<string>>(() => {
    if (!hasChapters) return new Set();
    const ids = new Set<string>();
    for (const t of initialTransports) {
      if (isTransportBetweenLegs(t, chapters, stopsById)) {
        ids.add(t.id);
      }
    }
    return ids;
  }, [initialTransports, chapters, stopsById, hasChapters]);

  /** Transports that DON'T link a consecutive pair (orphaned or partial) */
  const otherTransports = React.useMemo(() => {
    const consecutivePairKeys = new Set<string>();
    for (let i = 0; i < stops.length - 1; i++) {
      consecutivePairKeys.add(`${stops[i].id}-${stops[i + 1].id}`);
    }

    return initialTransports.filter((t) => {
      if (!t.fromStopId || !t.toStopId) return true; // null endpoint → other
      const key = `${t.fromStopId}-${t.toStopId}`;
      return !consecutivePairKeys.has(key); // non-consecutive → other
    });
  }, [initialTransports, stops]);

  const hasStops = stops.length > 0;

  // Default a new stop to pick up where the last one departs (or trip start),
  // so the date picker opens in the trip's window rather than today.
  const datedStops = stops.filter(
    (s): s is ItineraryStop & { departDate: string } => s.departDate !== null,
  );
  const suggestedStopDates = suggestNextStopDates(
    datedStops,
    tripStartDate,
    tripEndDate,
  );

  // ── Grouped rendering data ──
  const groups = React.useMemo(
    () => groupStopsByChapter(stops, chapters),
    [stops, chapters],
  );

  // ---------------------------------------------------------------------------
  // Per-stop render helper (shared between grouped and flat rendering)
  // ---------------------------------------------------------------------------

  function renderStop(stop: ItineraryStop, globalIdx: number, isFirst: boolean, isLast: boolean) {
    const nextStop = isLast ? null : stops[globalIdx + 1];

    // When chapters exist, filter out between-legs transports from inline render.
    const legTransports = nextStop
      ? (transportByPair.get(`${stop.id}-${nextStop.id}`) ?? []).filter(
          (t) => !betweenLegsIds.has(t.id),
        )
      : [];

    return (
      <React.Fragment key={stop.id}>
        {/* Stop card */}
        <StopCard
          stop={stop}
          isFirst={isFirst}
          isLast={isLast}
          isPending={pendingId === stop.id}
          onEdit={(s) => setEditingStop(s)}
          onMoveUp={(id) => handleMoveStop(id, "up")}
          onMoveDown={(id) => handleMoveStop(id, "down")}
          onDelete={handleDeleteStop}
          onStartChapter={handleStartChapterHere}
          onTogglePin={handleTogglePin}
          onMakeRough={handleMakeRough}
          onAdjustDates={handleAdjustDates}
          notes={notesByStopId?.get(stop.id) ?? []}
          tripId={tripId}
          currentUserId={currentUserId}
        />

        {/* Accommodations under this stop (dated stops only) */}
        {stop.arriveDate && stop.departDate && stop.accommodations.length > 0 && (
          <div className="ml-4 flex flex-col gap-2 border-l-2 border-border/40 pl-4">
            {stop.accommodations.map((acc) => (
              <AccommodationCard
                key={acc.id}
                accommodation={acc}
                stop={{ arriveDate: stop.arriveDate!, departDate: stop.departDate! }}
                isPending={pendingId === acc.id}
                onEdit={(a) => {
                  setEditingAccommodation(a);
                  setEditingAccStop(stop);
                }}
                onDelete={handleDeleteAccommodation}
                costs={acc.costs}
                tripId={tripId}
                homeCurrency={homeCurrency}
              />
            ))}
          </div>
        )}

        {/* Add accommodation for this stop (scheduled stops only — accommodations
            need real dates, so a rough stop's accommodation would be hidden). */}
        {stop.arriveDate && stop.departDate && (
          <div className="ml-4 pl-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAddAccommodationStop(stop)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add accommodation
            </Button>
          </div>
        )}

        {/* Transport legs to next stop (intra-chapter only when chapters exist) */}
        {!isLast && (
          <div className="flex flex-col gap-2 px-2">
            {legTransports.map((t) => (
              <TransportCard
                key={t.id}
                transport={enrichTransport(t, stops)}
                isPending={pendingId === t.id}
                onEdit={(tr) => setEditingTransport(tr)}
                onDelete={handleDeleteTransport}
                costs={t.costs}
                tripId={tripId}
                homeCurrency={homeCurrency}
              />
            ))}

            {/* Add transport between this pair */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setAddTransportDefaults({
                    fromStopId: stop.id,
                    toStopId: nextStop!.id,
                  })
                }
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add transport to {nextStop!.name}
              </Button>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  }

  // ---------------------------------------------------------------------------
  // Seam render helper — renders cross-chapter transports between two groups
  // ---------------------------------------------------------------------------

  function renderSeam(
    lastStopOfPrevGroup: ItineraryStop,
    firstStopOfNextGroup: ItineraryStop,
  ) {
    const seamKey = `${lastStopOfPrevGroup.id}-${firstStopOfNextGroup.id}`;
    const seamTransports = (transportByPair.get(seamKey) ?? []).filter((t) =>
      betweenLegsIds.has(t.id),
    );
    if (seamTransports.length === 0) return null;
    return (
      <div key={`seam-${seamKey}`} className="flex flex-col gap-2 px-2">
        {seamTransports.map((t) => (
          <TransportCard
            key={t.id}
            transport={enrichTransport(t, stops)}
            isPending={pendingId === t.id}
            onEdit={(tr) => setEditingTransport(tr)}
            onDelete={handleDeleteTransport}
            costs={t.costs}
            tripId={tripId}
            homeCurrency={homeCurrency}
          />
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {hasStops ? (
        <>
          {/* Stops + interspersed transports + accommodations */}
          <div className="flex flex-col gap-3">
            {!hasChapters ? (
              // ── Zero-chapters path: flat list = one ungrouped run ──
              <>
                {stops.some((s) => s.arriveDate === null) && (
                  <div className="flex justify-end px-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={pendingId === "firm-up-ungrouped"}
                      onClick={() => handleFirmUp(null)}
                    >
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      Set dates
                    </Button>
                  </div>
                )}
                {stops.map((stop, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === stops.length - 1;
                  return renderStop(stop, idx, isFirst, isLast);
                })}
                <QuickAddStops tripId={tripId} chapterId={null} />
              </>
            ) : (
              // ── Chapters path: grouped rendering with seams ──
              groups.map((group, groupIdx) => {
                const isFirstGroup = groupIdx === 0;
                const prevGroup = isFirstGroup ? null : groups[groupIdx - 1];
                const groupKey = group.chapter?.id ?? "ungrouped";
                const isCollapsed = collapsedGroups.has(groupKey);

                // Find the global stop index for isFirst/isLast tracking
                const firstStopGlobalIdx = stops.indexOf(group.stops[0]);

                return (
                  <React.Fragment key={groupKey + "-" + groupIdx}>
                    {/* Seam: cross-chapter transports between prev group and this group */}
                    {!isFirstGroup && prevGroup && prevGroup.stops.length > 0 && group.stops.length > 0 &&
                      renderSeam(
                        prevGroup.stops[prevGroup.stops.length - 1],
                        group.stops[0],
                      )
                    }

                    {/* Chapter group header (only when group has a chapter) */}
                    {group.chapter ? (
                      <div
                        className="rounded-xl border border-border/60 overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: chapterColourSwatch(group.chapter.colour) }}
                      >
                        {/* Collapsible header */}
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          aria-label={`${group.chapter.name} chapter, ${isCollapsed ? "expand" : "collapse"}`}
                          onClick={() => toggleGroup(groupKey)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                        >
                          <ChapterChip
                            name={group.chapter.name}
                            colour={group.chapter.colour}
                          />
                          <span className="text-xs text-muted-foreground flex-1">
                            {group.chapter.startDate && group.chapter.endDate
                              ? formatDateRange(group.chapter.startDate, group.chapter.endDate)
                              : "rough"}
                          </span>
                          {!group.chapter.startDate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={pendingId === `firm-up-${group.chapter.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFirmUp(group.chapter!.id);
                              }}
                            >
                              <CalendarClock className="size-3.5" aria-hidden="true" />
                              Set dates
                            </Button>
                          )}
                          <span className="text-sm text-muted-foreground select-none" aria-hidden="true">
                            {isCollapsed ? "▸" : "▾"}
                          </span>
                        </button>

                        {/* Group body */}
                        {!isCollapsed && (
                          <div className="flex flex-col gap-3 p-3">
                            {group.stops.map((stop, groupStopIdx) => {
                              const globalIdx = firstStopGlobalIdx + groupStopIdx;
                              const isFirst = globalIdx === 0;
                              const isLast = globalIdx === stops.length - 1;
                              return renderStop(stop, globalIdx, isFirst, isLast);
                            })}
                            <QuickAddStops tripId={tripId} chapterId={group.chapter.id} />
                          </div>
                        )}
                      </div>
                    ) : (
                      // Ungrouped stops — no chapter header, or subtle label
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between px-1">
                          {hasChapters ? (
                            <p className="text-xs text-muted-foreground">Ungrouped</p>
                          ) : (
                            <span />
                          )}
                          {group.stops.some((s) => s.arriveDate === null) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={pendingId === "firm-up-ungrouped"}
                              onClick={() => handleFirmUp(null)}
                            >
                              <CalendarClock className="size-3.5" aria-hidden="true" />
                              Set dates
                            </Button>
                          )}
                        </div>
                        {group.stops.map((stop, groupStopIdx) => {
                          const globalIdx = firstStopGlobalIdx + groupStopIdx;
                          const isFirst = globalIdx === 0;
                          const isLast = globalIdx === stops.length - 1;
                          return renderStop(stop, globalIdx, isFirst, isLast);
                        })}
                        <QuickAddStops tripId={tripId} chapterId={null} />
                      </div>
                    )}
                  </React.Fragment>
                );
              })
            )}

            {/* Empty chapters: a freshly created chapter holds no stops yet, so
                groupStopsByChapter never emits it. Render those here (after the
                populated groups) so they're visible and droppable into. */}
            {hasChapters &&
              (() => {
                const presentChapterIds = new Set(
                  groups.map((g) => g.chapter?.id).filter(Boolean) as string[],
                );
                const emptyChapters = chapters.filter(
                  (c) => !presentChapterIds.has(c.id),
                );
                return emptyChapters.map((chapter) => {
                  const groupKey = chapter.id;
                  const isCollapsed = collapsedGroups.has(groupKey);
                  return (
                    <div
                      key={`empty-${chapter.id}`}
                      className="rounded-xl border border-border/60 overflow-hidden"
                      style={{
                        borderLeftWidth: 4,
                        borderLeftColor: chapterColourSwatch(chapter.colour),
                      }}
                    >
                      {/* Collapsible header — same markup as populated chapters */}
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        aria-label={`${chapter.name} chapter, ${isCollapsed ? "expand" : "collapse"}`}
                        onClick={() => toggleGroup(groupKey)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                      >
                        <ChapterChip name={chapter.name} colour={chapter.colour} />
                        <span className="text-xs text-muted-foreground flex-1">
                          {chapter.startDate && chapter.endDate
                            ? formatDateRange(chapter.startDate, chapter.endDate)
                            : "rough"}
                        </span>
                        {!chapter.startDate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={pendingId === `firm-up-${chapter.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFirmUp(chapter.id);
                            }}
                          >
                            <CalendarClock className="size-3.5" aria-hidden="true" />
                            Set dates
                          </Button>
                        )}
                        <span
                          className="text-sm text-muted-foreground select-none"
                          aria-hidden="true"
                        >
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                      </button>

                      {/* Group body — no stops yet, just the quick-add row */}
                      {!isCollapsed && (
                        <div className="flex flex-col gap-3 p-3">
                          <p className="px-1 text-xs text-muted-foreground">
                            No stops yet — add one
                          </p>
                          <QuickAddStops tripId={tripId} chapterId={chapter.id} />
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
          </div>

          {/* Other transports (not linked to consecutive stops, or home bookends) */}
          {otherTransports.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Other transport
              </h3>
              {otherTransports.map((t) => (
                <TransportCard
                  key={t.id}
                  transport={enrichTransport(t, stops)}
                  isPending={pendingId === t.id}
                  onEdit={(tr) => setEditingTransport(tr)}
                  onDelete={handleDeleteTransport}
                  costs={t.costs}
                  tripId={tripId}
                  homeCurrency={homeCurrency}
                />
              ))}
            </div>
          )}

          {/* Add a standalone transport */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAddTransportDefaults({})}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add transport (other)
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={handleNewChapter}
              >
                <BookOpen className="size-4" aria-hidden="true" />
                New chapter
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setAddStopOpen(true)}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add stop
              </Button>
            </div>
          </div>
        </>
      ) : (
        // ── Empty state: warm prompt with inline add + new chapter ──
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-12 text-center">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-2xl font-semibold text-foreground">
              Sketch your trip
            </h2>
            <p className="text-sm text-muted-foreground">
              Add a chapter or a place to get started
            </p>
          </div>
          <div className="w-full max-w-md">
            <QuickAddStops tripId={tripId} chapterId={null} />
          </div>
          <Button variant="outline" size="md" onClick={handleNewChapter}>
            <BookOpen className="size-4" aria-hidden="true" />
            New chapter
          </Button>
        </div>
      )}

      {/* ─── Dialogs ─── */}

      {/* Add stop */}
      <StopFormDialog
        tripId={tripId}
        open={addStopOpen}
        onOpenChange={setAddStopOpen}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        defaultArriveDate={suggestedStopDates.arriveDate}
        defaultDepartDate={suggestedStopDates.departDate}
        chapters={chapters.map((c) => ({ id: c.id, name: c.name }))}
      />

      {/* Edit stop */}
      {editingStop && (
        <StopFormDialog
          tripId={tripId}
          stop={editingStop}
          open={Boolean(editingStop)}
          onOpenChange={(open) => {
            if (!open) setEditingStop(null);
          }}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          chapters={chapters.map((c) => ({ id: c.id, name: c.name }))}
        />
      )}

      {/* Add transport */}
      {addTransportDefaults !== null && (
        <TransportFormDialog
          tripId={tripId}
          stops={stopOptions}
          defaultFromStopId={addTransportDefaults.fromStopId}
          defaultToStopId={addTransportDefaults.toStopId}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAddTransportDefaults(null);
          }}
        />
      )}

      {/* Edit transport */}
      {editingTransport && (
        <TransportFormDialog
          tripId={tripId}
          stops={stopOptions}
          transport={editingTransport}
          open={Boolean(editingTransport)}
          onOpenChange={(open) => {
            if (!open) setEditingTransport(null);
          }}
        />
      )}

      {/* Add accommodation */}
      {addAccommodationStop && (
        <AccommodationFormDialog
          stopId={addAccommodationStop.id}
          stopDateRange={{
            arriveDate: addAccommodationStop.arriveDate ?? "",
            departDate: addAccommodationStop.departDate ?? "",
          }}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAddAccommodationStop(null);
          }}
        />
      )}

      {/* Edit accommodation */}
      {editingAccommodation && editingAccStop && (
        <AccommodationFormDialog
          stopId={editingAccStop.id}
          stopDateRange={{
            arriveDate: editingAccStop.arriveDate ?? "",
            departDate: editingAccStop.departDate ?? "",
          }}
          accommodation={editingAccommodation}
          open={Boolean(editingAccommodation)}
          onOpenChange={(open) => {
            if (!open) {
              setEditingAccommodation(null);
              setEditingAccStop(null);
            }
          }}
        />
      )}

      {/* Chapter dialog — "Start a chapter here" (dated) or "+ New chapter" (rough) */}
      <ChapterFormDialog
        tripId={tripId}
        open={chapterDialogOpen}
        onOpenChange={setChapterDialogOpen}
        defaultStart={chapterDialogDefaults.defaultStart}
        defaultEnd={chapterDialogDefaults.defaultEnd}
      />

      {/* Adjust dates (ripple path for already-dated stops) */}
      {adjustingStop && (
        <AdjustDatesDialog
          stop={adjustingStop}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          isPending={pendingId === adjustingStop.id}
          onCancel={() => setAdjustingStop(null)}
          onSave={(dates) => handleSaveAdjustDates(adjustingStop.id, dates)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adjust-dates dialog — two DateFields, prefilled, saving via setStopDates.
// ---------------------------------------------------------------------------

function AdjustDatesDialog({
  stop,
  tripStartDate,
  tripEndDate,
  isPending,
  onCancel,
  onSave,
}: {
  stop: StopCardStop;
  tripStartDate?: string;
  tripEndDate?: string;
  isPending: boolean;
  onCancel: () => void;
  onSave: (dates: { arriveDate: string; departDate: string }) => void;
}) {
  const [arriveDate, setArriveDate] = React.useState(stop.arriveDate ?? "");
  const [departDate, setDepartDate] = React.useState(stop.departDate ?? "");

  const canSave =
    arriveDate !== "" && departDate !== "" && departDate >= arriveDate;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust dates — {stop.name}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave({ arriveDate, departDate });
          }}
        >
          <DateField
            label="Arrive"
            value={arriveDate}
            min={tripStartDate}
            max={tripEndDate}
            onChange={(e) => setArriveDate(e.target.value)}
            required
          />
          <DateField
            label="Depart"
            value={departDate}
            min={arriveDate || tripStartDate}
            max={tripEndDate}
            onChange={(e) => setDepartDate(e.target.value)}
            required
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={!canSave || isPending}>
              Save dates
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
