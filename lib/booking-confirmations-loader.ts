import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { tripTodayISO } from "@/lib/trip-today";
import { computeTripPhase } from "@/lib/trip-phase";
import { transportTimeDisplay } from "@/lib/time-display";
import { endZones } from "@/lib/leg-zones";
import { needsBookingConfirmation, type ConfirmationKind, type ConfirmationSubject } from "@/lib/booking-confirmation";
import { bookingPartners } from "@/lib/connections";

export interface BookingConfirmationToAdd {
  kind: ConfirmationKind;
  id: string;
}

export async function loadBookingConfirmationsToAdd(tripId: string, viewerId: string): Promise<BookingConfirmationToAdd[]> {
  const v = await loadSurpriseVisibility(tripId, viewerId);

  const [trip, stops, transports, accommodations, items] = await Promise.all([
    db.trip.findUniqueOrThrow({ where: { id: tripId }, select: { startDate: true, endDate: true, homeTimezone: true } }),
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: { id: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        id: true, mode: true, bookingState: true, nothingToAttach: true, reference: true,
        depPlace: true, arrPlace: true, depPlaceId: true, arrPlaceId: true, depAt: true, arrAt: true,
        fromStopId: true, toStopId: true, depIsHome: true, arrIsHome: true, depTimezone: true, arrTimezone: true,
      },
    }),
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN, bookingState: "BOOKED", ...v.where.accommodation },
      select: { id: true, nothingToAttach: true, checkOut: true },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, bookingState: "BOOKED", stopId: { not: null }, ...v.where.item },
      select: { id: true, nothingToAttach: true, date: true, photoAttachmentId: true },
    }),
  ]);

  const today = tripTodayISO(stops, trip.homeTimezone);
  if (computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today }) === "past") return [];

  const tzById = new Map(stops.map((s) => [s.id, s.timezone] as const));
  const subjects: ConfirmationSubject[] = [
    ...transports.filter((t) => t.bookingState === "BOOKED").map((t) => {
      const { fromTimezone, toTimezone } = endZones(t, (id) => (id ? tzById.get(id) : null));
      const { dep } = transportTimeDisplay({
        depAt: t.depAt, arrAt: t.arrAt, fromTimezone, toTimezone,
        depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: trip.homeTimezone,
      });
      return { kind: "TRANSPORT" as const, id: t.id, bookingState: "BOOKED", nothingToAttach: t.nothingToAttach, lastDay: dep?.dateISO ?? null };
    }),
    ...accommodations.map((a) => ({ kind: "ACCOMMODATION" as const, id: a.id, bookingState: "BOOKED", nothingToAttach: a.nothingToAttach, lastDay: a.checkOut })),
    ...items.map((i) => ({
      kind: "ITEM" as const, id: i.id, bookingState: "BOOKED", nothingToAttach: i.nothingToAttach, lastDay: i.date, photoAttachmentId: i.photoAttachmentId,
    })),
  ];
  if (subjects.length === 0) return [];

  const partners = bookingPartners(transports);
  const partnerIdsOf = (s: ConfirmationSubject) => (s.kind === "TRANSPORT" ? (partners.get(s.id) ?? []).map((p) => p.id) : []);

  const attachments = await db.attachment.findMany({
    where: {
      tripId,
      targetType: { in: ["TRANSPORT", "ACCOMMODATION", "ITEM"] },
      targetId: { in: [...new Set(subjects.flatMap((s) => [s.id, ...partnerIdsOf(s)]))] },
      ...v.where.attachment,
    },
    select: { id: true, targetType: true, targetId: true },
  });
  const idsByTarget = new Map<string, string[]>();
  for (const a of attachments) {
    const key = `${a.targetType}:${a.targetId}`;
    idsByTarget.set(key, [...(idsByTarget.get(key) ?? []), a.id]);
  }

  return subjects
    .filter((s) => {
      const ids = [s.id, ...partnerIdsOf(s)].flatMap((id) => idsByTarget.get(`${s.kind}:${id}`) ?? []);
      return needsBookingConfirmation(s, ids, today);
    })
    .sort((a, b) => (a.lastDay === b.lastDay ? 0 : a.lastDay === null ? 1 : b.lastDay === null ? -1 : a.lastDay < b.lastDay ? -1 : 1))
    .map((s) => ({ kind: s.kind, id: s.id }));
}
