/**
 * Pure builder for the Fork-plan feature. Transforms a source Trip snapshot
 * into create-data keyed by SOURCE ids, applying the copy/keep/drop rules for
 * a Fork (a faithful copy of the live arrangement).
 *
 * Rules (compare with buildDuplicatePlan in duplicate-trip.ts):
 *   KEEP  — dates, pinned, accommodations, estimated Costs, rateToHome, Booking state / book-by / Slot time / Opening hours / Try list (with ticks)
 *   DROP  — paidAt, paidMinor from Costs; votes/notes/attachments (trip-wide)
 *   NULL  — sourceItemId (items) and ownerId (costs, remapped by the tx)
 *   ANCHOR — each leg's slot (sourceAnchorStopId, a SOURCE stop id; the tx
 *            remaps it onto the variant's own Stop) — spec 2026-10-04 §D
 *
 * No db, no id minting, no network — Task 7's server action mints ids and
 * remaps FK relationships from the `sourceId` / `source*Id` keys.
 */

import { effectiveBookingState } from "@/lib/booking-state";
import { isOnTrip } from "@/lib/enum-values";
import { orderPlanStops } from "@/lib/plan-order";
import { creationAnchor } from "@/lib/transport-anchor";

/**
 * Soft cap on the number of forks (what-if variants) per trip. Single source of
 * truth — imported by the server action (createFork) and the ForkSwitcher UI.
 * Lives here (not in the "use server" forks.ts) because a "use server" module
 * may only export async functions.
 */
export const MAX_FORKS = 4;

// ---------------------------------------------------------------------------
// Source types
// ---------------------------------------------------------------------------

interface ForkSourceChapter {
  id: string;
  name: string;
  colour: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}

interface ForkSourceStop {
  id: string;
  chapterId: string | null;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  sortOrder: number;
  chapterSortOrder: number;
  notes: string | null;
  surprisePlannerId?: string | null;
  surpriseForIds?: string | null;
  surpriseRevealedAt?: Date | null;
}

interface ForkSourceTransport {
  id: string;
  fromStopId: string | null;
  toStopId: string | null;
  /** The leg's explicit slot, when it has one (lib/transport-anchor). */
  anchorStopId?: string | null;
  mode: string;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  depLat: number | null;
  depLng: number | null;
  arrLat: number | null;
  arrLng: number | null;
  reference: string | null;
  notes: string | null;
  sortOrder: number;
  /** CONTEXT.md "Booking state" (spec 2026-10-17 R2) — optional so older-shaped rows still build. */
  bookingState?: string | null;
  bookingStateSet?: boolean | null;
  bookBy?: string | null;
}

interface ForkSourceAccommodation {
  id: string;
  stopId: string | null;
  name: string;
  address: string | null;
  checkIn: string;
  checkOut: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  confirmation: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  /** CONTEXT.md "Booking state" (spec 2026-10-17 R2) — optional so older-shaped rows still build. */
  bookingState?: string | null;
  bookingStateSet?: boolean | null;
  bookBy?: string | null;
}

interface ForkSourceItem {
  id: string;
  stopId: string | null;
  title: string;
  category: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  link: string | null;
  booking: string | null;
  notes: string | null;
  sortOrder: number;
  /** CONTEXT.md "Share link" — carried into the variant so a hidden Item stays hidden. */
  hiddenFromShares?: boolean;
  /**
   * CONTEXT.md "Item photo" — carried through as `sourcePhotoAttachmentId`
   * (never copied straight into `data`, unlike every other field here): the
   * Fork's copy must get its OWN Attachment + storage object, not the
   * source's attachment id (spec §I). The server action resolves this via
   * `copyItemPhoto` after minting the new Item's id.
   */
  photoAttachmentId?: string | null;
  surprisePlannerId?: string | null;
  surpriseForIds?: string | null;
  surpriseRevealedAt?: Date | null;
  /** CONTEXT.md "Booking state" (spec 2026-10-17 R2) — optional so older-shaped rows still build. */
  bookingState?: string | null;
  bookingStateSet?: boolean | null;
  bookBy?: string | null;
  /** CONTEXT.md "Slot time" / "Opening hours" (R3, R4). */
  slotTime?: string | null;
  arriveByMinutes?: number | null;
  refundable?: boolean | null;
  openingHours?: string | null;
  /** CONTEXT.md "Try list" (R6) — copied as stored, ticks included. */
  tryList?: string | null;
}

