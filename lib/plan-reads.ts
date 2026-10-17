import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLAN_PLACEMENT_WHERE, planScope, resolvePlan, type PlanId } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { readTripShell, type TripHeader } from "@/lib/trip-shell-reads";
import {
  loadSurpriseVisibility,
  maskSurpriseStops,
  type PlaceholderItem,
  type SurpriseVisibility,
} from "@/lib/surprise-visibility";
import type { SurpriseView } from "@/lib/surprise";
import type { BookingState } from "@/lib/enum-values";

/**
 * The Plan reader (spec 2026-10-14 card A, Q2): everything a page needs to
 * render one Plan (CONTEXT.md **Plan**: Stops, Transport, Accommodation,
 * scheduled Items, Chapters, Costs), read once per request, plan-aware, with
 * the viewer's Surprises applied (ADR 0072). The viewer is a required
 * argument, so a Plan reader cannot forget it.
 *
 * Each select is the union of what the Plan, Summary, Print, Calendar,
 * Budget and Compare pages select today, so a page migrating onto
 * `readPlan` never needs a second read of these tables.
 */

/** A Traveller id, or null for the public (Share, Calendar feed): surprised by every live Surprise. */
export type PlanViewer = string | null;

const PLAN_STOP_SELECT = {
  id: true,
  tripId: true,
  forkId: true,
  name: true,
  country: true,
  countryCode: true,
  lat: true,
  lng: true,
  timezone: true,
  arriveDate: true,
  departDate: true,
  nights: true,
  pinned: true,
  sortOrder: true,
  notes: true,
  chapterId: true,
  chapterSortOrder: true,
} as const;

const PLAN_TRANSPORT_SELECT = {
  id: true,
  mode: true,
  fromStopId: true,
  toStopId: true,
  depIsHome: true,
  arrIsHome: true,
  anchorStopId: true,
  depPlace: true,
  depAt: true,
  depLat: true,
  depLng: true,
  arrPlace: true,
  arrAt: true,
  arrLat: true,
  arrLng: true,
  reference: true,
  bookingState: true,
  bookingStateSet: true,
  bookBy: true,
  notes: true,
  sortOrder: true,
} as const;

export const PLAN_ACCOMMODATION_SELECT = {
  id: true,
  tripId: true,
  forkId: true,
  stopId: true,
  name: true,
  address: true,
  checkIn: true,
  checkOut: true,
  checkInTime: true,
  checkOutTime: true,
  confirmation: true,
  bookingState: true,
  bookingStateSet: true,
  bookBy: true,
  notes: true,
  lat: true,
  lng: true,
} as const;

const PLAN_ITEM_SELECT = {
  id: true,
  tripId: true,
  forkId: true,
  title: true,
  category: true,
  date: true,
  startTime: true,
  endTime: true,
  address: true,
  link: true,
  booking: true,
  slotTime: true,
  arriveByMinutes: true,
  refundable: true,
  bookingState: true,
  bookingStateSet: true,
  bookBy: true,
  notes: true,
  stopId: true,
  lat: true,
  lng: true,
  hiddenFromShares: true,
  photoAttachmentId: true,
  sortOrder: true,
  sourceItemId: true,
} as const;

/** The one Cost selection (union of the private copies it replaces: the Budget/Plan/Home copies carry `dueDate`). */
export const COST_SELECT = {
  id: true,
  costMinor: true,
  paidMinor: true,
  currency: true,
  rateToHome: true,
  paidAt: true,
  dueDate: true,
  ownerType: true,
  ownerId: true,
  label: true,
  category: true,
  settlement: true,
} as const;

const PLAN_CHAPTER_SELECT = { id: true, name: true, colour: true, startDate: true, endDate: true, sortOrder: true } as const;

const EXCHANGE_RATE_SELECT = { base: true, quote: true, rate: true, manual: true, fetchedAt: true } as const;
// `title`/`name` ride along for the Budget page's Cost owner labels: a Cost on a
// Wishlist idea (no Stop, no date) or a hidden owner is not in `items` /
// `accommodations`, but still needs its label wherever its line is shown.
const BUDGET_ITEM_SELECT = { id: true, stopId: true, category: true, date: true, title: true } as const;
const BUDGET_ACCOMMODATION_SELECT = { id: true, stopId: true, checkIn: true, checkOut: true, name: true } as const;

