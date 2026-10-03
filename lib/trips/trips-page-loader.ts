/**
 * Everything /trips needs, in one place (spec 2026-09-28-trips-page-carousel).
 * Plain lib module (takes userId from the page's own requireUser). Real plan
 * only. Each trip is judged against its own today (tripTodayISO).
 */
import { db } from "@/lib/db";
import { tripPath } from "@/lib/trip-path";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { nightsBetween, todayISO } from "@/lib/dates";
import { tripTodayISO } from "@/lib/trip-today";
import { computeTripPhase } from "@/lib/trip-phase";
import { TRAVELLER_SELECT, travellerFirstName } from "@/lib/traveller";
import { loadYourTravels } from "@/lib/travel-stats-loader";
import { loadNextSteps } from "@/lib/next-steps-loader";
import { listRemindersForTrip } from "@/server/actions/reminders";
import { sortTheseOut } from "@/lib/sort-these-out";
import type { TravelStats } from "@/lib/travel-stats";
import { assignTripHues } from "@/lib/trips/trip-colour";
import { roughMonthStamp } from "@/lib/rough-month";
import type { SketchStop } from "@/lib/trips/route-sketch";
import {
  orderForCarousel, cardKind, cardBigNumber, cardDateLine, countUpcomingAndDone, type CardTrip,
} from "@/lib/trips/trip-status";
import type { TripCardModel } from "@/components/trips/trip-card";
import type { TravelMapTrip } from "@/components/trips/travel-map";

export interface TripsPageData {
  firstName: string;
  cards: TripCardModel[];
  counts: { upcoming: number; done: number };
  hasDoneTrip: boolean;
  anyStops: boolean;
  /** Null when "Your travels" failed to load — the page shows the map failure panel (I5) instead of a silently blank map. */
  mapTrips: TravelMapTrip[] | null;
  /** Null when the stats failed to load — the page hides the Tally (§9). */
  stats: TravelStats | null;
}

export async function loadTripsPage(userId: string, today?: string): Promise<TripsPageData> {
  const [me, memberships] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: TRAVELLER_SELECT }),
    db.tripMember.findMany({
      where: { userId, trip: { deletedAt: null } },
      select: {
        role: true,
        trip: {
          select: {
            id: true, slug: true, name: true, startDate: true, endDate: true, roughMonth: true, createdAt: true,
            coverImageKey: true, coverFocalX: true, coverFocalY: true, homeLat: true, homeLng: true,
            stops: {
              where: REAL_PLAN,
              orderBy: { sortOrder: "asc" },
              select: { id: true, name: true, lat: true, lng: true, arriveDate: true, departDate: true, nights: true, sortOrder: true, timezone: true, countryCode: true },
            },
          },
        },
      },
    }),
  ]);
  const firstName = me ? travellerFirstName(me) : "there";
  const trips = memberships.map((m) => m.trip);
  const fallbackToday = today ?? todayISO();
  const todayByTripId = new Map(trips.map((t) => [t.id, today ?? tripTodayISO(t.stops)]));
  const hues = assignTripHues(trips);

  const cardTrips: CardTrip[] = trips.map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, createdAt: t.createdAt, stopCount: t.stops.length }));
  const ordered = orderForCarousel(cardTrips, fallbackToday, todayByTripId);
  const byId = new Map(trips.map((t) => [t.id, t]));

  // The hero's next step: one extra query set, for the first trip only.
  let firstNextStep: TripCardModel["nextStep"] = null;
  const first = ordered[0];
  const firstPhase = first ? computeTripPhase({ startDate: first.startDate, endDate: first.endDate, today: todayByTripId.get(first.id) ?? fallbackToday }) : null;
  if (first && firstPhase && firstPhase !== "past" && firstPhase !== "sketching") {
    const firstToday = todayByTripId.get(first.id) ?? fallbackToday;
    try {
      const [steps, reminders] = await Promise.all([
        loadNextSteps(first.id, firstToday),
        listRemindersForTrip(first.id, firstToday),
      ]);
      const row = sortTheseOut({ steps, reminders, today: firstToday, basePath: tripPath(byId.get(first.id)?.slug ?? first.id) }).rows[0];
      firstNextStep = row?.href ? row : null;
    } catch {
      firstNextStep = null;
    }
  }

  let standardIndex = 0;
  const cards: TripCardModel[] = ordered.map((ct, i) => {
    const t = byId.get(ct.id)!;
    const ref = t.slug ?? t.id;
    const tToday = todayByTripId.get(t.id) ?? fallbackToday;
    const kind = cardKind(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today: tToday }), i === 0);
    const plan = orderPlanStops(t.stops);
    const sketchStops: SketchStop[] = plan
      .filter((s): s is typeof s & { lat: number; lng: number } => s.lat != null && s.lng != null)
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, nights: s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : (s.nights ?? 0) }));
    const currentStop = plan.find((s) => s.arriveDate && s.departDate && s.arriveDate <= tToday && tToday <= s.departDate)?.name ?? null;
    const big = cardBigNumber({ kind, startDate: t.startDate, endDate: t.endDate, today: tToday, roughMonth: t.roughMonth });
    // Only the FIRST card is ever the hero (§ "the hero's next step: one extra
    // query set, for the first trip only", above) — `kind` alone isn't enough:
    // a second travelling trip also carries "on-the-road", and without the
    // `i === 0` guard it would wrongly get `index: 0` (colliding with the
    // real hero) and the hero's own `firstNextStep` (Minor 7).
    const isHeroCard = i === 0 && (kind === "up-next" || kind === "on-the-road");
    return {
      id: t.id,
      ref,
      name: t.name,
      kind,
      big,
      dateLine: cardDateLine({ kind, startDate: t.startDate, endDate: t.endDate, stopCount: t.stops.length, today: tToday, currentStop }),
      href: tripPath(ref),
      index: isHeroCard ? 0 : standardIndex++,
      nextStep: isHeroCard ? firstNextStep : null,
      cover: {
        tripId: t.id,
        name: t.name,
        hue: hues.get(t.id) ?? "coral",
        photo: t.coverImageKey ? { url: `/api/trips/${t.id}/cover?v=${encodeURIComponent(t.coverImageKey)}`, focalX: t.coverFocalX, focalY: t.coverFocalY, version: t.coverImageKey } : null,
        stops: sketchStops,
        startDate: t.startDate,
        stampDateLabel: !t.startDate && t.roughMonth ? roughMonthStamp(t.roughMonth) : null,
        canEdit: true,
      },
    };
  });

  let stats: TravelStats | null = null;
  let mapTrips: TravelMapTrip[] | null = [];
  try {
    const travels = await loadYourTravels(userId, today);
    stats = travels.stats;
    mapTrips = travels.mapTrips.map((m) => ({ id: m.id, name: m.name, when: m.when, points: m.points, hue: hues.get(m.id) ?? "coral" }));
  } catch (err) {
    console.error("[trips] Your travels failed to load:", err);
    mapTrips = null;
  }

  const counts = countUpcomingAndDone(cardTrips, fallbackToday, todayByTripId);
  return {
    firstName,
    cards,
    counts,
    hasDoneTrip: counts.done > 0,
    anyStops: trips.some((t) => t.stops.length > 0),
    mapTrips,
    stats,
  };
}
