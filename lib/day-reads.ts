/**
 * The one query set behind a dated day (card 3.M): the Day view's carousel
 * window (lib/day-view-loader.ts `getDays`) and the Travelling Home's today
 * (lib/travelling-home-loader.ts) read these rows and assemble them with
 * `buildDayModel` (lib/day-view-model.ts), so Day and Today agree by
 * construction.
 *
 * Real plan only — policy (not a BND-2 spelling exemption): dated views
 * ignore `?plan=` (architecture-sitrep-2026-09-22.md).
 *
 * Surprise (ADR 0051, CONTEXT.md "Surprise"): the visibility loader runs for
 * `viewerId` before the wave and its fragments go into every Item,
 * Accommodation, Attachment and Day title read, so nothing inside a Surprise
 * hidden from the viewer leaves the database. Stops keep their shell with
 * their Surprise view; a hidden dated real-plan Item joins as a placeholder
 * titled "Surprise". Done once per read, so every date assembled from these
 * rows is masked the same way.
 *
 * `alongside` is the caller's own reads (the Day view's Costs and Journal
 * window; Today's whole Costs, Journal and slug), run in the same wave.
 */
import { db } from "@/lib/db";
import { THINGS_TO_DO_WHERE, WISHLIST_IDEA_WHERE, REAL_PLAN } from "@/lib/plan-scope";
import { loadSurpriseVisibility, maskSurpriseStops, type SurpriseVisibility } from "@/lib/surprise-visibility";
import type { DayRows } from "@/lib/day-view-model";
import type { BookingState } from "@/lib/enum-values";

export interface DayReadContext {
  tripId: string;
  trip: DayRows["trip"];
  startDate: string;
  /** `trip.endDate`, or the start when the Trip has none. */
  endDate: string;
  visibility: SurpriseVisibility;
  /** The dated real-plan Stops, unmasked, as soon as they land — for a read that needs the Trip's today. */
  stopRows: Promise<Array<Omit<DayRows["stops"][number], "surprise">>>;
}

export async function readDayRows<X>(
  tripId: string,
  viewerId: string | null,
  alongside: (ctx: DayReadContext) => Promise<X>,
): Promise<"missing" | "dateless" | { rows: DayRows; visibility: SurpriseVisibility; alongside: X }> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { name: true, startDate: true, endDate: true, homeCurrency: true, homeName: true, homeTimezone: true, chaptersEnabled: true, roundTrip: true },
  });
  // The callers have already checked access; a missing row is a bad link.
  if (!trip) return "missing";
  if (!trip.startDate) return "dateless";
  const startDate = trip.startDate;
  const endDate = trip.endDate ?? trip.startDate;

  // Known before the wave, so every query below leaves the hidden inside in the database.
  const v = await loadSurpriseVisibility(tripId, viewerId);

  // `.then((rows) => rows)`: one settled promise that both the wave and `alongside` consume.
  const stopRows = db.stop
    .findMany({
      // Rough (date-less) Stops don't appear on a dated day.
      where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, country: true, countryCode: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true, lat: true, lng: true },
    })
    .then((rows) => rows);

  const [stops, itemRows, transports, accommodations, wishlist, attachments, chapters, dayTitles, thingsToDo, extra] = await Promise.all([
    stopRows,
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, date: { not: null }, ...v.where.item },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true, title: true, category: true, date: true, startTime: true, endTime: true, sortOrder: true, stopId: true,
        lat: true, lng: true, address: true, link: true, booking: true, notes: true, hiddenFromShares: true, photoAttachmentId: true,
        slotTime: true, arriveByMinutes: true, refundable: true,
        bookingState: true, bookingStateSet: true, bookBy: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, mode: true, fromStopId: true, toStopId: true, depPlace: true, arrPlace: true, depAt: true, arrAt: true,
        depLat: true, depLng: true, arrLat: true, arrLng: true, reference: true, notes: true, sortOrder: true,
        anchorStopId: true, depIsHome: true, arrIsHome: true, bookingState: true, bookingStateSet: true, bookBy: true,
      },
    }),
    // Every stay of the Trip; buildDayModel keeps the ones that touch a day.
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN, ...v.where.accommodation },
      orderBy: { checkIn: "asc" },
      select: {
        id: true, stopId: true, name: true, address: true, checkIn: true, checkOut: true,
        checkInTime: true, checkOutTime: true, confirmation: true, notes: true, lat: true, lng: true,
        bookingState: true, bookingStateSet: true, bookBy: true,
      },
    }),
    // Wishlist ideas (trip-wide, unscheduled — ADR 0022), located or not: the nearby rail and Day ideas.
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE, ...v.where.item },
      select: { id: true, title: true, category: true, lat: true, lng: true, countryCode: true },
    }),
    db.attachment.findMany({
      where: { tripId, ...v.where.attachment },
      orderBy: { createdAt: "asc" },
      select: { id: true, filename: true, title: true, mime: true, size: true, url: true, uploadedById: true, createdAt: true, targetId: true },
    }),
    // A Trip with Chapters off renders as if it had none — skip the query.
    trip.chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...REAL_PLAN },
          orderBy: { startDate: "asc" },
          select: { id: true, name: true, colour: true, startDate: true, endDate: true, sortOrder: true },
        })
      : Promise.resolve([]),
    // Day titles through the Stop (spec 2026-10-06 §B), so they join this wave.
    db.dayTitle.findMany({
      where: { stop: { tripId, ...REAL_PLAN }, ...v.where.dayTitle },
      select: { stopId: true, dayIndex: true, title: true },
    }),
    // Every Stop's things to do (ADR 0044); buildDayModel picks the day's Stop.
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, ...v.where.item },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true, startTime: true, endTime: true, stopId: true },
    }),
    alongside({ tripId, trip, startDate, endDate, visibility: v, stopRows }),
  ]);

  const placeholders = v.placeholderItems.filter((p) => p.forkId === null && p.date !== null);
  const items: DayRows["items"] = [
    ...itemRows.map((it) => ({ ...it, bookingState: it.bookingState as BookingState, surprise: v.views.items.get(it.id) ?? null })),
    ...placeholders.map((p) => ({
      id: p.id, title: p.title, category: p.category, date: p.date, startTime: p.startTime, endTime: p.endTime,
      sortOrder: p.sortOrder, stopId: p.stopId, lat: p.lat, lng: p.lng, address: p.address, link: p.link,
      booking: p.booking, notes: p.notes, hiddenFromShares: p.hiddenFromShares, photoAttachmentId: p.photoAttachmentId,
      slotTime: p.slotTime, arriveByMinutes: p.arriveByMinutes, refundable: p.refundable,
      bookingState: p.bookingState, bookingStateSet: p.bookingStateSet, bookBy: p.bookBy,
      surprise: p.surprise,
    })),
  ];

  return {
    rows: {
      trip, startDate, endDate,
      stops: maskSurpriseStops(stops, v, v.views.stops),
      items,
      // The String column holds a BOOKING_STATES value (every writer stores lib/booking-state.ts bookingStateWrite's result).
      transports: transports as DayRows["transports"],
      accommodations: accommodations as DayRows["accommodations"],
      wishlist, attachments, chapters, dayTitles, thingsToDo,
    },
    visibility: v,
    alongside: extra,
  };
}