type PlanStopRow = Prisma.StopGetPayload<{ select: typeof PLAN_STOP_SELECT }> & { surprise: SurpriseView | null };
/**
 * The `bookingState` column is a plain String holding one of BOOKING_STATES:
 * every writer stores lib/booking-state.ts `bookingStateWrite`'s result, so
 * the rows name it as the union the cards and dialogs take.
 */
type WithBookingState<T> = Omit<T, "bookingState"> & { bookingState: BookingState };
type PlanTransportRow = WithBookingState<Prisma.TransportGetPayload<{ select: typeof PLAN_TRANSPORT_SELECT }>>;
type PlanAccommodationRow = WithBookingState<Prisma.AccommodationGetPayload<{ select: typeof PLAN_ACCOMMODATION_SELECT }>>;
type PlanItemRow = (WithBookingState<Prisma.ItemGetPayload<{ select: typeof PLAN_ITEM_SELECT }>> | PlaceholderItem) & {
  surprise: SurpriseView | null;
};
type PlanCostRow = Prisma.CostGetPayload<{ select: typeof COST_SELECT }>;
type PlanChapterRow = Prisma.ChapterGetPayload<{ select: typeof PLAN_CHAPTER_SELECT }>;

export type PlanRows = {
  /** The cached Trip shell; its `stops` are always the real plan's dated Stops, even when `plan` is a Fork — use `stops` below for this Plan. */
  trip: TripHeader;
  plan: PlanId;
  fork: { id: string; name: string } | null;
  visibility: SurpriseVisibility;
  /** Every Stop of the Plan (dated and rough), plan order, hidden Stops masked (notes null), `surprise` attached. */
  stops: PlanStopRow[];
  transports: PlanTransportRow[];
  /** Only what the viewer may see (v.where.accommodation). */
  accommodations: PlanAccommodationRow[];
  /** Only what the viewer may see, plus one placeholder per hidden root Item of THIS plan. */
  items: PlanItemRow[];
  /**
   * Unfiltered: hidden Costs stay in totals (callers pass `visibility.hiddenOwnerIds` to the budget).
   * A caller that renders Cost lines must drop the ones whose `ownerId` is in `visibility.hiddenOwnerIds`.
   */
  costs: PlanCostRow[];
  exchangeRates: Prisma.ExchangeRateGetPayload<{ select: typeof EXCHANGE_RATE_SELECT }>[];
  /** [] when the Trip's chapters toggle is off (a disabled Trip renders flat). Dated and rough. */
  chapters: PlanChapterRow[];
  /**
   * Unfiltered, minimal rows for buildBudget's byStop/byDay placement and the
   * Cost owner-label map (`title`/`name`). Never rendered as rows; a label is
   * shown only on a Cost line, which callers already drop for hidden owners.
   */
  budgetItems: { id: string; stopId: string | null; category: string; date: string | null; title: string }[];
  budgetAccommodations: { id: string; stopId: string; checkIn: string; checkOut: string; name: string }[];
};

/** One Fork of this Trip, or null. Cached so `resolvePlanParam` and `readPlan` share it within a request. */
const readFork = cache((tripId: string, forkId: string) =>
  db.fork.findFirst({ where: { id: forkId, tripId }, select: { id: true, name: true } }),
);

/**
 * The Plan a page's `?plan=` selects: Forks off → real plan; a Fork of this
 * Trip → it; anything else → real plan (reads fall back; writes don't —
 * lib/guards.ts requirePlanAccess).
 */
export async function resolvePlanParam(
  tripId: string,
  planParam: string | string[] | undefined,
): Promise<{ plan: PlanId; fork: { id: string; name: string } | null }> {
  const shell = await readTripShell(tripId);
  const selected = resolvePlan({ plan: planParam, forksEnabled: shell?.forksEnabled ?? false });
  if (!selected) return { plan: null, fork: null };
  const fork = await readFork(tripId, selected);
  return fork ? { plan: fork.id, fork } : { plan: null, fork: null };
}

/** Pure: the Stop with `surprise` attached and hidden notes blanked; exported for the Share page which keeps its own gated reads. */
export function maskPlanStops<T extends { id: string; notes?: string | null }>(
  stops: T[],
  v: SurpriseVisibility,
): Array<T & { surprise: SurpriseView | null }> {
  return maskSurpriseStops(stops, v, v.views.stops);
}

