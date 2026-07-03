"use client";

import * as React from "react";
import { Plus, BookOpen, CalendarClock, GripVertical, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
  firmUpTrip,
  setStopDates,
  reorderStops,
} from "@/server/actions/stops";
import { reorderChapters } from "@/server/actions/chapters";
import { toast } from "@/components/ui/use-toast";
import { suggestNextStopDates, formatDateRange, formatLongDate } from "@/lib/dates";
import { deleteTransport } from "@/server/actions/transport";
import { deleteAccommodation } from "@/server/actions/accommodation";
import { groupStopsByChapter, isTransportBetweenLegs, sortGroupStops } from "@/lib/chapters";
import { moveStopInOrder, moveChapterBlocks } from "@/lib/reorder";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import type { TransportMode } from "@/lib/enums";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type { CostRow } from "@/server/actions/costs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { NoteView } from "./note-thread";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  /** Precomputed offline drive estimate; present only for Car legs without real times. */
  driveEstimate?: { minutes: number; roadKm: number } | null;
}

export interface ItineraryChapter {
  id: string;
  name: string;
  colour: string;
  /** Null for rough (date-less) chapters. */
  startDate: string | null;
  /** Null for rough (date-less) chapters. */
  endDate: string | null;
  sortOrder: number;
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
  /** Fork being edited (null = real plan). Threaded to all create actions. */
  forkId?: string | null;
}

// ---------------------------------------------------------------------------
// dnd-kit sub-components
// ---------------------------------------------------------------------------

/**
 * Wraps a rough stop in a dnd-kit sortable context.
 * Provides a grip handle that is passed through to StopCard.
 */
