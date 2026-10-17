"use client";

import type { Route } from "next";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, CalendarClock, GripVertical, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import type { StopCardStop, ThingToDo } from "@/components/plan/types";
import { toItemCardItem } from "@/components/plan/types";
import { StopRow } from "@/components/plan/stop-row";
import { LegRow, LegPill } from "@/components/plan/leg-pill";
import { HomeBaseBookend } from "@/components/plan/home-base-bookend";
import { MobileStopRow } from "@/components/plan/mobile/mobile-stop-row";
import { ChapterDivider } from "@/components/plan/chapter-divider";
import { StopOpenBody, type ExtrasKind } from "@/components/plan/stop-open-body";
import { buildStopActions } from "@/components/plan/stop-actions";
import { isLoneOnDatedTrip } from "@/components/plan/lone-stop";
import { setSurprise, revealSurprise } from "@/server/actions/surprise";
import type { SurpriseView } from "@/lib/surprise";
import { stopSheetMeta } from "@/components/plan/mobile/stop-sheet-meta";
import { IdeaSheet } from "@/components/plan/idea-sheet";
import { stopHue } from "@/lib/stop-colours";
import { usePlanBody, useRegisterPlanActions } from "@/components/plan/plan-body";
import { claimDragHint, daySectionId } from "@/components/plan/day-section";
import { planCollisionDetection, POINTER_ACTIVATION, resolveItemDrop, scheduleInputFor, TOUCH_ACTIVATION, type ItemDrop } from "@/components/plan/plan-dnd";
import { changeoverPlaces, legLabel, missingLegLabel, legSlotKind } from "@/lib/plan/leg-label";
import { daySlots, type DaySlot } from "@/lib/plan/day-density";
import { stayStatus } from "@/lib/plan/plan-model";
import { AddStopSheet } from "@/components/plan/mobile/add-stop-sheet";
import { PlanRiseIn, RISE_IN_WINDOW_MS } from "@/components/plan/plan-rise-in";
import { ringId, scrollToId, whenScrollSettles } from "@/lib/scroll-to";
import { setDayCollapsed } from "@/lib/plan/day-collapse";
import { type TransportCardTransport } from "./transport-card";
import { HOME_ENDPOINT } from "./transport-endpoints";
import type { StopOption } from "./transport-form-dialog";
import { type AccommodationCardAccommodation } from "./accommodation-card";
import { AccommodationRow } from "./accommodation-row";
import type { ItemCardItem } from "./item-card";
import type { ReminderItem } from "@/server/actions/reminders";
import type { ReminderAbout } from "@/lib/reminder-about";
import { ChapterFormDialog } from "./chapter-form-dialog";
import { findOutboundLeg, findReturnLeg } from "@/lib/home-base";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { LG_UP, useMediaQuery } from "@/components/ui/use-media-query";
import { moveStop, toggleStopPin, makeStopRough } from "@/server/actions/stops";
import { deleteChapter, suggestChaptersFromCountries } from "@/server/actions/chapters";
import { scheduleItem } from "@/server/actions/items";
import { useUndoableAction } from "@/components/ui/use-undoable-action";
import { usePlanEditor } from "@/components/plan/use-plan-editor";
import { suggestResultToast } from "@/lib/suggest-toast";
import { suggestNextStopDates, formatDateRangeCompact, formatDayLabel, formatLongDate } from "@/lib/dates";
import { deleteTransport } from "@/server/actions/transport";
import { deleteAccommodation } from "@/server/actions/accommodation";
import { groupStopsByChapter, sortGroupStops } from "@/lib/chapters";
import { groupTransportsBySlot, HEAD_SLOT } from "@/lib/transport-anchor";
import type { TransportMode } from "@/lib/enum-values";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type { StopDayItem } from "@/lib/stop-days";
import type { TravellerLike } from "@/lib/traveller";
import type { CostRow } from "@/server/actions/costs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { NoteView } from "./note-thread";
import type { AttachmentView } from "./attachment-list";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Spec 2026-10-06 §P: the ten open-on-demand dialogs load when first opened,
// not with the Plan. Each mounts only while open (see the Dialogs block).
const StayDialog = dynamic(() => import("@/components/plan/stay-dialog").then((m) => m.StayDialog), { ssr: false });
const StopExtrasDialog = dynamic(() => import("@/components/plan/stop-extras-dialog").then((m) => m.StopExtrasDialog), { ssr: false });
const StopActionsSheet = dynamic(() => import("@/components/plan/stop-actions-sheet").then((m) => m.StopActionsSheet), { ssr: false });
const StopSheet = dynamic(() => import("@/components/plan/mobile/stop-sheet").then((m) => m.StopSheet), { ssr: false });
const StopFormDialog = dynamic(() => import("./stop-form-dialog").then((m) => m.StopFormDialog), { ssr: false });
const TransportFormDialog = dynamic(() => import("./transport-form-dialog").then((m) => m.TransportFormDialog), { ssr: false });
const AccommodationFormDialog = dynamic(() => import("./accommodation-form-dialog").then((m) => m.AccommodationFormDialog), { ssr: false });
const AddReminderDialog = dynamic(() => import("./add-reminder-dialog").then((m) => m.AddReminderDialog), { ssr: false });
const ItemFormDialog = dynamic(() => import("./item-form-dialog").then((m) => m.ItemFormDialog), { ssr: false });
const DeleteStopDialog = dynamic(() => import("./delete-stop-dialog").then((m) => m.DeleteStopDialog), { ssr: false });
const SurpriseDialog = dynamic(() => import("@/components/plan/surprise-dialog").then((m) => m.SurpriseDialog), { ssr: false });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccommodationCardAccommodationWithCosts
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
  anchorStopId?: string | null;
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
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
  /** The Trip's deadline date (ADR 0068: dated return leg, else hard end date), for the Add a stop consequence line. */
  hardEndDate?: string | null;
  /** Map of stopId → notes for that stop */
  notesByStopId?: Map<string, NoteView[]>;
  /** Map of transportId → notes for that transport */
  notesByTransportId?: Map<string, NoteView[]>;
  /** Map of accommodationId → notes for that accommodation */
  notesByAccommodationId?: Map<string, NoteView[]>;
  /** Map of stopId → attachments for that stop */
  attachmentsByStopId?: Map<string, AttachmentView[]>;
  /** Map of transportId → attachments for that transport */
  attachmentsByTransportId?: Map<string, AttachmentView[]>;
  /** Map of accommodationId → attachments for that accommodation */
  attachmentsByAccommodationId?: Map<string, AttachmentView[]>;
  /** Map of itemId → attachments for that item */
  attachmentsByItemId?: Map<string, AttachmentView[]>;
  /** Current authenticated user's ID */
  currentUserId?: string;
  /** The Trip's Travellers (CONTEXT.md "Surprise": who a Surprise can be for). */
  members?: TravellerLike[];
  /** Fork being edited (null = real plan). Threaded to all create actions. */
  forkId?: string | null;
  /**
   * Plan-owned things to do keyed by stopId (ADR 0022).
   * Feeds each open stop's ideas box.
   */
  thingsToDoByStopId?: Map<string, Array<{
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
    hiddenFromShares?: boolean;
    photoUrl?: string | null;
    surprise?: SurpriseView | null;
  }>>;
  /**
   * Costs keyed by item id for things-to-do edit pre-fill (ADR 0022).
   */
  thingsToDoItemCostsById?: Map<string, CostRow[]>;
  /** Scheduled items keyed by stopId (date != null) — drives each open stop's day strip. */
  dayItemsByStopId?: Map<string, StopDayItem[]>;
  /** Reminders keyed by stopId (Task 7) — drives the open body's reminders link. */
  remindersByStopId?: Map<string, ReminderItem[]>;
  /** Reminders keyed by itemId / transportId (spec F8) — listed in the edit dialogs. */
  remindersByItemId?: Map<string, ReminderItem[]>;
  remindersByTransportId?: Map<string, ReminderItem[]>;
  /**
   * Day titles (CONTEXT.md "Day title", Task 5) keyed by dateISO across the
   * whole plan — `lib/day-titles.ts`'s `titlesByDate`, serialised to a plain
   * object. Passed unchanged to every stop's day strip so a Changeover
   * day shows its title under both Stops regardless of which one owns it.
   */
  dayTitles?: Record<string, { title: string; stopId: string }>;
  /**
   * The trip's home base name — passed to TransportFormDialog so the picker
   * can offer "🏠 Home" as a departure/arrival option.
   */
  homeBaseName?: string | null;
  /** The trip's Home base IANA timezone — a Home end's times read in this zone. */
  homeTimezone?: string | null;
  /** Whether the trip returns to its Home base — drives the bottom bookend. */
  roundTrip?: boolean;
  /**
   * Whether chapters are opted in for this trip (spec 2026-08-24: chapters are
   * off by default for new trips). Defaults `true` so existing callers/tests
   * that don't pass it keep the pre-toggle behaviour.
   */
  chaptersEnabled?: boolean;
  /**
   * Whether the current Traveller owns this trip (or is an ADMIN_EMAILS
   * operator — see ADR 0045). Deleting a Stop is whole-branch destruction
   * (ARCH-DAT-1b) and is owner-only; this drives whether the stop menu's delete
   * control renders at all. Hiding is cosmetic — deleteStop's own server-side
   * gate is the real access control. Defaults `true` so existing
   * callers/tests that don't pass it keep rendering the delete control.
   */
  isOwner?: boolean;
}

/** Stable empty-array reference so the editor's rows don't churn identity on
 * every render while chapters are disabled or not passed (a fresh `[]` each
 * render would re-send the props to the plan editor every render). */
const EMPTY_CHAPTERS: ItineraryChapter[] = [];

// ---------------------------------------------------------------------------
// dnd-kit sub-components
// ---------------------------------------------------------------------------

/**
 * Wraps a stop row in a dnd-kit sortable context and hands it a grip handle.
 * A dated stop's handle shows only on hover/focus (it still drags, ADR 0021);
 * a rough stop's is always visible.
 */
