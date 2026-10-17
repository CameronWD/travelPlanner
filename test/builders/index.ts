/**
 * Prisma-shaped rows for tests (spec 2026-10-14 Q10). Realistic defaults: a
 * dated Trip, a Home base with a timezone, three Stops in order. Override
 * any field; ids are stable so tests can refer to them without reading them
 * back. These are ROW shapes (what `db.x.findMany` returns), not view models.
 *
 * Column names and nullability are checked against prisma/schema.prisma.
 * Four corrections from the brief's shapes (schema wins — see the task-1
 * report for detail):
 *   - Stop.timezone is `String?` (null while rough), not `string`.
 *   - Stop.chapterSortOrder is `Int @default(0)` (non-null), not `number | null`.
 *   - Transport.depAt/arrAt are `DateTime?`, not `string | null`.
 *   - Cost.paidAt is `DateTime?`, not `string | null`.
 */
import type { BookingState } from "@/lib/enum-values";

export type TripRow = {
  id: string; name: string; slug: string | null; startDate: string | null; endDate: string | null;
  hardEndDate: string | null; homeCurrency: string; homeName: string | null; homeLat: number | null;
  homeLng: number | null; homeCountryCode: string | null; homeTimezone: string | null; roundTrip: boolean;
  drivingWindingFactor: number; drivingAvgSpeedKph: number; chaptersEnabled: boolean; forksEnabled: boolean;
  coverImageKey: string | null; coverSmallKey: string | null; coverAspect: number | null;
  createdById: string; deletedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type StopRow = {
  id: string; tripId: string; forkId: string | null; name: string; country: string | null; countryCode: string | null;
  lat: number | null; lng: number | null; timezone: string | null; arriveDate: string | null; departDate: string | null;
  nights: number | null; pinned: boolean; sortOrder: number; notes: string | null; chapterId: string | null;
  chapterSortOrder: number; surprisePlannerId: string | null; surpriseRevealedAt: Date | null;
  createdAt: Date; updatedAt: Date;
};
export type TransportRow = {
  id: string; tripId: string; forkId: string | null; mode: string; fromStopId: string | null; toStopId: string | null;
  anchorStopId: string | null; depPlace: string | null; arrPlace: string | null; depAt: Date | null; arrAt: Date | null;
  depLat: number | null; depLng: number | null; arrLat: number | null; arrLng: number | null; depIsHome: boolean;
  arrIsHome: boolean; reference: string | null; bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null;
  notes: string | null; sortOrder: number; createdAt: Date; updatedAt: Date;
};
export type StayRow = {
  id: string; tripId: string; forkId: string | null; stopId: string; name: string; address: string | null;
  checkIn: string; checkOut: string; checkInTime: string | null; checkOutTime: string | null; confirmation: string | null;
  bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null;
  notes: string | null; lat: number | null; lng: number | null; createdAt: Date; updatedAt: Date;
};
export type ItemRow = {
  id: string; tripId: string; forkId: string | null; stopId: string | null; date: string | null; title: string;
  category: string; startTime: string | null; endTime: string | null; address: string | null; link: string | null;
  booking: string | null; bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null;
  /** CONTEXT.md "Slot time" (R3) — the ticket's time, how early to be there, and whether it can be refunded. */
  slotTime: string | null; arriveByMinutes: number | null; refundable: boolean | null;
  /** CONTEXT.md "Opening hours" (R4) — the stored JSON string column; null = not known. */
  openingHours: string | null;
  notes: string | null; lat: number | null; lng: number | null; countryCode: string | null;
  hiddenFromShares: boolean; sortOrder: number; photoAttachmentId: string | null; sourceItemId: string | null;
  surprisePlannerId: string | null; surpriseRevealedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type CostRow = {
  id: string; tripId: string; forkId: string | null; ownerType: string; ownerId: string | null; costMinor: number;
  paidMinor: number | null; currency: string; rateToHome: number | null; paidAt: Date | null; dueDate: string | null;
  settlement: string; label: string | null; category: string | null; createdAt: Date; updatedAt: Date;
};
export type ChapterRow = {
  id: string; tripId: string; forkId: string | null; name: string; colour: string; startDate: string | null;
  endDate: string | null; sortOrder: number; createdAt: Date; updatedAt: Date;
};
export type TravellerRow = {
  id: string; name: string | null; image: string | null; displayName: string | null; photoKey: string | null;
  photoUpdatedAt: Date | null; email: string;
};

const NOW = new Date("2026-10-14T00:00:00Z");

export function trip(o: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1", name: "Iberia", slug: "iberia", startDate: "2026-11-01", endDate: "2026-11-10", hardEndDate: null,
    homeCurrency: "AUD", homeName: "Sydney", homeLat: -33.87, homeLng: 151.21, homeCountryCode: "AU",
    homeTimezone: "Australia/Sydney", roundTrip: true, drivingWindingFactor: 1.3, drivingAvgSpeedKph: 70,
    chaptersEnabled: false, forksEnabled: false, coverImageKey: null, coverSmallKey: null, coverAspect: null,
    createdById: "u1", deletedAt: null, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function stop(o: Partial<StopRow> = {}): StopRow {
  return {
    id: "stop-1", tripId: "trip-1", forkId: null, name: "Lisbon", country: "Portugal", countryCode: "PT",
    lat: 38.72, lng: -9.14, timezone: "Europe/Lisbon", arriveDate: "2026-11-01", departDate: "2026-11-04", nights: 3,
    pinned: false, sortOrder: 0, notes: null, chapterId: null, chapterSortOrder: 0, surprisePlannerId: null,
    surpriseRevealedAt: null, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function transport(o: Partial<TransportRow> = {}): TransportRow {
  return {
    id: "tr-1", tripId: "trip-1", forkId: null, mode: "TRAIN", fromStopId: "stop-1", toStopId: "stop-2", anchorStopId: "stop-1",
    depPlace: null, arrPlace: null, depAt: new Date("2026-11-04T09:00:00Z"), arrAt: new Date("2026-11-04T12:30:00Z"),
    depLat: null, depLng: null, arrLat: null, arrLng: null, depIsHome: false, arrIsHome: false, reference: null,
    bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null, notes: null, sortOrder: 0, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function stay(o: Partial<StayRow> = {}): StayRow {
  return {
    id: "acc-1", tripId: "trip-1", forkId: null, stopId: "stop-1", name: "Hotel Avenida", address: null,
    checkIn: "2026-11-01", checkOut: "2026-11-04", checkInTime: null, checkOutTime: null, confirmation: null,
    bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null, notes: null, lat: null, lng: null,
    createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function item(o: Partial<ItemRow> = {}): ItemRow {
  return {
    id: "item-1", tripId: "trip-1", forkId: null, stopId: "stop-1", date: "2026-11-02", title: "Belém Tower",
    category: "SIGHTSEEING", startTime: "10:00", endTime: "11:30", address: null, link: null, booking: null,
    bookingState: "NONE", bookingStateSet: false, bookBy: null, slotTime: null, arriveByMinutes: null, refundable: null,
    openingHours: null,
    notes: null, lat: null, lng: null, countryCode: null,
    hiddenFromShares: false, sortOrder: 0, photoAttachmentId: null,
    sourceItemId: null, surprisePlannerId: null, surpriseRevealedAt: null, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function cost(o: Partial<CostRow> = {}): CostRow {
  return {
    id: "cost-1", tripId: "trip-1", forkId: null, ownerType: "ITEM", ownerId: "item-1", costMinor: 1200, paidMinor: null,
    currency: "EUR", rateToHome: 1.6, paidAt: null, dueDate: null, settlement: "BEFORE", label: null, category: null,
    createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function chapter(o: Partial<ChapterRow> = {}): ChapterRow {
  return {
    id: "ch-1", tripId: "trip-1", forkId: null, name: "Portugal", colour: "teal", startDate: "2026-11-01",
    endDate: "2026-11-04", sortOrder: 0, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function traveller(o: Partial<TravellerRow> = {}): TravellerRow {
  return { id: "u1", name: "Cam", image: null, displayName: null, photoKey: null, photoUpdatedAt: null, email: "cam@example.com", ...o };
}

/** A dated Trip with three Stops in order and the two legs between them. */
export function datedTripFixture() {
  const t = trip();
  const stops = [
    stop({ id: "stop-1", name: "Lisbon", country: "Portugal", countryCode: "PT", timezone: "Europe/Lisbon", arriveDate: "2026-11-01", departDate: "2026-11-04", nights: 3, sortOrder: 0 }),
    stop({ id: "stop-2", name: "Madrid", country: "Spain", countryCode: "ES", timezone: "Europe/Madrid", lat: 40.42, lng: -3.7, arriveDate: "2026-11-04", departDate: "2026-11-07", nights: 3, sortOrder: 1 }),
    stop({ id: "stop-3", name: "Barcelona", country: "Spain", countryCode: "ES", timezone: "Europe/Madrid", lat: 41.39, lng: 2.17, arriveDate: "2026-11-07", departDate: "2026-11-10", nights: 3, sortOrder: 2 }),
  ];
  const transports = [
    transport({ id: "tr-1", fromStopId: "stop-1", toStopId: "stop-2", anchorStopId: "stop-1", depAt: new Date("2026-11-04T09:00:00Z"), arrAt: new Date("2026-11-04T12:30:00Z"), sortOrder: 0 }),
    transport({ id: "tr-2", fromStopId: "stop-2", toStopId: "stop-3", anchorStopId: "stop-2", depAt: new Date("2026-11-07T10:00:00Z"), arrAt: new Date("2026-11-07T12:45:00Z"), sortOrder: 1 }),
  ];
  return { trip: t, stops, transports, stays: [stay()], items: [item()], costs: [cost()], chapters: [] as ChapterRow[] };
}