interface ForkSourceCost {
  id: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  rateToHome: number | null;
  paidAt: Date | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
  /** CONTEXT.md "Settlement"; missing/unknown copies as BEFORE. */
  settlement?: string;
}

export interface ForkSource {
  chapters: ForkSourceChapter[];
  stops: ForkSourceStop[];
  transports: ForkSourceTransport[];
  accommodations: ForkSourceAccommodation[];
  items: ForkSourceItem[];
  costs: ForkSourceCost[];
}

// ---------------------------------------------------------------------------
// Plan (output) types
// ---------------------------------------------------------------------------

export interface ForkPlan {
  chapters: Array<{
    sourceId: string;
    data: {
      name: string;
      colour: string;
      startDate: string | null;
      endDate: string | null;
      sortOrder: number;
    };
  }>;
  stops: Array<{
    sourceId: string;
    sourceChapterId: string | null;
    data: {
      name: string;
      country: string | null;
      lat: number | null;
      lng: number | null;
      timezone: string | null;
      arriveDate: string | null;
      departDate: string | null;
      nights: number | null;
      pinned: boolean;
      sortOrder: number;
      chapterSortOrder: number;
      notes: string | null;
      surprisePlannerId: string | null;
      surpriseForIds: string | null;
      surpriseRevealedAt: Date | null;
    };
  }>;
  transports: Array<{
    sourceFromStopId: string | null;
    sourceToStopId: string | null;
    /** The slot the leg renders in, as a SOURCE stop id; null = head of the plan. */
    sourceAnchorStopId: string | null;
    data: {
      mode: string;
      depPlace: string | null;
      arrPlace: string | null;
      depAt: Date | null;
      arrAt: Date | null;
      depLat: number | null;
      depLng: number | null;
      arrLat: number | null;
      arrLng: number | null;
      reference: string | null;
      notes: string | null;
      sortOrder: number;
      bookingState: string;
      bookingStateSet: boolean;
      bookBy: string | null;
    };
  }>;
  accommodations: Array<{
    sourceStopId: string | null;
    data: {
      name: string;
      address: string | null;
      checkIn: string;
      checkOut: string;
      checkInTime: string | null;
      checkOutTime: string | null;
      confirmation: string | null;
      notes: string | null;
      lat: number | null;
      lng: number | null;
      bookingState: string;
      bookingStateSet: boolean;
      bookBy: string | null;
    };
  }>;
  items: Array<{
    sourceStopId: string | null;
    /** See `ForkSourceItem.photoAttachmentId` — resolved outside `data` by the server action. */
    sourcePhotoAttachmentId: string | null;
    data: {
      title: string;
      category: string;
      date: string | null;
      startTime: string | null;
      endTime: string | null;
      lat: number | null;
      lng: number | null;
      address: string | null;
      link: string | null;
      booking: string | null;
      notes: string | null;
      sortOrder: number;
      sourceItemId: null;
      hiddenFromShares: boolean;
      surprisePlannerId: string | null;
      surpriseForIds: string | null;
      surpriseRevealedAt: Date | null;
      bookingState: string;
      bookingStateSet: boolean;
      bookBy: string | null;
      slotTime: string | null;
      arriveByMinutes: number | null;
      refundable: boolean | null;
      openingHours: string | null;
      tryList: string | null;
    };
  }>;
  costs: Array<{
    sourceOwnerType: string;
    sourceOwnerId: string | null;
    data: {
      costMinor: number;
      paidMinor: null;
      currency: string;
      rateToHome: number | null;
      paidAt: null;
      ownerType: string;
      ownerId: null;
      label: string | null;
      category: string | null;
      settlement: string;
    };
  }>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildForkPlan(source: ForkSource): ForkPlan {
  // The variant keeps every date and sortOrder, so its plan order is the source's.
  const orderedStops = orderPlanStops([...source.stops].sort((a, b) => a.sortOrder - b.sortOrder));
  return {
    chapters: source.chapters.map((c) => ({
      sourceId: c.id,
      data: { name: c.name, colour: c.colour, startDate: c.startDate, endDate: c.endDate, sortOrder: c.sortOrder },
    })),
    stops: source.stops.map((s) => ({
      sourceId: s.id,
      sourceChapterId: s.chapterId,
      data: {
        name: s.name, country: s.country, lat: s.lat, lng: s.lng, timezone: s.timezone,
        arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights, pinned: s.pinned,
        sortOrder: s.sortOrder, chapterSortOrder: s.chapterSortOrder, notes: s.notes,
        surprisePlannerId: s.surprisePlannerId ?? null, surpriseForIds: s.surpriseForIds ?? null,
        surpriseRevealedAt: s.surpriseRevealedAt ?? null,
      },
    })),
    transports: source.transports.map((t) => ({
      sourceFromStopId: t.fromStopId, sourceToStopId: t.toStopId,
      sourceAnchorStopId: creationAnchor(t, orderedStops),
      data: {
        mode: t.mode, depPlace: t.depPlace, arrPlace: t.arrPlace, depAt: t.depAt, arrAt: t.arrAt,
        depLat: t.depLat, depLng: t.depLng, arrLat: t.arrLat, arrLng: t.arrLng,
        reference: t.reference, notes: t.notes, sortOrder: t.sortOrder,
        bookingState: effectiveBookingState("TRANSPORT", t, t.reference), bookingStateSet: t.bookingStateSet ?? false, bookBy: t.bookBy ?? null,
      },
    })),
    accommodations: source.accommodations.map((a) => ({
      sourceStopId: a.stopId,
      data: {
        name: a.name, address: a.address, checkIn: a.checkIn, checkOut: a.checkOut,
        checkInTime: a.checkInTime ?? null, checkOutTime: a.checkOutTime ?? null,
        confirmation: a.confirmation, notes: a.notes, lat: a.lat, lng: a.lng,
        bookingState: effectiveBookingState("ACCOMMODATION", a, a.confirmation), bookingStateSet: a.bookingStateSet ?? false, bookBy: a.bookBy ?? null,
      },
    })),
    items: source.items.map((it) => ({
      sourceStopId: it.stopId,
      sourcePhotoAttachmentId: it.photoAttachmentId ?? null,
      data: {
        title: it.title, category: it.category, date: it.date, startTime: it.startTime, endTime: it.endTime,
        lat: it.lat, lng: it.lng, address: it.address, link: it.link, booking: it.booking,
        notes: it.notes, sortOrder: it.sortOrder, sourceItemId: null,
        hiddenFromShares: it.hiddenFromShares ?? false,
        surprisePlannerId: it.surprisePlannerId ?? null, surpriseForIds: it.surpriseForIds ?? null,
        surpriseRevealedAt: it.surpriseRevealedAt ?? null,
        bookingState: effectiveBookingState("ITEM", it, it.booking), bookingStateSet: it.bookingStateSet ?? false, bookBy: it.bookBy ?? null,
        slotTime: it.slotTime ?? null, arriveByMinutes: it.arriveByMinutes ?? null, refundable: it.refundable ?? null,
        openingHours: it.openingHours ?? null,
        tryList: it.tryList ?? null,
      },
    })),
    costs: source.costs.map((c) => ({
      sourceOwnerType: c.ownerType, sourceOwnerId: c.ownerId,
      data: {
        costMinor: c.costMinor, paidMinor: null, currency: c.currency, rateToHome: c.rateToHome,
        paidAt: null, ownerType: c.ownerType, ownerId: null /* remapped in tx */, label: c.label, category: c.category,
        settlement: isOnTrip(c.settlement) ? "ON_TRIP" : "BEFORE",
      },
    })),
  };
}