/**
 * Pure: visible Item rows + this plan's placeholders, each with `surprise`.
 * Placeholders are appended (visibility is loaded across every fork, so only
 * the ones whose forkId is this plan belong); callers sort as they render.
 */
export function mergePlanItems<T extends { id: string }>(
  rows: T[],
  v: SurpriseVisibility,
  plan: PlanId,
): Array<(T | PlaceholderItem) & { surprise: SurpriseView | null }> {
  const forkId = plan ?? null;
  return [
    ...rows.map((r) => ({ ...r, surprise: v.views.items.get(r.id) ?? null })),
    ...v.placeholderItems.filter((p) => p.forkId === forkId),
  ];
}

/**
 * Everything a page needs to render one Plan, read once per request (React
 * cache, keyed on three primitives so identity is stable). Does NOT check
 * access — callers call requireTripAccess first (every page already does).
 * `plan` must already be resolved (`resolvePlanParam`); a Fork id that is not
 * this Trip's is notFound, like a missing or Recently deleted Trip.
 */
export const readPlan: (tripId: string, viewer: PlanViewer, plan: PlanId) => Promise<PlanRows> = cache(
  async (tripId: string, viewer: PlanViewer, plan: PlanId): Promise<PlanRows> => {
    const [trip, v, fork] = await Promise.all([
      readTripShell(tripId),
      loadSurpriseVisibility(tripId, viewer),
      plan ? readFork(tripId, plan) : Promise.resolve(null),
    ]);
    if (!trip || trip.deletedAt) notFound();
    if (plan && !fork) notFound();

    const scope = { tripId, ...planScope(plan) };
    const [stopRows, transports, accommodations, itemRows, costs, exchangeRates, chapters, budgetItems, budgetAccommodations] =
      await Promise.all([
        db.stop.findMany({ where: scope, orderBy: { sortOrder: "asc" }, select: PLAN_STOP_SELECT }),
        db.transport.findMany({ where: scope, orderBy: { sortOrder: "asc" }, select: PLAN_TRANSPORT_SELECT }),
        db.accommodation.findMany({
          where: { ...scope, ...v.where.accommodation },
          orderBy: { checkIn: "asc" },
          select: PLAN_ACCOMMODATION_SELECT,
        }),
        // Plan placements only (ADR 0022): things to do and scheduled Items
        // together; callers split by `date === null`. Wishlist ideas are not
        // part of a Plan.
        db.item.findMany({
          where: { ...scope, ...PLAN_PLACEMENT_WHERE, ...v.where.item },
          orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
          select: PLAN_ITEM_SELECT,
        }),
        // Unfiltered: hidden Costs stay in the totals (ADR 0072).
        db.cost.findMany({ where: scope, orderBy: { createdAt: "asc" }, select: COST_SELECT }),
        // Exchange rates are trip-wide, not plan-scoped (CONTEXT.md).
        db.exchangeRate.findMany({ where: { tripId }, select: EXCHANGE_RATE_SELECT }),
        // A disabled Trip renders as if it had no chapters — skip the read.
        trip.chaptersEnabled
          ? db.chapter.findMany({
              where: scope,
              orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
              select: PLAN_CHAPTER_SELECT,
            })
          : Promise.resolve([]),
        // Unfiltered, minimal: buildBudget places a cost by its owner's real
        // stop/date, so a hidden owner's row has to be here. Never rendered
        // as a row (title/name only label a Cost line).
        db.item.findMany({ where: scope, select: BUDGET_ITEM_SELECT }),
        db.accommodation.findMany({ where: scope, select: BUDGET_ACCOMMODATION_SELECT }),
      ]);

    return {
      trip,
      plan,
      fork,
      visibility: v,
      stops: orderPlanStops(maskPlanStops(stopRows, v)),
      transports: transports as PlanTransportRow[],
      accommodations: accommodations as PlanAccommodationRow[],
      items: mergePlanItems(itemRows as WithBookingState<(typeof itemRows)[number]>[], v, plan),
      costs,
      exchangeRates,
      chapters,
      budgetItems,
      budgetAccommodations,
    };
  },
);