function SortableStop({
  stop,
  chapterId,
  rough,
  children,
}: {
  stop: ItineraryStop;
  chapterId: string | null;
  rough: boolean;
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
      data-testid="drag-handle-stop"
      className={cn(
        "tap-target cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground focus:outline-none",
        !rough && "pointer-fine:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
      )}
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
 * The mobile list's sortable wrapper (PLAN.md §7.1, spec D7). Every stop
 * still joins the sortable context (so it shifts when a sibling drags past
 * it), but only a ROUGH stop is handed drag attributes/listeners — a dated
 * row's whole tap target opens the stop sheet, so it can't also long-press
 * to drag (the existing `TouchSensor` delay still gates the rough gesture).
 */
function SortableMobileStop({
  stop,
  chapterId,
  rough,
  children,
}: {
  stop: ItineraryStop;
  chapterId: string | null;
  rough: boolean;
  children: (dragProps?: React.HTMLAttributes<HTMLButtonElement>) => React.ReactNode;
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

  const dragProps = rough
    ? ({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>)
    : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      {children(dragProps)}
    </div>
  );
}

/**
 * Wraps a chapter divider in a dnd-kit sortable context.
 * Provides a grip handle to be rendered inside the divider.
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
      data-testid="drag-handle-chapter"
      className="tap-target cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground focus:outline-none"
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
      className={`min-h-8 rounded-md transition-colors ${isOver ? "bg-muted" : ""}`}
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

const noopSubscribe = () => () => {};
/** False on the server and during hydration, true after: a deep-linked `?stop=` opens only once hydrated. */
function useHydrated() {
  return React.useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * `/plan?add=transport&from=<id|home>&to=<id|home>` (spec 2026-10-06 §F —
 * Next steps and Flags for a missing leg) → the Add-transport form's
 * defaults. `home` is the Home base (only when the Trip has one); an id that
 * isn't a Stop on this Plan is dropped. A leg between two Stops anchors under
 * its departure Stop, as the plan's own "+ transport" slot does.
 */
export function transportDefaultsFromParams(
  from: string | null,
  to: string | null,
  stopIds: readonly string[],
  hasHomeBase: boolean,
): { fromStopId?: string; toStopId?: string; anchorStopId?: string } {
  const resolve = (v: string | null) =>
    v === "home" ? (hasHomeBase ? HOME_ENDPOINT : undefined) : v && stopIds.includes(v) ? v : undefined;
  const fromStopId = resolve(from);
  const toStopId = resolve(to);
  const betweenStops = fromStopId && toStopId && fromStopId !== HOME_ENDPOINT && toStopId !== HOME_ENDPOINT;
  return {
    ...(fromStopId ? { fromStopId } : {}),
    ...(toStopId ? { toStopId } : {}),
    ...(betweenStops ? { anchorStopId: fromStopId } : {}),
  };
}

export function ItineraryManager({
  tripId,
  initialStops,
  initialTransports,
  chapters = EMPTY_CHAPTERS,
  homeCurrency,
  tripStartDate,
  tripEndDate,
  hardEndDate,
  notesByStopId,
  notesByTransportId,
  notesByAccommodationId,
  attachmentsByStopId,
  attachmentsByTransportId,
  attachmentsByAccommodationId,
  attachmentsByItemId,
  currentUserId,
  members,
  forkId,
  thingsToDoByStopId,
  thingsToDoItemCostsById,
  dayItemsByStopId,
  dayTitles,
  remindersByStopId,
  remindersByItemId,
  remindersByTransportId,
  homeBaseName,
  homeTimezone,
  roundTrip,
  chaptersEnabled = true,
  isOwner = true,
}: ItineraryManagerProps) {
  const { confirm, dialog } = useConfirm();

  // Safety net: chapters are opt-in (spec 2026-08-24). Even if a caller passes
  // a non-empty `chapters` prop alongside `chaptersEnabled={false}` (a stale
  // prop combination), the disabled flag wins — no chapter bands render.
  const effectiveChapters = chaptersEnabled ? chapters : EMPTY_CHAPTERS;

  // ── The Plan's rows (card 2.G, spec Q7) ──
  // usePlanEditor owns them: server props are adopted when idle, held while a
  // write is pending, and compared by content; every drag, assign, nights and
  // date write settles or reverts through it.
  const serverRows = React.useMemo(
    () => ({ stops: initialStops, chapters: effectiveChapters, transports: initialTransports }),
    [initialStops, effectiveChapters, initialTransports],
  );
  const editor = usePlanEditor({ tripId, forkId: forkId ?? null, rows: serverRows });
  const { rows, newStopIds } = editor.state;
  const editorDispatch = editor.dispatch;
  // The drag-over preview (handleDragOver): the dragged Stop shown in the
  // container it hovers. A display concern only — never the editor's rows,
  // so it holds no props and is gone the moment the drag ends.
  const [dragOver, setDragOver] = React.useState<{ stopId: string; chapterId: string | null } | null>(null);
  const stops = React.useMemo(
    () => (dragOver ? rows.stops.map((s) => (s.id === dragOver.stopId ? { ...s, chapterId: dragOver.chapterId } : s)) : rows.stops),
    [rows.stops, dragOver],
  );
  const planChapters = rows.chapters;
  // Transports deleted optimistically, hidden until the refresh drops them (or the delete fails).
  const [hiddenTransportIds, setHiddenTransportIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const transports = React.useMemo(
    () => (hiddenTransportIds.size > 0 ? rows.transports.filter((t) => !hiddenTransportIds.has(t.id)) : rows.transports),
    [rows.transports, hiddenTransportIds],
  );

  // ── dnd-kit sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Stop dialog state ──
  const [editingStop, setEditingStop] = React.useState<StopCardStop | null>(null);
  const [addStopOpen, setAddStopOpen] = React.useState(false);
  const [addTransportDefaults, setAddTransportDefaults] = React.useState<{
    fromStopId?: string;
    toStopId?: string;
    anchorStopId?: string;
  } | null>(null);

  // `/plan?add=stop` (the desktop Home's "+ Add a stop") opens the add-Stop
  // dialog, and `?add=transport&from=&to=` the Add-transport one (spec
  // 2026-10-06 §F) — on arrival AND on any later client navigation that adds the
  // param while this editor stays mounted (final review #3). Tracked the
  // getDerivedStateFromProps way (compare during render, no setState in an
  // effect). The effect below then strips `add` from the URL so a reload or
  // Back doesn't reopen it.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const addParam = searchParams?.get("add") ?? null;
  const [seenAddParam, setSeenAddParam] = React.useState<string | null>(null);
  if (addParam !== seenAddParam) {
    setSeenAddParam(addParam);
    if (addParam === "stop") setAddStopOpen(true);
    if (addParam === "transport") {
      setAddTransportDefaults(
        transportDefaultsFromParams(
          searchParams?.get("from") ?? null,
          searchParams?.get("to") ?? null,
          stops.map((s) => s.id),
          Boolean(homeBaseName),
        ),
      );
    }
  }
  React.useEffect(() => {
    if (addParam !== "stop" && addParam !== "transport") return;
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("add");
    if (addParam === "transport") {
      next.delete("from");
      next.delete("to");
    }
    const qs = next.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
  }, [addParam, searchParams, router, pathname]);
  // ARCH-DAT-4: which Stop is pending the delete-preview dialog (itemises
  // the Accommodations/Costs/Attachments/Notes it will destroy) — replaces
  // the old generic "This can't be undone." confirm for this one flow.
  const [deletingStop, setDeletingStop] = React.useState<{ id: string; name: string } | null>(null);

  // ── Transport dialog state ──
  const [editingTransport, setEditingTransport] =
    React.useState<TransportCardTransport | null>(null);
  const [editingTransportCosts, setEditingTransportCosts] =
    React.useState<CostRow[] | undefined>(undefined);

  // ── Accommodation dialog state ──
  const [editingAccommodation, setEditingAccommodation] =
    React.useState<AccommodationCardAccommodation | null>(null);
  const [editingAccommodationCosts, setEditingAccommodationCosts] =
    React.useState<CostRow[] | undefined>(undefined);
  const [editingAccStop, setEditingAccStop] =
    React.useState<ItineraryStop | null>(null);
  const [addAccommodationStop, setAddAccommodationStop] =
    React.useState<ItineraryStop | null>(null);
  // Set while we're waiting for a rough stop's leg to be dated so we can open
  // the accommodation form the user originally asked for once it reappears.
  const [pendingAccommodationStopId, setPendingAccommodationStopId] =
    React.useState<string | null>(null);

  // ── Add reminder dialog state (Task 7) ──
  const [addReminderAbout, setAddReminderAbout] =
    React.useState<ReminderAbout | null>(null);

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

  // ── Assign-to-chapter dialog state ──
  const [assigningStop, setAssigningStop] = React.useState<StopCardStop | null>(null);
  // CONTEXT.md Surprise: the Stop whose "Surprise for…" picker is open.
  const [surpriseStopId, setSurpriseStopId] = React.useState<string | null>(null);

  // ── Pending mutations ──
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [, startSuggestTransition] = React.useTransition();

  // ── Open-body dialogs (PLAN.md §4) ──
  const [itemForm, setItemForm] = React.useState<
    | { mode: "create"; stopId: string; date?: string; unscheduled?: boolean }
    | { mode: "edit"; item: ItemCardItem }
    | null
  >(null);
  // The stay detail view (spec 2026-10-05 §D), on one Accommodation — or, with a null id, the first stay / "No bed yet".
  const [stayView, setStayView] = React.useState<{ stopId: string; accommodationId: string | null } | null>(null);
  const [extras, setExtras] = React.useState<{ stopId: string; kind: ExtrasKind } | null>(null);
  // The day slot a plan just landed on, pulsed briefly (PLAN.md §4.2).
  const [flash, setFlash] = React.useState<{ stopId: string; date: string } | null>(null);
  const flashTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );
  function flashSlot(stopId: string, date: string) {
    setFlash({ stopId, date });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 400);
  }
  /**
   * MOTION.md P7 + spec 2026-10-04 §A: the day an idea landed on flashes. On
   * desktop it first opens (if folded) and scrolls into view, and flashes once
   * the scroll settles, so a day far down the card isn't flashed off-screen.
   * Below lg there are no day sections to reveal.
   */
  function revealDay(stopId: string, dateISO: string) {
    if (!window.matchMedia?.("(min-width: 1024px)").matches) {
      flashSlot(stopId, dateISO);
      return;
    }
    setDayCollapsed(tripId, stopId, dateISO, false);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    requestAnimationFrame(() => {
      scrollToId(daySectionId(stopId, dateISO), { reduced });
      whenScrollSettles(reduced, () => flashSlot(stopId, dateISO));
    });
  }
  // The plan being dragged, lifted into the DragOverlay (MOTION.md P6).
  const [activeDrag, setActiveDrag] = React.useState<{ type?: string; title?: string } | null>(null);
  // P1's stagger is for the first paint only: a row that remounts later (a
  // chapter move) must not rise in again.
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), RISE_IN_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, []);
  React.useEffect(() => {
    if (newStopIds.length === 0) return;
    // After the commit that rendered the new row in this breakpoint's list;
    // ringId skips an id that isn't there. Several at once (a variant switch)
    // only rise in.
    if (newStopIds.length === 1) {
      const id = newStopIds[0];
      void Promise.resolve().then(() => {
        ringId(`stop-${id}`);
        ringId(`m-stop-${id}`);
      });
    }
    // Off again before a hidden list could be shown and replay the entrance.
    const t = window.setTimeout(() => editorDispatch({ type: "flashed" }), RISE_IN_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, [newStopIds, editorDispatch]);
  // Set once the mobile list pushes `?stop=<id>` for the stop sheet (Task 18)
  // — lets that sheet tell "opened from this list" apart from "arrived via a
  // real navigation/reload" without re-reading history state itself.
  const pushedSheetRef = React.useRef(false);
  const hydrated = useHydrated();
  // Spec 2026-10-06 §D: after hydration only the list for this breakpoint
  // renders (one DndContext). `null` — the server render and hydration —
  // keeps both, matching the server's markup; the other list unmounts on
  // the first client render.
  const lgUp = useMediaQuery(LG_UP);
  const showDesktopList = lgUp !== false;
  const showMobileList = lgUp !== true;
  // `?stop=<id>` (a Flag or Next step's link, lib/next-steps.ts flagHref) is
  // the phone Stop sheet's open state. On desktop the sheet is the wrong UI —
  // there a Stop opens in place (the `#open=` fold, components/plan/plan-body.tsx),
  // so the effect below hands the param to PlanBody and strips it. `null`
  // (hydration) does neither until the breakpoint resolves.
  const stopParam = hydrated ? (searchParams?.get("stop") ?? null) : null;
  const sheetStopId = lgUp === false ? stopParam : null;
  const desktopStopParam = lgUp === true ? stopParam : null;
  const [actionsStopId, setActionsStopId] = React.useState<string | null>(null);
  const [openIdea, setOpenIdea] = React.useState<{ stopId: string; idea: ThingToDo } | null>(null);

  // Once-a-session drag hint: sessionStorage is read only after mount so the
  // first client render matches the server's.
  const [dragHint, setDragHint] = React.useState(false);
  React.useEffect(() => {
    void Promise.resolve().then(() => setDragHint(claimDragHint()));
  }, []);

  const planBody = usePlanBody();

  React.useEffect(() => {
    if (desktopStopParam === null) return;
    // Scrolls the row into view, then opens it and records `#open=` (PlanBody.jumpTo).
    if (stops.some((s) => s.id === desktopStopParam)) planBody.jumpTo(desktopStopParam);
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("stop");
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}` as Route, { scroll: false });
    // Once per arriving param; the rest is read as it stands then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopStopParam]);

  // ── Stop handlers ──
  // ARCH-DAT-4: opens the delete-preview dialog (DeleteStopDialog) instead of
  // deleting directly — it fetches previewStopDeletion, itemises what would
  // be destroyed, and performs the deleteStop call itself once the Traveller
  // confirms.
  function handleDeleteStop(stopId: string) {
    const stop = stops.find((s) => s.id === stopId);
    setDeletingStop({ id: stopId, name: stop?.name ?? "this stop" });
  }

  // Card 2.H: every write below goes through useUndoableAction, so a refusal
  // (`success: false`) and a rejection (network, thrown server error) both
  // toast — moveStop, toggleStopPin and makeStopRough used to ignore a refusal.
  // `pendingId` stays the "which row is busy" key, set around `run`.
  async function busy<T>(id: string, work: () => Promise<T>): Promise<T> {
    setPendingId(id);
    try {
      return await work();
    } finally {
      setPendingId(null);
    }
  }

  const moveStopAction = useUndoableAction({
    persist: ({ stopId, direction }: { stopId: string; direction: "up" | "down" }) => moveStop(stopId, direction),
  });
  function handleMoveStop(stopId: string, direction: "up" | "down") {
    return busy(stopId, () => moveStopAction.run({ stopId, direction }));
  }

  const togglePinAction = useUndoableAction({ persist: (stopId: string) => toggleStopPin(stopId) });
  function handleTogglePin(stopId: string) {
    return busy(stopId, () => togglePinAction.run(stopId));
  }

  /** "Make it a surprise": opens "Surprise for…", everyone but the planner ticked. */
  function handleMakeSurprise(stopId: string) {
    // Without the member list there is no one to pick: the server defaults to everyone else.
    if (!members || !currentUserId) void handleConfirmSurprise(stopId, undefined);
    else setSurpriseStopId(stopId);
  }

  const setSurpriseAction = useUndoableAction({
    persist: ({ stopId, forIds }: { stopId: string; forIds: string[] | undefined }) =>
      setSurprise({ kind: "STOP", id: stopId, forIds }),
    failure: "Couldn't make that a surprise.",
  });
  async function handleConfirmSurprise(stopId: string, forIds: string[] | undefined) {
    setSurpriseStopId(null);
    await busy(stopId, () => setSurpriseAction.run({ stopId, forIds }));
  }

  const revealSurpriseAction = useUndoableAction({
    persist: (stopId: string) => revealSurprise({ kind: "STOP", id: stopId }),
    failure: "Couldn't reveal that surprise.",
  });

  async function handleRevealSurprise(stopId: string) {
    const stop = stops.find((s) => s.id === stopId);
    const confirmed = await confirm({
      title: `Reveal the surprise in ${stop?.name ?? "this stop"}?`,
      description: "Everyone on the trip will see what's inside, and the history of how it was planned.",
      confirmLabel: "Reveal the surprise",
    });
    if (!confirmed) return;
    await busy(stopId, () => revealSurpriseAction.run(stopId));
  }

  const makeRoughAction = useUndoableAction({ persist: (stopId: string) => makeStopRough(stopId) });
  async function handleMakeRough(stopId: string) {
    const stop = stops.find((s) => s.id === stopId);
    const confirmed = await confirm({
      title: `Make "${stop?.name ?? "this stop"}" rough again?`,
      description: "Its dates will be cleared and later stops will re-flow.",
      confirmLabel: "Make rough",
      destructive: false,
    });
    if (!confirmed) return;
    await busy(stopId, () => makeRoughAction.run(stopId));
  }

  function handleAdjustDates(stop: StopCardStop) {
    setAdjustingStop(stop);
  }

  // Opens the stay detail view (spec 2026-10-05 §D) for this Stop, on this
  // Accommodation — or, with no id, on the first stay / ready to add one.
  // The single reusable path: today the stay panel block uses it, and a
  // folded Stop's stay chip will too.
  function openStayView(stop: ItineraryStop, accommodationId: string | null = null) {
    setStayView({ stopId: stop.id, accommodationId });
  }

  // Accommodation needs a real check-in and check-out, so a rough stop can't
  // hold one yet. Rather than hiding the button (ADR-less UI decision recorded
  // in the plan: a hidden control reads as a missing feature), explain the
  // blocker and offer the fix. Primary action dates just this leg; the trip-wide
  // control is named as the fallback for when the leg has no anchor to flow from.
  async function handleAddAccommodationClick(stop: ItineraryStop) {
    if (stop.arriveDate && stop.departDate) {
      setAddAccommodationStop(stop);
      return;
    }

    const proceed = await confirm({
      title: `${stop.name} has no dates yet`,
      description: (
        <>
          Accommodation needs a check-in and check-out. Firm up this leg
          first to go straight to the form.
          <br />
          <br />
          No start date to work from? Use{" "}
          <strong>Firm up all stops</strong> at the top of the plan.
        </>
      ),
      confirmLabel: "Firm up this leg",
      destructive: false,
    });
    if (!proceed) return;

    setPendingAccommodationStopId(stop.id);
    // skipConfirm: the nudge above already asked for consent, so a second
    // "Firm up this chapter's stops?" dialog would describe one step as two.
    // handleFirmUp has no other caller relying on that second confirm firing
    // for this call, so it's safe to bypass it here.
    const dated = await handleFirmUp(stop.chapterId ?? null, { skipConfirm: true });
    if (!dated) {
      // Cancelled, or firmUpSegment didn't actually date this stop (e.g. no
      // anchor date) — don't leave a stale pending id watching stops
      // forever; that would pop the form open for a stop the user isn't
      // interacting with the next time it gets dated by anything else.
      setPendingAccommodationStopId(null);
    }
  }

  // Once the leg has been dated, the stop we were asked to add accommodation to
  // comes back with real dates — that's our cue to open the form the user
  // originally asked for, so the nudge isn't a dead end. The setState calls
  // are deferred inside a microtask (never synchronously in the effect body)
  // so react-hooks/set-state-in-effect is satisfied — same idiom used
  // elsewhere in this codebase (e.g. promote-fork-dialog.tsx).
  React.useEffect(() => {
    if (!pendingAccommodationStopId) return;
    const dated = stops.find(
      (s) => s.id === pendingAccommodationStopId && s.arriveDate && s.departDate,
    );
    if (!dated) return;
    void Promise.resolve().then(() => {
      setAddAccommodationStop(dated);
      setPendingAccommodationStopId(null);
    });
  }, [stops, pendingAccommodationStopId]);

  // Firm up a whole leg — dates every rough stop in a chapter (id) or the
  // ungrouped run (null). The core rough → scheduled transition. Returns
  // whether the segment actually got dated, so callers (e.g. the
  // accommodation nudge) know whether to keep waiting on the result.
  // skipConfirm lets a caller that already obtained consent of its own
  // (the accommodation nudge) bypass this function's own confirm dialog,
  // so the flow reads as one step instead of two.
  async function handleFirmUp(
    chapterId: string | null,
    options?: { skipConfirm?: boolean },
  ): Promise<boolean> {
    // Compute rough stop count and anchor for the confirm summary.
    const chapterStops = chapterId
      ? stops.filter((s) => s.chapterId === chapterId)
      : stops.filter((s) => s.chapterId === null);
    const roughCount = chapterStops.filter((s) => s.arriveDate === null).length;

    // Anchor: the depart date of the last scheduled stop before this chapter's
    // first stop in the global order, or tripStartDate, or a generic fallback.
    const firstChapterStopIdx = stops.findIndex(
      (s) => chapterId ? s.chapterId === chapterId : s.chapterId === null,
    );
    let anchorLabel = "the trip start";
    if (firstChapterStopIdx > 0) {
      const precedingDated = stops
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
    if (!options?.skipConfirm) {
      const confirmed = await confirm({
        title: "Firm up this chapter's stops?",
        description: `This will date ${roughCount} rough ${stopWord} from ${anchorLabel}. You can make any stop rough again afterwards.`,
        confirmLabel: "Firm up",
        destructive: false,
      });
      if (!confirmed) return false;
    }

    return busy(`firm-up-${chapterId ?? "ungrouped"}`, () => editor.firmUp({ chapterId }));
  }

  // Date every rough stop across the whole trip from the start date, in one action.
  async function handleFirmUpTrip() {
    const roughCount = stops.filter((s) => s.arriveDate === null).length;
    const anchorLabel = tripStartDate ? formatLongDate(tripStartDate) : "the trip start";
    const stopWord = roughCount === 1 ? "stop" : "stops";

    const confirmed = await confirm({
      title: "Firm up the whole trip?",
      description: `This will date ${roughCount} rough ${stopWord} from ${anchorLabel}. You can make any stop rough again afterwards.`,
      confirmLabel: "Firm up",
      destructive: false,
    });
    if (!confirmed) return;

    await busy("firm-up-trip", () => editor.firmUp({}));
  }

  // ── Chapter handlers ──
  const deleteChapterAction = useUndoableAction({
    persist: (chapterId: string) => deleteChapter(chapterId),
    failure: "Couldn't remove that chapter.",
  });
  async function handleDeleteChapter(chapterId: string) {
    const chapter = planChapters.find((c) => c.id === chapterId);
    const confirmed = await confirm({
      title: `Remove "${chapter?.name ?? "this chapter"}"?`,
      description: "The chapter will be removed. Any stops it contains will become ungrouped.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    await busy(`delete-chapter-${chapterId}`, () => deleteChapterAction.run(chapterId));
  }

  // ── Transport handlers ──
  // Optimistic: the leg disappears at once; a failure shows it again.
  const deleteTransportAction = useUndoableAction({
    apply: (transportId: string) => setHiddenTransportIds((prev) => new Set(prev).add(transportId)),
    persist: (transportId) => deleteTransport(transportId),
    revert: (transportId) =>
      setHiddenTransportIds((prev) => {
        const next = new Set(prev);
        next.delete(transportId);
        return next;
      }),
    failure: "Couldn't delete that transport.",
  });
  async function handleDeleteTransport(transportId: string) {
    const t = transports.find((tr) => tr.id === transportId);
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
    await busy(transportId, () => deleteTransportAction.run(transportId));
  }

  // ── Accommodation handlers ──
  const deleteAccommodationAction = useUndoableAction({
    persist: (accId: string) => deleteAccommodation(accId),
    failure: "Couldn't delete that stay.",
  });
  async function handleDeleteAccommodation(accId: string) {
    const acc = stops.flatMap((s) => s.accommodations).find((a) => a.id === accId);
    const confirmed = await confirm({
      title: `Delete "${acc?.name ?? "this accommodation"}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    await busy(accId, () => deleteAccommodationAction.run(accId));
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

  // Assign a rough stop to a chapter (or null = Ungrouped) from the picker
  // dialog: optimistic, reverted and toasted on a refusal or a rejection.
  async function handleAssign(stopId: string, chapterId: string | null) {
    setAssigningStop(null);
    await editor.assign({ stopId, chapterId });
  }

  // Open the "+ New chapter" dialog with NO default dates (creates a rough chapter).
  function handleNewChapter() {
    setChapterDialogDefaults({});
    setChapterDialogOpen(true);
  }

  // Suggest chapters from countries and toast the outcome.
  // suggestChaptersFromCountries reads then writes with no lock, so a second
  // call while one is in flight (the header and mobile menus share this)
  // would duplicate dated chapters. A ref, not state: it must block a click
  // landing before the next render.
  const suggestingRef = React.useRef(false);
  // `run` never rejects, so nothing thrown inside the transition can unmount
  // the Plan page into plan/error.tsx for an action that changed nothing.
  const suggestAction = useUndoableAction({
    persist: (id: string) => suggestChaptersFromCountries(id),
    done: (_id, result) => suggestResultToast(result),
    failure: "Couldn't suggest chapters.",
  });
  function handleSuggestChapters() {
    if (suggestingRef.current) return;
    suggestingRef.current = true;
    startSuggestTransition(async () => {
      try {
        await suggestAction.run(tripId);
      } finally {
        suggestingRef.current = false;
      }
    });
  }

  // Schedule an idea onto a day, keeping any times it already carries.
  // Things-to-do can carry times (kept on unschedule "to make undo
  // lossless" — see unscheduleItem's doc comment in server/actions/items.ts).
  // scheduleItem's in-place branch overwrites startTime/endTime wholesale
  // when absent from the input, so pass the thing's existing times through
  // explicitly or picking a day silently wipes them.
  const scheduleThingAction = useUndoableAction({
    persist: ({ thing, dateISO }: { thing: ThingToDo; dateISO: string }) =>
      scheduleItem(thing.id, {
        date: dateISO,
        ...(thing.startTime ? { startTime: thing.startTime } : {}),
        ...(thing.endTime ? { endTime: thing.endTime } : {}),
      }),
    failure: "Couldn't schedule it.",
  });
  async function handleScheduleThing(thing: ThingToDo, dateISO: string) {
    if (!(await scheduleThingAction.run({ thing, dateISO }))) return;
    // MOTION.md P7: the day it landed on opens, comes into view and flashes, as a dropped plan's does (P6).
    if (thing.stopId) revealDay(thing.stopId, dateISO);
  }

  // A plan dragged onto another day of its stop's strip (spec D5): it keeps
  // its times, the target slot pulses, and Undo puts it back where it was.
  const moveItemAction = useUndoableAction({
    persist: (drop: ItemDrop) => scheduleItem(drop.itemId, scheduleInputFor(drop.to, drop.from)),
    undo: (drop) => scheduleItem(drop.itemId, scheduleInputFor(drop.from.date, drop.from)),
    done: (drop) => ({ title: `Moved to ${formatDayLabel(drop.to).replace(/ [A-Z][a-z]{2}$/, "")}` }),
    failure: "Couldn't move it.",
  });
  async function handleMoveItem(drop: ItemDrop) {
    if (await moveItemAction.run(drop)) flashSlot(drop.stopId, drop.to);
  }

  useRegisterPlanActions({
    addStop: () => setAddStopOpen(true),
    newChapter: handleNewChapter,
    suggestChapters: handleSuggestChapters,
  });

  // Save handler for the adjust-dates dialog (ripple path for dated stops).
  // A date edit is a first-class ripple (ADR 0038): it collision-pushes later
  // stops server-side and returns the same changed/conflicts/payload shape as
  // a drag reorder, so it gets the same toast + Undo treatment. The dialog
  // stays open on a refusal so the dates can be fixed (spec 2026-10-06 §E).
  async function handleSaveAdjustDates(
    stopId: string,
    dates: { arriveDate: string; departDate: string },
  ) {
    const name = stops.find((s) => s.id === stopId)?.name ?? "stop";
    if (await busy(stopId, () => editor.setDates({ stopId, dates, name }))) setAdjustingStop(null);
  }

  // Spec 2026-10-06 §N: −/+ nights from the Stop header and phone sheet. Rough:
  // writes nights; scheduled: moves depart and ripples (never moving a Pinned
  // Stop — that's the server's ripple rule), with the same Undo toast as a drag.
  async function handleSetNights(stopId: string, nights: number) {
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return;
    await editor.setNights({ stopId, nights, name: stop.name });
  }

  // ── Derived data ── (reads the editor's rows, so drags update instantly)
  // Each Stop's plan position, looked up once per render rather than an
  // indexOf per row (spec 2026-10-06 §D).
  const stopIndex = new Map(stops.map((s, i) => [s.id, i] as const));
  // ADR 0049 rule 3: a Changeover day's plan names its owning Stop on the other card.
  const stopNames = new Map(stops.map((s) => [s.id, s.name] as const));
  const stopOptions: StopOption[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
    sortOrder: s.sortOrder,
    arriveDate: s.arriveDate ?? null,
    departDate: s.departDate ?? null,
  }));
  const hasChapters = planChapters.length > 0;

  // ── Home base bookends (see ADR 0032) ──
  // The Home base frames the plan: its card is pinned above the first stop
  // (with the outbound leg) and, on a round trip, below the last (with the
  // return leg). Home legs are excluded from legsBySlot via bookendLegIds.
  const hasHomeBase = Boolean(homeBaseName);
  const firstStop = stops.length > 0 ? stops[0] : null;
  const lastStop = stops.length > 0 ? stops[stops.length - 1] : null;
  const outboundLeg = findOutboundLeg(transports, firstStop?.id ?? null);
  const returnLeg = findReturnLeg(transports, lastStop?.id ?? null);
  // A return bookend renders on a round trip with a Home base and a last Stop.
  // It owns the end of the plan's add-transport affordance: no generic slot
  // after the last Stop and no standalone "Add transport" below it (ADR 0032
  // amendment 2026-09-29 — at most one prompt per bookend).
  const hasReturnBookend = hasHomeBase && Boolean(roundTrip) && lastStop != null;
  const bookendLegIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (outboundLeg) ids.add(outboundLeg.id);
    if (returnLeg) ids.add(returnLeg.id);
    return ids;
  }, [outboundLeg, returnLeg]);

  /**
   * Transports grouped by their anchor slot (stop id or HEAD_SLOT).
   * Home bookend legs are excluded via bookendLegIds.
   */
  const legsBySlot = React.useMemo(
    () => groupTransportsBySlot(transports, stops, bookendLegIds),
    [transports, stops, bookendLegIds],
  );

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
    () => groupStopsByChapter(stops, planChapters),
    [stops, planChapters],
  );

  // ---------------------------------------------------------------------------
  // Drag handlers
  // ---------------------------------------------------------------------------

  /**
   * onDragOver: preview a stop drag across containers — the dragged stop shows
   * in the hovered container. Display only (`dragOver`): the editor's rows
   * are untouched until the drop.
   */
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.type !== "stop") return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Over its own preview (closestCenter doesn't skip the active stop): the
    // container shown is still right — no change, or the preview ping-pongs.
    if (overId === activeId) return;

    const activeStop = rows.stops.find((s) => s.id === activeId);
    if (!activeStop) return;
    // ADR 0038: a pinned scheduled stop's drag is blocked outright on drop —
    // so no preview either, and a blocked drop never leaves the stop shown
    // in a chapter it was only hovered over.
    if (activeStop.arriveDate !== null && activeStop.pinned) return;

    // The over element is either a stop (use its chapterId) or a droppable
    // container id (the chapterId, or "ungrouped").
    const overStop = rows.stops.find((s) => s.id === overId);
    const targetChapterId: string | null = overStop ? overStop.chapterId : overId === "ungrouped" ? null : overId;

    // A ROUGH stop can't move into a DATED chapter (the server rejects it too);
    // a DATED stop CAN join a dated chapter (ADR 0021).
    const targetChapter = targetChapterId ? planChapters.find((c) => c.id === targetChapterId) : null;
    if (activeStop.arriveDate === null && targetChapter && targetChapter.startDate !== null) return;

    const shown = stops.find((s) => s.id === activeId)?.chapterId ?? null;
    if (shown === targetChapterId) return;
    setDragOver(targetChapterId === activeStop.chapterId ? null : { stopId: activeId, chapterId: targetChapterId });
  }

  function handleDragCancel() {
    setActiveDrag(null);
    setDragOver(null);
  }

  /**
   * onDragEnd: persist the drop through the plan editor (which never rejects).
   */
  async function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    setDragOver(null);
    const { active, over } = event;
    if (!over) return;

    const drop = resolveItemDrop(active.data.current, over.data.current);
    if (active.data.current?.type === "item") {
      if (drop) await handleMoveItem(drop);
      return;
    }

    const activeType = active.data.current?.type as "stop" | "chapter" | undefined;
    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeType === "stop") {
      const activeStop = rows.stops.find((s) => s.id === activeId);
      if (!activeStop) return;
      await editor.reorder({
        activeId,
        overId,
        // The drop container when `over` isn't another Stop (that Stop's own
        // chapter wins). Dropped on its own preview: the container it was shown in
        // (this closure's `dragOver` is the hover's, despite setDragOver(null) above).
        chapterId: overId === activeId
          ? (dragOver ? dragOver.chapterId : activeStop.chapterId)
          : overId === "ungrouped" ? null : overId,
        movedName: activeStop.name,
      });
    } else if (activeType === "chapter") {
      const activeChapter = planChapters.find((c) => c.id === activeId);
      if (!activeChapter) return;
      await editor.reorderChapters({ activeId, overId, movedName: activeChapter.name });
    }
  }

  // ---------------------------------------------------------------------------
  // Desktop list render helpers (PLAN.md §1.3–§4)
  // ---------------------------------------------------------------------------

  function renderLegPill(t: ItineraryTransport, compact?: boolean) {
    return (
      <LegPill
        key={t.id}
        compact={compact}
        label={legLabel(t, stops, homeBaseName, homeTimezone)}
        onClick={() => {
          setEditingTransport(enrichTransport(t, stops));
          setEditingTransportCosts(t.costs);
        }}
      />
    );
  }

  // A strip of one or more legs, metro-style (spec 2026-10-05 §F): legs stack
  // in slot (travel) order and a change-over shows only where one leg's
  // arrival place is already the next one's departure place.
  function renderLegStack(legs: ItineraryTransport[], compact?: boolean) {
    return (
      <LegRow kind="legs" compact={compact} changeovers={changeoverPlaces(legs)}>
        {legs.map((t) => renderLegPill(t, compact))}
      </LegRow>
    );
  }

  // The strip between a stop and the next (PLAN.md §2). After the last stop
  // there is no prompt — only any legs already anchored there. Shared by the
  // desktop list and the mobile list (Task 17), which renders the same
  // choice with `compact` LegRow/LegPill.
  function legNodes(stop: ItineraryStop, globalIdx: number, compact: boolean) {
    const legs = legsBySlot.get(stop.id) ?? [];
    const next = stops[globalIdx + 1] ?? null;
    if (!next) return legs.length > 0 ? renderLegStack(legs, compact) : null;
    switch (legSlotKind(stop, next, legs.length)) {
      case "legs":
        return renderLegStack(legs, compact);
      case "missing":
        return (
          <LegRow kind="missing" compact={compact}>
            <LegPill
              compact={compact}
              label={missingLegLabel(stop, next)}
              onClick={() => setAddTransportDefaults({ fromStopId: stop.id, toStopId: next.id, anchorStopId: stop.id })}
            />
          </LegRow>
        );
      default:
        return <LegRow kind="line" compact={compact} />;
    }
  }

  function renderLegAfter(stop: ItineraryStop, globalIdx: number) {
    return legNodes(stop, globalIdx, false);
  }

  // Pushes `?stop=<id>` onto the URL (spec §D3) so the stop sheet (Task 18)
  // opens from a shareable/back-navigable state instead of local component
  // state. A plain pushState (not router.push) so it doesn't trigger a server
  // round-trip just to open a client sheet.
  function openStopSheet(stopId: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("stop", stopId);
    pushedSheetRef.current = true;
    window.history.pushState(null, "", `${pathname}?${params.toString()}${window.location.hash}`);
  }

  // Back out of the sheet: pop our own entry so the browser's Back stays in
  // step; an arrived-at `?stop=` (deep link, reload) has no entry of ours to
  // pop, so strip the param in place instead.
  function closeStopSheet() {
    if (pushedSheetRef.current) {
      pushedSheetRef.current = false;
      window.history.back();
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("stop");
    window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
  }

  function slotsFor(stop: ItineraryStop, globalIdx: number): DaySlot[] {
    if (!stop.arriveDate || !stop.departDate) return [];
    return daySlots(
      { arriveDate: stop.arriveDate, departDate: stop.departDate },
      dayItemsByStopId?.get(stop.id) ?? [],
      dayTitles,
      {
        prevDepartDate: stops[globalIdx - 1]?.departDate,
        nextArriveDate: stops[globalIdx + 1]?.arriveDate,
      },
    );
  }

  function stopMenuGroups(stop: ItineraryStop, globalIdx: number) {
    return buildStopActions(
      stop,
      {
        isFirst: globalIdx === 0,
        isLast: globalIdx === stops.length - 1,
        isPending: pendingId === stop.id,
        isOwner,
        chaptersEnabled,
        // A Fork's Stop is not in the real plan, so no Reminder can hang off it.
        canRemind: !forkId,
        notesCount: notesByStopId && currentUserId ? (notesByStopId.get(stop.id)?.length ?? 0) : null,
        filesCount: attachmentsByStopId ? (attachmentsByStopId.get(stop.id)?.length ?? 0) : null,
        surprise: stop.surprise ?? null,
        currentUserId,
        // ADR 0073: a dated Trip's only Stop keeps the Trip's dates.
        loneOnDatedTrip: isLoneOnDatedTrip(stops.length, tripStartDate, tripEndDate),
      },
      {
        onEdit: () => setEditingStop(stop),
        onAdjustDates: () => handleAdjustDates(stop),
        onGiveDates: () => handleAdjustDates(stop),
        onTogglePin: () => handleTogglePin(stop.id),
        onMakeRough: () => handleMakeRough(stop.id),
        onMoveUp: () => handleMoveStop(stop.id, "up"),
        onMoveDown: () => handleMoveStop(stop.id, "down"),
        onStartChapter: () => handleStartChapterHere(stop),
        onAssignChapter: () => setAssigningStop(stop),
        onAddReminder: () => setAddReminderAbout({ stopId: stop.id }),
        onNotes: () => setExtras({ stopId: stop.id, kind: "notes" }),
        onFiles: () => setExtras({ stopId: stop.id, kind: "files" }),
        onDelete: () => handleDeleteStop(stop.id),
        onMakeSurprise: () => handleMakeSurprise(stop.id),
        onRevealSurprise: () => void handleRevealSurprise(stop.id),
      },
    );
  }

  // The existing accommodation rows, hosted by the phone sheet's Stay tab.
  // Dated stops only: a rough stop has no check-in window to hold one.
  function renderAccommodationRows(stop: ItineraryStop) {
    if (!stop.arriveDate || !stop.departDate) return null;
    return stop.accommodations.map((acc) => (
      <AccommodationRow
        key={acc.id}
        accommodation={acc}
        stop={{ arriveDate: stop.arriveDate!, departDate: stop.departDate! }}
        isPending={pendingId === acc.id}
        onEdit={(a) => {
          setEditingAccommodation(a);
          setEditingAccommodationCosts(acc.costs);
          setEditingAccStop(stop);
        }}
        onDelete={handleDeleteAccommodation}
        costs={acc.costs}
        tripId={tripId}
        homeCurrency={homeCurrency}
        notes={notesByAccommodationId?.get(acc.id) ?? []}
        attachments={attachmentsByAccommodationId?.get(acc.id) ?? []}
        currentUserId={currentUserId}
        forkId={forkId ?? null}
      />
    ));
  }

  function renderDesktopStop(stop: ItineraryStop, globalIdx: number) {
    const rough = !stop.arriveDate;
    const items = dayItemsByStopId?.get(stop.id) ?? [];
    const stay = stayStatus(stop, stop.accommodations);
    const ideas = thingsToDoByStopId?.get(stop.id) ?? [];
    const isPending = pendingId === stop.id;
    const menuGroups = stopMenuGroups(stop, globalIdx);
    const open = planBody.isOpen(stop.id);
    // CONTEXT.md Surprise: the surprised look at the outside but touch nothing.
    const surprised = stop.surprise?.youAreSurprised ?? false;

    return (
      <React.Fragment key={stop.id}>
        <PlanRiseIn index={entered ? undefined : globalIdx} className={cn(newStopIds.includes(stop.id) && "tp-rise-in")}>
          <SortableStop stop={stop} chapterId={stop.chapterId} rough={rough}>
            {(dragHandle) => (
              <StopRow
                stop={stop}
                number={globalIdx + 1}
                open={open}
                onToggle={() => planBody.toggle(stop.id)}
                onOpenStay={surprised ? undefined : () => {
                  // Spec 2026-10-05 §G: open the Stop and its stay detail view on the
                  // chip's stay — or, with none, ready to add one — via the one
                  // reusable path (Task 23's openStayView), not a second open path.
                  planBody.open(stop.id);
                  openStayView(stop);
                }}
                bodyId={`stop-body-${stop.id}`}
                stay={surprised ? null : stay}
                // Owned items only, so a changeover day's plans don't count twice.
                plansCount={items.filter((it) => it.stopId === stop.id).length}
                ideasCount={ideas.length}
                isPending={isPending}
                dragHandle={surprised ? undefined : dragHandle}
                menuGroups={menuGroups}
                onSetNights={surprised ? undefined : (n) => void handleSetNights(stop.id, n)}
              >
                {open && (
                  <StopOpenBody
                    tripId={tripId}
                    stop={stop}
                    slots={slotsFor(stop, globalIdx)}
                    dayItems={items}
                    dayTitles={dayTitles}
                    ideas={ideas}
                    costsById={thingsToDoItemCostsById}
                    homeCurrency={homeCurrency}
                    accommodations={stop.accommodations.map((a) => ({
                      ...a,
                      attachmentCount: attachmentsByAccommodationId?.get(a.id)?.length ?? 0,
                    }))}
                    counts={{
                      files: attachmentsByStopId?.get(stop.id)?.length ?? 0,
                      notes: notesByStopId?.get(stop.id)?.length ?? 0,
                      reminders: remindersByStopId?.get(stop.id)?.length ?? 0,
                    }}
                    showDragHint={dragHint}
                    flashDate={flash?.stopId === stop.id ? flash.date : null}
                    onScheduleIdea={(idea, d) => void handleScheduleThing(idea, d)}
                    stopNames={stopNames}
                    onOpenAccommodation={(accommodationId) => openStayView(stop, accommodationId)}
                    onAddStay={() => handleAddAccommodationClick(stop)}
                    onAddIdea={() => setItemForm({ mode: "create", stopId: stop.id, unscheduled: true })}
                    onOpenIdea={(idea) => setOpenIdea({ stopId: stop.id, idea })}
                    onAddPlan={(date) => setItemForm({ mode: "create", stopId: stop.id, date })}
                    onEditItem={(it) => setItemForm({ mode: "edit", item: toItemCardItem(it) })}
                    onGiveDates={() => handleAdjustDates(stop)}
                    onOpenExtras={(kind) => setExtras({ stopId: stop.id, kind })}
                  />
                )}
              </StopRow>
            )}
          </SortableStop>
        </PlanRiseIn>
        {renderLegAfter(stop, globalIdx)}
      </React.Fragment>
    );
  }

  function renderGroupStops(groupStops: ItineraryStop[]) {
    const sorted = sortGroupStops(groupStops);
    return (
      <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {sorted.map((stop) => renderDesktopStop(stop, stopIndex.get(stop.id) ?? 0))}
      </SortableContext>
    );
  }

  function chapterSummary(n: number, chapter: ItineraryChapter | null) {
    const count = `${n} stop${n === 1 ? "" : "s"}`;
    if (!chapter) return count;
    return `${count} · ${chapter.startDate && chapter.endDate ? formatDateRangeCompact(chapter.startDate, chapter.endDate) : "rough"}`;
  }

  function firmUpChapterButton(chapterId: string) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="tap-target"
        disabled={pendingId === `firm-up-${chapterId}`}
        onClick={() => handleFirmUp(chapterId)}
      >
        Firm up
      </Button>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  // IDs of chapters that are RENDERED with a drag handle inside the chapter-level
  // SortableContext. ADR 0021: both rough AND dated populated chapters are now
  // draggable. Only populated (non-empty) chapters get a handle; empty chapters
  // remain non-reorderable (they render in sortOrder, still droppable via
  // EmptyRoughDroppable).
  const populatedChapterIds = groups
    .filter((g) => g.chapter !== null && g.stops.length > 0)
    .map((g) => g.chapter!.id);

  const hasRoughStops = stops.some((s) => s.arriveDate === null);
  const stayStop = stayView ? (stops.find((s) => s.id === stayView.stopId) ?? null) : null;
  const extrasStop = extras ? (stops.find((s) => s.id === extras.stopId) ?? null) : null;
  const sheetStop = sheetStopId ? (stops.find((s) => s.id === sheetStopId) ?? null) : null;
  // A stop deleted from its own sheet (or a stale deep link) leaves `?stop=`
  // pointing at nothing — drop it so the dead entry doesn't linger in history.
  const sheetStopGone = sheetStopId !== null && sheetStop === null;
  React.useEffect(() => {
    if (sheetStopGone) closeStopSheet();
    // closeStopSheet reads the current URL; only the stop vanishing should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetStopGone]);
  const actionsStop = actionsStopId ? (stops.find((s) => s.id === actionsStopId) ?? null) : null;
  const surpriseStop = surpriseStopId ? (stops.find((s) => s.id === surpriseStopId) ?? null) : null;
  const openIdeaStop = openIdea ? (stops.find((s) => s.id === openIdea.stopId) ?? null) : null;
  const headLegs = legsBySlot.get(HEAD_SLOT) ?? [];
  const emptyChapters = hasChapters
    ? planChapters.filter((c) => !groups.some((g) => g.chapter?.id === c.id))
    : [];

  // ---------------------------------------------------------------------------
  // Mobile list render helpers (PLAN.md §7.1; spec D7) — a mirror of the
  // desktop frame above, but MobileStopRow rows (no open bodies), compact
  // leg pills, and rough-only drag via SortableMobileStop.
  // ---------------------------------------------------------------------------

  function renderMobileStop(stop: ItineraryStop, globalIdx: number) {
    const rough = !stop.arriveDate;
    const items = dayItemsByStopId?.get(stop.id) ?? [];
    const stay = stayStatus(stop, stop.accommodations);
    // Owned items only, so a changeover day's plans don't count twice.
    const plansCount = items.filter((it) => it.stopId === stop.id).length;

    return (
      <React.Fragment key={stop.id}>
        <PlanRiseIn index={entered ? undefined : globalIdx} className={cn(newStopIds.includes(stop.id) && "tp-rise-in")}>
          <SortableMobileStop stop={stop} chapterId={stop.chapterId} rough={rough}>
            {(dragProps) => (
              <MobileStopRow
                stop={stop}
                number={globalIdx + 1}
                stay={stop.surprise?.youAreSurprised ? null : stay}
                plansCount={plansCount}
                onOpen={() => openStopSheet(stop.id)}
                dragProps={stop.surprise?.youAreSurprised ? undefined : dragProps}
              />
            )}
          </SortableMobileStop>
        </PlanRiseIn>
        {legNodes(stop, globalIdx, true)}
      </React.Fragment>
    );
  }

  function renderMobileGroupStops(groupStops: ItineraryStop[]) {
    const sorted = sortGroupStops(groupStops);
    return (
      <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {sorted.map((stop) => renderMobileStop(stop, stopIndex.get(stop.id) ?? 0))}
      </SortableContext>
    );
  }

  function renderMobileList() {
    return (
      <div
        data-testid="plan-mobile-list"
        // MOTION.md P12: the list behind the full-screen stop sheet scales back.
        data-sheet-open={sheetStop ? "" : undefined}
        className="flex origin-top flex-col transition-transform duration-[var(--dur-slow)] data-[sheet-open]:scale-[0.97] lg:hidden"
      >
        <DndContext
          // A fixed id: dnd-kit's fallback is a module-global counter, which drifts between server and client.
          id="plan-mobile-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragCancel={handleDragCancel}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {hasRoughStops && (
            <div className="mb-3 flex h-11 items-center gap-2.5 rounded-[14px] border-2 border-dashed border-border bg-sun/30 px-3.5">
              <CalendarClock className="size-4" aria-hidden />
              <p className="flex-1 text-[13px] font-semibold">Some stops don&apos;t have dates yet.</p>
              <Button
                variant="primary"
                size="sm"
                className="tap-target"
                onClick={handleFirmUpTrip}
                loading={pendingId === "firm-up-trip"}
              >
                Firm up all stops
              </Button>
            </div>
          )}

          {hasHomeBase && (
            <>
              <HomeBaseBookend
                tripId={tripId}
                name={homeBaseName!}
                variant="origin"
                dateISO={firstStop?.arriveDate ?? tripStartDate ?? null}
                anchorId="m-home-base-top"
              />
              {outboundLeg ? (
                <LegRow kind="legs" compact>{renderLegPill(outboundLeg, true)}</LegRow>
              ) : firstStop?.arriveDate ? (
                <LegRow kind="missing" compact>
                  <LegPill
                    compact
                    label={missingLegLabel({ name: homeBaseName! }, firstStop)}
                    onClick={() => setAddTransportDefaults({ fromStopId: HOME_ENDPOINT, toStopId: firstStop.id })}
                  />
                </LegRow>
              ) : firstStop ? (
                <LegRow kind="line" compact />
              ) : null}
            </>
          )}

          {headLegs.length > 0 && renderLegStack(headLegs, true)}

          {!hasChapters ? (
            <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {stops.map((stop, idx) => renderMobileStop(stop, idx))}
            </SortableContext>
          ) : (
            <>
              {groups.map((group, groupIdx) => {
                const chapter = group.chapter;
                const key = (chapter?.id ?? "ungrouped") + "-m-" + groupIdx;
                if (!chapter) {
                  return (
                    <React.Fragment key={key}>
                      <ChapterDivider name="Ungrouped" colour="stone" summary={chapterSummary(group.stops.length, null)} />
                      {renderMobileGroupStops(group.stops)}
                    </React.Fragment>
                  );
                }
                const roughWithRoughStops =
                  chapter.startDate === null && group.stops.some((s) => s.arriveDate === null);
                return (
                  <React.Fragment key={key}>
                    <ChapterDivider
                      name={chapter.name}
                      colour={chapter.colour}
                      summary={chapterSummary(group.stops.length, chapter)}
                      actions={roughWithRoughStops ? firmUpChapterButton(chapter.id) : undefined}
                    />
                    {renderMobileGroupStops(group.stops)}
                  </React.Fragment>
                );
              })}

              {emptyChapters.map((chapter) => (
                <ChapterDivider
                  key={`m-empty-${chapter.id}`}
                  name={chapter.name}
                  colour={chapter.colour}
                  summary="No stops yet"
                  actions={!chapter.startDate ? firmUpChapterButton(chapter.id) : undefined}
                />
              ))}
            </>
          )}

          {hasReturnBookend && lastStop && (
            <>
              {returnLeg ? (
                <LegRow kind="legs" compact>{renderLegPill(returnLeg, true)}</LegRow>
              ) : lastStop.arriveDate ? (
                <LegRow kind="missing" compact>
                  <LegPill
                    compact
                    label={missingLegLabel(lastStop, { name: homeBaseName! })}
                    onClick={() => setAddTransportDefaults({ fromStopId: lastStop.id, toStopId: HOME_ENDPOINT })}
                  />
                </LegRow>
              ) : (
                <LegRow kind="line" compact />
              )}
              <HomeBaseBookend
                tripId={tripId}
                name={homeBaseName!}
                variant="return"
                dateISO={lastStop.departDate ?? tripEndDate ?? null}
                anchorId="m-home-base-bottom"
              />
            </>
          )}
        </DndContext>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasContent ? (
        <>
          {showDesktopList && (
            <div data-testid="plan-desktop-list" className="hidden flex-col lg:flex">
              <DndContext
                id="plan-desktop-dnd"
                sensors={sensors}
                collisionDetection={planCollisionDetection}
                onDragStart={(e: DragStartEvent) => setActiveDrag((e.active.data.current as { type?: string; title?: string } | undefined) ?? null)}
                onDragCancel={handleDragCancel}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                {/* MOTION.md P6: the dragged plan lifts, tilted, while its row stays as a dashed placeholder. */}
                <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
                  {activeDrag?.type === "item" ? (
                    <div className="rotate-[-1deg] rounded-xl border-2 border-border bg-card px-3.5 py-2 text-sm font-bold shadow-hard-4">
                      {activeDrag.title}
                    </div>
                  ) : null}
                </DragOverlay>
                {/* Firm up survives the redesign as a slim row whenever rough stops exist. */}
                {hasRoughStops && (
                  <div className="mb-3 flex h-11 items-center gap-2.5 rounded-[14px] border-2 border-dashed border-border bg-sun/30 px-3.5">
                    <CalendarClock className="size-4" aria-hidden />
                    <p className="flex-1 text-[13px] font-semibold">Some stops don&apos;t have dates yet.</p>
                    <Button
                      variant="primary"
                      size="sm"
                      className="tap-target"
                      onClick={handleFirmUpTrip}
                      loading={pendingId === "firm-up-trip"}
                    >
                      Firm up all stops
                    </Button>
                  </div>
                )}

                {hasHomeBase && (
                  <>
                    <HomeBaseBookend
                      tripId={tripId}
                      name={homeBaseName!}
                      variant="origin"
                      dateISO={firstStop?.arriveDate ?? tripStartDate ?? null}
                    />
                    {outboundLeg ? (
                      <LegRow kind="legs">{renderLegPill(outboundLeg)}</LegRow>
                    ) : firstStop?.arriveDate ? (
                      <LegRow kind="missing">
                        <LegPill
                          label={missingLegLabel({ name: homeBaseName! }, firstStop)}
                          onClick={() => setAddTransportDefaults({ fromStopId: HOME_ENDPOINT, toStopId: firstStop.id })}
                        />
                      </LegRow>
                    ) : firstStop ? (
                      <LegRow kind="line" />
                    ) : null}
                  </>
                )}

                {/* HEAD_SLOT legs: transports that belong before the first stop. */}
                {headLegs.length > 0 && renderLegStack(headLegs)}

                {!hasChapters ? (
                  <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    {stops.map((stop, idx) => renderDesktopStop(stop, idx))}
                  </SortableContext>
                ) : (
                  // ADR 0021: both rough and dated populated chapters are draggable;
                  // empty chapters stay put and are droppable via EmptyRoughDroppable.
                  <SortableContext items={populatedChapterIds} strategy={verticalListSortingStrategy}>
                    {groups.map((group, groupIdx) => {
                      const chapter = group.chapter;
                      const key = (chapter?.id ?? "ungrouped") + "-" + groupIdx;
                      if (!chapter) {
                        return (
                          <React.Fragment key={key}>
                            <ChapterDivider name="Ungrouped" colour="stone" summary={chapterSummary(group.stops.length, null)} />
                            {renderGroupStops(group.stops)}
                          </React.Fragment>
                        );
                      }
                      const roughWithRoughStops =
                        chapter.startDate === null && group.stops.some((s) => s.arriveDate === null);
                      return (
                        <React.Fragment key={key}>
                          <SortableChapterHeader chapterId={chapter.id}>
                            {(dragHandle, setNodeRef, style) => (
                              <div ref={setNodeRef} style={style}>
                                <ChapterDivider
                                  name={chapter.name}
                                  colour={chapter.colour}
                                  summary={chapterSummary(group.stops.length, chapter)}
                                  dragHandle={dragHandle}
                                  actions={roughWithRoughStops ? firmUpChapterButton(chapter.id) : undefined}
                                />
                              </div>
                            )}
                          </SortableChapterHeader>
                          {renderGroupStops(group.stops)}
                        </React.Fragment>
                      );
                    })}
                  </SortableContext>
                )}

                {/* Empty chapters: groupStopsByChapter never emits a chapter with no
                    stops, so a freshly created one renders here to stay visible and
                    droppable into. */}
                {emptyChapters.map((chapter) => (
                  <React.Fragment key={`empty-${chapter.id}`}>
                    <ChapterDivider
                      name={chapter.name}
                      colour={chapter.colour}
                      summary="No stops yet"
                      actions={
                        <>
                          {!chapter.startDate && firmUpChapterButton(chapter.id)}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="tap-target size-8 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${chapter.name} chapter`}
                            disabled={pendingId === `delete-chapter-${chapter.id}`}
                            onClick={() => handleDeleteChapter(chapter.id)}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </Button>
                        </>
                      }
                    />
                    {!chapter.startDate && (
                      <SortableContext items={[]} strategy={verticalListSortingStrategy}>
                        <EmptyRoughDroppable chapterId={chapter.id} />
                      </SortableContext>
                    )}
                  </React.Fragment>
                ))}

                {/* Home base return bookend (round trips only) */}
                {hasReturnBookend && lastStop && (
                  <>
                    {returnLeg ? (
                      <LegRow kind="legs">{renderLegPill(returnLeg)}</LegRow>
                    ) : lastStop.arriveDate ? (
                      <LegRow kind="missing">
                        <LegPill
                          label={missingLegLabel(lastStop, { name: homeBaseName! })}
                          onClick={() => setAddTransportDefaults({ fromStopId: lastStop.id, toStopId: HOME_ENDPOINT })}
                        />
                      </LegRow>
                    ) : (
                      <LegRow kind="line" />
                    )}
                    <HomeBaseBookend
                      tripId={tripId}
                      name={homeBaseName!}
                      variant="return"
                      dateISO={lastStop.departDate ?? tripEndDate ?? null}
                    />
                  </>
                )}
              </DndContext>
            </div>
          )}

          {showMobileList && renderMobileList()}
        </>
      ) : (
        // ── Empty state: no Stops yet ──
        <EmptyState
          icon={MapPin}
          tone="coral"
          title="No stops yet"
          description="Add the first place you're going. You can keep it rough and sort dates later."
          action={
            <Button variant="primary" size="md" onClick={() => setAddStopOpen(true)}>
              <Plus aria-hidden="true" />
              Add a stop
            </Button>
          }
        />
      )}

      {/* ─── Dialogs ─── */}

      {/* Add stop */}
      <AddStopSheet
        open={addStopOpen}
        onOpenChange={setAddStopOpen}
        tripId={tripId}
        forkId={forkId ?? null}
        stops={stops}
        hardEndDate={hardEndDate ?? null}
        chapters={planChapters}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        defaultRange={suggestedStopDates}
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
          chapters={effectiveChapters.map((c) => ({ id: c.id, name: c.name }))}
          forkId={forkId ?? null}
          attachments={attachmentsByStopId?.get(editingStop.id) ?? []}
          loneOnDatedTrip={isLoneOnDatedTrip(stops.length, tripStartDate, tripEndDate)}
        />
      )}

      {/* Delete stop — ARCH-DAT-4: itemises what will be destroyed */}
      {deletingStop && (
        <DeleteStopDialog
          stopId={deletingStop.id}
          stopName={deletingStop.name}
          open={Boolean(deletingStop)}
          onOpenChange={(open) => {
            if (!open) setDeletingStop(null);
          }}
        />
      )}

      {/* Add transport */}
      {addTransportDefaults !== null && (
        <TransportFormDialog
          tripId={tripId}
          stops={stopOptions}
          defaultFromStopId={addTransportDefaults.fromStopId}
          defaultToStopId={addTransportDefaults.toStopId}
          defaultAnchorStopId={addTransportDefaults.anchorStopId}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAddTransportDefaults(null);
          }}
          forkId={forkId ?? null}
          homeCurrency={homeCurrency}
          homeBaseName={homeBaseName}
          homeTimezone={homeTimezone}
        />
      )}

      {/* Edit transport */}
      {editingTransport && (
        <TransportFormDialog
          tripId={tripId}
          stops={stopOptions}
          transport={editingTransport}
          bookend={bookendLegIds.has(editingTransport.id)}
          open={Boolean(editingTransport)}
          onOpenChange={(open) => {
            if (!open) { setEditingTransport(null); setEditingTransportCosts(undefined); }
          }}
          forkId={forkId ?? null}
          homeCurrency={homeCurrency}
          costs={editingTransportCosts}
          homeBaseName={homeBaseName}
          homeTimezone={homeTimezone}
          attachments={attachmentsByTransportId?.get(editingTransport.id) ?? []}
          onDelete={() => {
            const id = editingTransport.id;
            setEditingTransport(null);
            void handleDeleteTransport(id);
          }}
          notes={notesByTransportId?.get(editingTransport.id) ?? []}
          currentUserId={currentUserId}
          reminders={forkId ? undefined : (remindersByTransportId?.get(editingTransport.id) ?? [])}
          onAddReminder={
            forkId
              ? undefined
              : // Opens on top of the edit sheet, which stays open: closing it
                // here would skip its dirty guard and lose unsaved edits.
                () => setAddReminderAbout({ transportId: editingTransport.id })
          }
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
          homeCurrency={homeCurrency}
        />
      )}

      {/* Edit accommodation */}
      {editingAccommodation && editingAccStop && (
        <AccommodationFormDialog
          tripId={tripId}
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
              setEditingAccommodationCosts(undefined);
              setEditingAccStop(null);
            }
          }}
          forkId={forkId ?? null}
          homeCurrency={homeCurrency}
          costs={editingAccommodationCosts}
          attachments={attachmentsByAccommodationId?.get(editingAccommodation.id) ?? []}
        />
      )}

      {/* Add a reminder (Task 7, spec F8) — what it is about is preset, hidden. */}
      {addReminderAbout && (
        <AddReminderDialog
          tripId={tripId}
          about={addReminderAbout}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAddReminderAbout(null);
          }}
        />
      )}

      {/* Add a plan or an idea to a stop (the open body's + Add / ideas box) */}
      {itemForm?.mode === "create" && (
        <ItemFormDialog
          tripId={tripId}
          stops={stopOptions}
          open
          onOpenChange={(open) => {
            if (!open) setItemForm(null);
          }}
          defaultStopId={itemForm.stopId}
          defaultDate={itemForm.date}
          defaultUnscheduled={itemForm.unscheduled ?? !itemForm.date}
          forkId={forkId}
          homeCurrency={homeCurrency}
          members={members}
          currentUserId={currentUserId}
        />
      )}

      {/* Edit a plan or an idea */}
      {itemForm?.mode === "edit" && (
        <ItemFormDialog
          tripId={tripId}
          stops={stopOptions}
          item={itemForm.item}
          open
          onOpenChange={(open) => {
            if (!open) setItemForm(null);
          }}
          forkId={forkId}
          homeCurrency={homeCurrency}
          costs={thingsToDoItemCostsById?.get(itemForm.item.id)}
          attachments={attachmentsByItemId?.get(itemForm.item.id) ?? []}
          members={members}
          currentUserId={currentUserId}
          reminders={forkId ? undefined : (remindersByItemId?.get(itemForm.item.id) ?? [])}
          onAddReminder={
            forkId
              ? undefined
              : // On top of the edit dialog, which stays open (see the leg's).
                () => setAddReminderAbout({ itemId: itemForm.item.id })
          }
        />
      )}

      {/* Where you're staying — the stay detail view (spec 2026-10-05 §D) */}
      {stayStop && (
        <StayDialog
          key={`${stayStop.id}:${stayView?.accommodationId ?? "first"}`}
          open
          onOpenChange={(open) => {
            if (!open) setStayView(null);
          }}
          stopName={stayStop.name}
          stop={{ arriveDate: stayStop.arriveDate, departDate: stayStop.departDate }}
          stays={stayStop.accommodations.map((acc) => ({
            ...acc,
            attachments: attachmentsByAccommodationId?.get(acc.id) ?? [],
            noteThread: notesByAccommodationId?.get(acc.id) ?? [],
          }))}
          selectedId={stayView?.accommodationId ?? null}
          homeCurrency={homeCurrency}
          tripId={tripId}
          currentUserId={currentUserId}
          forkId={forkId ?? null}
          pendingId={pendingId}
          onEdit={(acc) => {
            setEditingAccommodation(acc);
            setEditingAccommodationCosts(acc.costs);
            setEditingAccStop(stayStop);
          }}
          onDelete={handleDeleteAccommodation}
          onAdd={() => handleAddAccommodationClick(stayStop)}
        />
      )}

      {/* Mobile: the full-screen stop sheet on ?stop=<id> (PLAN.md §7.2) */}
      {sheetStop && (
        <StopSheet
          key={sheetStop.id}
          open
          onClose={closeStopSheet}
          stop={sheetStop}
          number={(stopIndex.get(sheetStop.id) ?? 0) + 1}
          slots={slotsFor(sheetStop, stopIndex.get(sheetStop.id) ?? 0)}
          dayItems={dayItemsByStopId?.get(sheetStop.id) ?? []}
          stopNames={stopNames}
          ideas={thingsToDoByStopId?.get(sheetStop.id) ?? []}
          stay={stayStatus(sheetStop, sheetStop.accommodations)}
          accommodationRows={renderAccommodationRows(sheetStop)}
          onAddStay={() => handleAddAccommodationClick(sheetStop)}
          onEditItem={(it) => setItemForm({ mode: "edit", item: toItemCardItem(it) })}
          onAddPlan={(date) => setItemForm({ mode: "create", stopId: sheetStop.id, date })}
          onOpenIdea={(idea) => setOpenIdea({ stopId: sheetStop.id, idea })}
          onEditDates={() => handleAdjustDates(sheetStop)}
          onActions={() => setActionsStopId(sheetStop.id)}
          onSetNights={sheetStop.surprise?.youAreSurprised ? undefined : (n) => void handleSetNights(sheetStop.id, n)}
        />
      )}

      {/* Mobile: the stop's ⋯ actions (PLAN.md §7.6) — the desktop menu's groups */}
      {actionsStop && (
        <StopActionsSheet
          open
          onOpenChange={(o) => !o && setActionsStopId(null)}
          number={(stopIndex.get(actionsStop.id) ?? 0) + 1}
          hue={stopHue(actionsStop.sortOrder)}
          rough={!actionsStop.arriveDate}
          name={actionsStop.name}
          meta={stopSheetMeta(actionsStop)}
          groups={stopMenuGroups(actionsStop, stopIndex.get(actionsStop.id) ?? 0)}
        />
      )}

      {/* An idea, opened (spec 2026-10-02 §D) — phone sheet or desktop dialog */}
      <IdeaSheet
        tripId={tripId}
        idea={openIdea ? toItemCardItem(openIdea.idea) : null}
        days={openIdeaStop?.arriveDate && openIdeaStop.departDate ? slotsFor(openIdeaStop, stopIndex.get(openIdeaStop.id) ?? 0).map((s) => s.dateISO) : []}
        homeCurrency={homeCurrency}
        costs={openIdea ? thingsToDoItemCostsById?.get(openIdea.idea.id) : undefined}
        attachments={openIdea ? (attachmentsByItemId?.get(openIdea.idea.id) ?? []) : []}
        onClose={() => setOpenIdea(null)}
        onPickDay={(_item, d) => {
          if (openIdea) void handleScheduleThing(openIdea.idea, d);
        }}
        onEdit={(item) => setItemForm({ mode: "edit", item })}
      />

      {/* A stop's files, notes or reminders */}
      {extras && extrasStop && (
        <StopExtrasDialog
          kind={extras.kind}
          onOpenChange={(open) => {
            if (!open) setExtras(null);
          }}
          tripId={tripId}
          stopId={extrasStop.id}
          stopName={extrasStop.name}
          notes={notesByStopId?.get(extrasStop.id) ?? []}
          attachments={attachmentsByStopId?.get(extrasStop.id) ?? []}
          reminders={remindersByStopId?.get(extrasStop.id) ?? []}
          currentUserId={currentUserId}
          onAddReminder={
            forkId
              ? undefined
              : () => {
                  setExtras(null);
                  setAddReminderAbout({ stopId: extrasStop.id });
                }
          }
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

      {/* Assign stop to chapter picker */}
      {assigningStop && (
        <Dialog open onOpenChange={(o) => !o && setAssigningStop(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Assign &quot;{assigningStop.name}&quot; to a chapter</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-2">
              {planChapters.map((c) => (
                <Button key={c.id} variant="ghost" className="justify-start"
                  onClick={() => handleAssign(assigningStop.id, c.id)}>{c.name}</Button>
              ))}
              <Button variant="ghost" className="justify-start text-muted-foreground"
                onClick={() => handleAssign(assigningStop.id, null)}>Remove from chapter</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* CONTEXT.md Surprise: "Surprise for…", who the Stop is a surprise for */}
      {surpriseStop && members && currentUserId && (
        <SurpriseDialog
          open
          onOpenChange={(o) => !o && setSurpriseStopId(null)}
          members={members}
          currentUserId={currentUserId}
          initialForIds={members.map((m) => m.id).filter((id) => id !== currentUserId)}
          label={surpriseStop.name}
          onConfirm={(forIds) => void handleConfirmSurprise(surpriseStop.id, forIds)}
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
          <DialogTitle>Adjust dates for {stop.name}</DialogTitle>
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