function SortableStop({
  stop,
  chapterId,
  children,
}: {
  stop: ItineraryStop;
  chapterId: string | null;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
    data: { type: "stop", chapterId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dragHandle = (
    <button
      type="button"
      {...listeners}
      {...attributes}
      aria-label={`Reorder ${stop.name}`}
      title="Drag to reorder"
      className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground focus:outline-none"
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children(dragHandle)}
    </div>
  );
}

/**
 * Wraps a rough chapter header in a dnd-kit sortable context.
 * Provides a grip handle to be rendered inside the chapter header.
 */
function SortableChapterHeader({
  chapterId,
  children,
}: {
  chapterId: string;
  children: (dragHandle: React.ReactNode, setNodeRef: (node: HTMLElement | null) => void, style: React.CSSProperties) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapterId,
    data: { type: "chapter" },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dragHandle = (
    <button
      type="button"
      {...listeners}
      {...attributes}
      aria-label="Reorder chapter"
      className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground focus:outline-none"
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );

  return <>{children(dragHandle, setNodeRef, style)}</>;
}

/**
 * An empty droppable container for rough chapters that have no stops.
 * Allows rough stops to be dragged into an empty rough chapter.
 */
function EmptyRoughDroppable({ chapterId }: { chapterId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: chapterId });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-8 rounded-md transition-colors ${isOver ? "bg-muted/60" : ""}`}
    />
  );
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
    driveEstimate: t.driveEstimate ?? null,
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
  forkId,
}: ItineraryManagerProps) {
  const { confirm, dialog } = useConfirm();

  // ── Local mutable copies (for optimistic drag reordering) ──
  // Seeded from props; the drag handlers mutate them optimistically.
  // Re-sync during render (getDerivedStateFromProps pattern) when props identity
  // changes — this is idiomatic React and avoids setState-in-effect.
  const [localStops, setLocalStops] = React.useState<ItineraryStop[]>(initialStops);
  const [localChapters, setLocalChapters] = React.useState<ItineraryChapter[]>(chapters);
  const [trackedInitialStops, setTrackedInitialStops] = React.useState(initialStops);
  const [trackedChapters, setTrackedChapters] = React.useState(chapters);
  if (trackedInitialStops !== initialStops) {
    setTrackedInitialStops(initialStops);
    setLocalStops(initialStops);
  }
  if (trackedChapters !== chapters) {
    setTrackedChapters(chapters);
    setLocalChapters(chapters);
  }

  // ── dnd-kit sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    originStopId?: string;
  }>({});

  // ── Adjust-dates dialog state (ripple path for already-dated stops) ──
  const [adjustingStop, setAdjustingStop] = React.useState<StopCardStop | null>(
    null,
  );

  // ── Chapter group collapse state (keyed by chapter id or "ungrouped") ──
  // Persisted to localStorage under `${tripId}:${chapterId}` keys so state
  // survives a page refresh. Guard for SSR: localStorage is browser-only.
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const stored = localStorage.getItem(`itinerary-collapse:${tripId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {
      // Ignore parse errors — start fresh
    }
    return new Set<string>();
  });

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      // Persist to localStorage (SSR guard)
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            `itinerary-collapse:${tripId}`,
            JSON.stringify([...next]),
          );
        } catch {
          // Quota exceeded or private browsing — silently ignore
        }
      }
      return next;
    });
  }

  // ── Pending mutations ──
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // ── Stop handlers ──
  async function handleDeleteStop(stopId: string) {
    const stop = localStops.find((s) => s.id === stopId);
    const confirmed = await confirm({
      title: `Delete "${stop?.name ?? "this stop"}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
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
    const stop = localStops.find((s) => s.id === stopId);
    const confirmed = await confirm({
      title: `Make "${stop?.name ?? "this stop"}" rough again?`,
      description: "Its dates will be cleared and later stops will re-flow.",
      confirmLabel: "Make rough",
      destructive: false,
    });
    if (!confirmed) return;
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
    // Compute rough stop count and anchor for the confirm summary.
    // Read localStops directly (not the `stops` alias) so the React Compiler
    // can keep cross-await reads out of the memo dependency analysis.
    const chapterStops = chapterId
      ? localStops.filter((s) => s.chapterId === chapterId)
      : localStops.filter((s) => s.chapterId === null);
    const roughCount = chapterStops.filter((s) => s.arriveDate === null).length;

    // Anchor: the depart date of the last scheduled stop before this chapter's
    // first stop in the global order, or tripStartDate, or a generic fallback.
    const firstChapterStopIdx = localStops.findIndex(
      (s) => chapterId ? s.chapterId === chapterId : s.chapterId === null,
    );
    let anchorLabel = "the trip start";
    if (firstChapterStopIdx > 0) {
      const precedingDated = localStops
        .slice(0, firstChapterStopIdx)
        .reverse()
        .find((s) => s.departDate !== null);
      if (precedingDated?.departDate) {
        anchorLabel = formatLongDate(precedingDated.departDate);
      } else if (tripStartDate) {
        anchorLabel = formatLongDate(tripStartDate);
      }
    } else if (tripStartDate) {
      anchorLabel = formatLongDate(tripStartDate);
    }

    const stopWord = roughCount === 1 ? "stop" : "stops";
    const confirmed = await confirm({
      title: "Date this chapter's stops?",
      description: `This will date ${roughCount} rough ${stopWord} from ${anchorLabel}. You can make any stop rough again afterwards.`,
      confirmLabel: "Date stops",
      destructive: false,
    });
    if (!confirmed) return;

    setPendingId(`firm-up-${chapterId ?? "ungrouped"}`);
    try {
      const r = await firmUpSegment({ tripId, chapterId, forkId: forkId ?? undefined });
      if (!r.success) {
        toast({
          variant: "destructive",
          title: r.errors.anchorDate?.[0] ?? "Pick a start date for this leg first.",
        });
      } else if (r.conflicts?.length) {
        toast({
          title: "Heads up — earlier stops run past a pinned date; the pin was kept.",
        });
      }
    } finally {
      setPendingId(null);
    }
  }

  // Date every rough stop across the whole trip from the start date, in one action.
  async function handleFirmUpTrip() {
    const roughCount = localStops.filter((s) => s.arriveDate === null).length;
    const anchorLabel = tripStartDate ? formatLongDate(tripStartDate) : "the trip start";
    const stopWord = roughCount === 1 ? "stop" : "stops";

    const confirmed = await confirm({
      title: "Date all stops from start?",
      description: `This will date ${roughCount} rough ${stopWord} from ${anchorLabel}. You can make any stop rough again afterwards.`,
      confirmLabel: "Date stops",
      destructive: false,
    });
    if (!confirmed) return;

    setPendingId("firm-up-trip");
    try {
      const r = await firmUpTrip(tripId, undefined, forkId ?? undefined);
      if (!r.success) {
        toast({
          variant: "destructive",
          title: r.errors.anchorDate?.[0] ?? "Set a start date for the trip first.",
        });
      } else if (r.conflicts?.length) {
        toast({ title: "Heads up — some stops run past a pinned date; the pins were kept." });
      }
    } finally {
      setPendingId(null);
    }
  }

  // ── Transport handlers ──
  async function handleDeleteTransport(transportId: string) {
    const t = initialTransports.find((tr) => tr.id === transportId);
    const modeLabel = t ? (TRANSPORT_MODE_META[t.mode]?.label ?? t.mode) : "transport leg";
    // Build a route identifier from place names if available.
    const routeLabel = t
      ? (t.depPlace && t.arrPlace
        ? `${modeLabel} from ${t.depPlace} to ${t.arrPlace}`
        : t.depPlace
          ? `${modeLabel} from ${t.depPlace}`
          : t.arrPlace
            ? `${modeLabel} to ${t.arrPlace}`
            : modeLabel)
      : modeLabel;
    const confirmed = await confirm({
      title: `Delete "${routeLabel}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    setPendingId(transportId);
    try {
      await deleteTransport(transportId);
    } finally {
      setPendingId(null);
    }
  }

  // ── Accommodation handlers ──
  async function handleDeleteAccommodation(accId: string) {
    const acc = localStops.flatMap((s) => s.accommodations).find((a) => a.id === accId);
    const confirmed = await confirm({
      title: `Delete "${acc?.name ?? "this accommodation"}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
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
      originStopId: stop.id,
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
      const r = await setStopDates(stopId, dates);
      if (r.success && r.conflicts?.length) {
        toast({
          title: "Heads up — earlier stops run past a pinned date; the pin was kept.",
        });
      }
    } finally {
      setPendingId(null);
      setAdjustingStop(null);
    }
  }

  // ── Derived data ── (reads from local copies so drags update instantly)
  const stops = localStops;
  const stopOptions: StopOption[] = stops.map((s) => ({ id: s.id, name: s.name }));
  const hasChapters = localChapters.length > 0;

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
      if (isTransportBetweenLegs(t, localChapters, stopsById)) {
        ids.add(t.id);
      }
    }
    return ids;
  }, [initialTransports, localChapters, stopsById, hasChapters]);

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
  // Show the planning UI when there are stops OR chapters. A freshly created
  // rough chapter must be visible (and able to accept rough stops) before any
  // stop exists — otherwise it's saved but hidden behind the empty state.
  const hasContent = hasStops || hasChapters;

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
    () => groupStopsByChapter(stops, localChapters),
    [stops, localChapters],
  );

  // ---------------------------------------------------------------------------
  // Drag handlers
  // ---------------------------------------------------------------------------

  /**
   * onDragOver: move an item between containers in local state optimistically.
   * Only fires for stop-type drags across different containers.
   */
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.type !== "stop") return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeStop = localStops.find((s) => s.id === activeId);
    if (!activeStop || activeStop.arriveDate !== null) return; // only rough stops move

    // Determine the target container (chapterId or null for ungrouped).
    // The over element is either a stop (use its chapterId) or a droppable container id.
    const overStop = localStops.find((s) => s.id === overId);
    let targetChapterId: string | null;

    if (overStop) {
      // Dropped over another stop — use that stop's chapterId.
      targetChapterId = overStop.chapterId;
    } else {
      // Dropped over a container droppable — the droppable id is the chapterId or "ungrouped".
      targetChapterId = overId === "ungrouped" ? null : overId;
    }

    // Don't move into a dated chapter.
    const targetChapter = targetChapterId ? localChapters.find((c) => c.id === targetChapterId) : null;
    if (targetChapter && targetChapter.startDate !== null) return;

    // If the container hasn't changed, nothing to do here (onDragEnd handles reorder within container).
    if (activeStop.chapterId === targetChapterId) return;

    setLocalStops((prev) => {
      return prev.map((s) =>
        s.id === activeId ? { ...s, chapterId: targetChapterId } : s,
      );
    });
  }

  /**
   * onDragEnd: persist the final order after a drag.
   */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data.current?.type as "stop" | "chapter" | undefined;

    if (activeType === "stop") {
      const activeId = active.id as string;
      const overId = over.id as string;

      const activeStop = localStops.find((s) => s.id === activeId);
      if (!activeStop || activeStop.arriveDate !== null) return;

      // Determine target container (chapterId or null for ungrouped).
      const overStop = localStops.find((s) => s.id === overId);
      const targetChapterId: string | null = overStop
        ? overStop.chapterId
        : overId === "ungrouped" ? null : overId;

      // Check not dropping into a dated chapter.
      const targetChapter = targetChapterId ? localChapters.find((c) => c.id === targetChapterId) : null;
      if (targetChapter && targetChapter.startDate !== null) return;

      // Compute the target index within the destination chapter block.
      // When dropping onto a stop, use that stop's position within the block;
      // when dropping onto the container itself, append at the end.
      const containerStops = localStops.filter(
        (s) => s.arriveDate === null && s.chapterId === targetChapterId,
      );
      let targetIndex = containerStops.length; // default: append at end
      if (overStop && overStop.arriveDate === null && overStop.chapterId === targetChapterId) {
        const overIdx = containerStops.findIndex((s) => s.id === overId);
        if (overIdx !== -1) targetIndex = overIdx;
      }

      // Use the pure helper to compute the authoritative new order.
      // This handles both within-container reorders and cross-container moves,
      // always keeping each chapter's block contiguous.
      const ordered = moveStopInOrder(localStops, activeId, targetChapterId, targetIndex);

      // Apply the new chapterId assignments back to localStops (preserve all
      // ItineraryStop fields, only update id/chapterId from the ordered result).
      const chapterIdById = new Map(ordered.map((s) => [s.id, s.chapterId]));
      const newLocalStops = ordered.map((slim) => {
        const full = localStops.find((s) => s.id === slim.id)!;
        return { ...full, chapterId: chapterIdById.get(full.id) ?? full.chapterId };
      });
      setLocalStops(newLocalStops);

      // Persist: use the authoritative ordered list.
      const items = ordered;
      const result = await reorderStops(tripId, items);
      if (!result.success) {
        const firstError = result.errors
          ? Object.values(result.errors).flat()[0]
          : "Failed to reorder stops.";
        toast({ variant: "destructive", title: firstError ?? "Failed to reorder stops." });
        setLocalStops(initialStops); // revert
      }
    } else if (activeType === "chapter") {
      const activeId = active.id as string;
      const overId = over.id as string;
      if (activeId === overId) return;

      const roughChapters = localChapters.filter((c) => c.startDate === null);
      const oldIndex = roughChapters.findIndex((c) => c.id === activeId);
      const newIndex = roughChapters.findIndex((c) => c.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedRough = arrayMove(roughChapters, oldIndex, newIndex);
      const datedChapters = localChapters.filter((c) => c.startDate !== null);
      const newLocalChapters = [...datedChapters, ...reorderedRough];
      setLocalChapters(newLocalChapters);

      // Use the pure helper to permute rough-chapter blocks while keeping
      // dated stops and ungrouped stops at their original positions.
      const roughChapterIds = reorderedRough.map((c) => c.id);
      const ordered = moveChapterBlocks(localStops, localChapters, roughChapterIds);

      // Rebuild full ItineraryStop list from the ordered slim result.
      const chapterIdById = new Map(ordered.map((s) => [s.id, s.chapterId]));
      const reorderedStops = ordered.map((slim) => {
        const full = localStops.find((s) => s.id === slim.id)!;
        return { ...full, chapterId: chapterIdById.get(full.id) ?? full.chapterId };
      });
      setLocalStops(reorderedStops);

      // Persist chapters.
      const chapterResult = await reorderChapters(tripId, roughChapterIds);
      if (!chapterResult.success) {
        const firstError = chapterResult.errors
          ? Object.values(chapterResult.errors).flat()[0]
          : "Failed to reorder chapters.";
        toast({ variant: "destructive", title: firstError ?? "Failed to reorder chapters." });
        setLocalChapters(chapters);
        setLocalStops(initialStops);
        return;
      }

      // Persist stop order.
      const stopItems = reorderedStops.map((s) => ({ id: s.id, chapterId: s.chapterId }));
      const stopResult = await reorderStops(tripId, stopItems);
      if (!stopResult.success) {
        const firstError = stopResult.errors
          ? Object.values(stopResult.errors).flat()[0]
          : "Failed to reorder stops.";
        toast({ variant: "destructive", title: firstError ?? "Failed to reorder stops." });
        setLocalChapters(chapters);
        setLocalStops(initialStops);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Per-stop render helper (shared between grouped and flat rendering)
  // ---------------------------------------------------------------------------

  function renderStop(stop: ItineraryStop, globalIdx: number, isFirst: boolean, isLast: boolean) {
    const nextStop = isLast ? null : stops[globalIdx + 1];
    const isRough = stop.arriveDate === null;

    // When chapters exist, filter out between-legs transports from inline render.
    const legTransports = nextStop
      ? (transportByPair.get(`${stop.id}-${nextStop.id}`) ?? []).filter(
          (t) => !betweenLegsIds.has(t.id),
        )
      : [];

    const stopCard = (dragHandle?: React.ReactNode) => (
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
        dragHandle={dragHandle}
      />
    );

    return (
      <React.Fragment key={stop.id}>
        {/* Stop card — rough stops get a sortable wrapper with a drag handle */}
        {isRough ? (
          <SortableStop stop={stop} chapterId={stop.chapterId}>
            {(dragHandle) => stopCard(dragHandle)}
          </SortableStop>
        ) : (
          stopCard()
        )}

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

  // IDs of rough chapters that are actually RENDERED with a drag handle inside
  // the chapter-level SortableContext. Only populated (non-empty) rough chapters
  // get a drag handle; empty rough chapters remain non-reorderable for now —
  // they render in sortOrder and are still droppable via EmptyRoughDroppable.
  const populatedRoughChapterIds = groups
    .filter((g) => g.chapter !== null && g.chapter.startDate === null && g.stops.length > 0)
    .map((g) => g.chapter!.id);

  return (
    <div className="flex flex-col gap-4">
      {hasContent ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
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
                <SortableContext
                  items={stops.filter((s) => s.arriveDate === null).map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {stops.map((stop, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === stops.length - 1;
                    return renderStop(stop, idx, isFirst, isLast);
                  })}
                </SortableContext>
                <QuickAddStops tripId={tripId} chapterId={null} forkId={forkId ?? null} afterStopId={stops.length > 0 ? stops[stops.length - 1].id : null} />
              </>
            ) : (
              // ── Chapters path: grouped rendering with seams ──
              // Wrap rough chapter groups in a SortableContext for chapter-level drag.
              // Only populated rough chapters (those rendered with a drag handle) are
              // included; empty chapters remain non-reorderable via EmptyRoughDroppable.
              <SortableContext items={populatedRoughChapterIds} strategy={verticalListSortingStrategy}>
                {groups.map((group, groupIdx) => {
                  const isFirstGroup = groupIdx === 0;
                  const prevGroup = isFirstGroup ? null : groups[groupIdx - 1];
                  const groupKey = group.chapter?.id ?? "ungrouped";
                  const isCollapsed = collapsedGroups.has(groupKey);
                  const isRoughChapter = group.chapter ? group.chapter.startDate === null : false;
                  const roughStopIds = sortGroupStops(group.stops)
                    .filter((s) => s.arriveDate === null)
                    .map((s) => s.id);

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
                        isRoughChapter ? (
                          // Rough chapter: sortable header + stops SortableContext
                          <SortableChapterHeader chapterId={group.chapter.id}>
                            {(dragHandle, setNodeRef, style) => (
                              <div
                                ref={setNodeRef}
                                style={{ ...style, borderLeftWidth: 4, borderLeftColor: chapterColourSwatch(group.chapter!.colour) }}
                                className="rounded-xl border border-border/60 overflow-hidden"
                              >
                                {/* Collapsible header */}
                                <button
                                  type="button"
                                  aria-expanded={!isCollapsed}
                                  aria-label={`${group.chapter!.name} chapter, ${isCollapsed ? "expand" : "collapse"}`}
                                  onClick={() => toggleGroup(groupKey)}
                                  className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                                >
                                  {dragHandle}
                                  <ChapterChip
                                    name={group.chapter!.name}
                                    colour={group.chapter!.colour}
                                  />
                                  <span className="text-xs text-muted-foreground flex-1">
                                    rough
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={pendingId === `firm-up-${group.chapter!.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFirmUp(group.chapter!.id);
                                    }}
                                  >
                                    <CalendarClock className="size-3.5" aria-hidden="true" />
                                    Set dates
                                  </Button>
                                  <span className="text-sm text-muted-foreground select-none" aria-hidden="true">
                                    {isCollapsed ? "▸" : "▾"}
                                  </span>
                                </button>

                                {/* Group body — stops SortableContext */}
                                {!isCollapsed && (
                                  <div className="flex flex-col gap-3 p-3">
                                    <SortableContext items={roughStopIds} strategy={verticalListSortingStrategy}>
                                      {sortGroupStops(group.stops).map((stop) => {
                                        const globalIdx = stops.indexOf(stop);
                                        const isFirst = globalIdx === 0;
                                        const isLast = globalIdx === stops.length - 1;
                                        return renderStop(stop, globalIdx, isFirst, isLast);
                                      })}
                                    </SortableContext>
                                    {(() => {
                                      const sorted = sortGroupStops(group.stops);
                                      return (
                                        <QuickAddStops tripId={tripId} chapterId={group.chapter!.id} forkId={forkId ?? null} afterStopId={sorted.length > 0 ? sorted[sorted.length - 1].id : null} />
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            )}
                          </SortableChapterHeader>
                        ) : (
                          // Dated chapter: static, no drag
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
                                {formatDateRange(group.chapter.startDate!, group.chapter.endDate!)}
                              </span>
                              <span className="text-sm text-muted-foreground select-none" aria-hidden="true">
                                {isCollapsed ? "▸" : "▾"}
                              </span>
                            </button>

                            {/* Group body — no SortableContext (dated stops are static) */}
                            {!isCollapsed && (
                              <div className="flex flex-col gap-3 p-3">
                                {sortGroupStops(group.stops).map((stop) => {
                                  const globalIdx = stops.indexOf(stop);
                                  const isFirst = globalIdx === 0;
                                  const isLast = globalIdx === stops.length - 1;
                                  return renderStop(stop, globalIdx, isFirst, isLast);
                                })}
                                {(() => {
                                  const sorted = sortGroupStops(group.stops);
                                  return (
                                    <QuickAddStops tripId={tripId} chapterId={group.chapter.id} forkId={forkId ?? null} afterStopId={sorted.length > 0 ? sorted[sorted.length - 1].id : null} />
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )
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
                          <SortableContext items={roughStopIds} strategy={verticalListSortingStrategy}>
                            {sortGroupStops(group.stops).map((stop) => {
                              const globalIdx = stops.indexOf(stop);
                              const isFirst = globalIdx === 0;
                              const isLast = globalIdx === stops.length - 1;
                              return renderStop(stop, globalIdx, isFirst, isLast);
                            })}
                          </SortableContext>
                          {(() => {
                            const sorted = sortGroupStops(group.stops);
                            return (
                              <QuickAddStops tripId={tripId} chapterId={null} forkId={forkId ?? null} afterStopId={sorted.length > 0 ? sorted[sorted.length - 1].id : null} />
                            );
                          })()}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </SortableContext>
            )}

            {/* Empty chapters: a freshly created chapter holds no stops yet, so
                groupStopsByChapter never emits it. Render those here (after the
                populated groups) so they're visible and droppable into. */}
            {hasChapters &&
              (() => {
                const presentChapterIds = new Set(
                  groups.map((g) => g.chapter?.id).filter(Boolean) as string[],
                );
                const emptyChapters = localChapters.filter(
                  (c) => !presentChapterIds.has(c.id),
                );
                return emptyChapters.map((chapter) => {
                  const groupKey = chapter.id;
                  const isCollapsed = collapsedGroups.has(groupKey);
                  const isRoughChapter = chapter.startDate === null;
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

                      {/* Group body — no stops yet, just the quick-add row.
                          Rough empty chapters get a droppable zone. */}
                      {!isCollapsed && (
                        <div className="flex flex-col gap-3 p-3">
                          {isRoughChapter ? (
                            <SortableContext items={[]} strategy={verticalListSortingStrategy}>
                              <EmptyRoughDroppable chapterId={chapter.id} />
                            </SortableContext>
                          ) : (
                            <p className="px-1 text-xs text-muted-foreground">
                              No stops yet — add one
                            </p>
                          )}
                          <QuickAddStops tripId={tripId} chapterId={chapter.id} forkId={forkId ?? null} />
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
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Other transport
                </h3>
                <p
                  className="text-xs text-muted-foreground/70"
                  title="These legs cross chapter boundaries or have an unlinked endpoint, so they're shown separately rather than between two stops."
                >
                  Between-chapter or unlinked legs
                </p>
              </div>
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
              {stops.some((s) => s.arriveDate === null) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFirmUpTrip}
                  loading={pendingId === "firm-up-trip"}
                >
                  <CalendarClock className="size-4" aria-hidden="true" />
                  Date all stops from start
                </Button>
              )}
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
        </DndContext>
      ) : (
        // ── Empty state: no Stops yet ──
        <EmptyState
          icon={MapPin}
          title="Add your first Stop"
          description="Add places you want to visit — rough stops to start, or dated stops once you know the plan."
          action={
            <div className="flex flex-col items-center gap-3 w-full max-w-md">
              <QuickAddStops tripId={tripId} chapterId={null} forkId={forkId ?? null} />
              <Button variant="outline" size="md" onClick={handleNewChapter}>
                <BookOpen className="size-4" aria-hidden="true" />
                New chapter
              </Button>
            </div>
          }
        />
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
        forkId={forkId ?? null}
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
          forkId={forkId ?? null}
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
          forkId={forkId ?? null}
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
          forkId={forkId ?? null}
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
          forkId={forkId ?? null}
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
          forkId={forkId ?? null}
        />
      )}

      {/* Chapter dialog — "Start a chapter here" (dated) or "+ New chapter" (rough) */}
      <ChapterFormDialog
        tripId={tripId}
        open={chapterDialogOpen}
        onOpenChange={setChapterDialogOpen}
        defaultStart={chapterDialogDefaults.defaultStart}
        defaultEnd={chapterDialogDefaults.defaultEnd}
        originStopId={chapterDialogDefaults.originStopId}
        forkId={forkId ?? null}
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

      {dialog}
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
