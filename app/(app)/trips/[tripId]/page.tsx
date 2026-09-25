import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { requireTripAccess } from "@/lib/guards";
import { WhatsNewBanner } from "@/components/whats-new/whats-new-banner";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { computeTripPhase } from "@/lib/trip-phase";
import { PhaseSketching } from "@/components/trip/home/phase-sketching";
import { PhasePlanning } from "@/components/trip/home/phase-planning";
import { PhaseTravelling } from "@/components/trip/home/phase-travelling";
import { PhasePast } from "@/components/trip/home/phase-past";
import { TripCover, TripCoverCard } from "@/components/trip/trip-cover";
import { RemindersCard } from "@/components/trip/reminders-card";
import { listRemindersForTrip } from "@/server/actions/reminders";
import { orderPlanStops } from "@/lib/plan-order";

export default async function TripHomePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  // Called here, and again inside listRemindersForTrip below
  // (server/actions/reminders.ts:69). That is deliberate defence in depth —
  // every entry point guards itself rather than trusting its caller already
  // did — and it is free: requireTripAccess is wrapped in React's cache() and
  // memoised per request, keyed on tripId. Do NOT remove either call. The
  // full reasoning, including the one case where the memoisation is a trap,
  // is in the docblock on requireTripAccess in lib/guards.ts (RM-15).
  await requireTripAccess(tripId);

  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      homeCurrency: true,
      drivingWindingFactor: true,
      drivingAvgSpeedKph: true,
      coverImageKey: true,
      homeName: true,
      homeLat: true,
      homeLng: true,
      homeCountryCode: true,
      roundTrip: true,
      chaptersEnabled: true,
      stops: {
        where: { ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
      },
    },
  });
  if (!trip) notFound();

  const coverStopsRaw = await db.stop.findMany({
    where: { tripId, ...REAL_PLAN, lat: { not: null }, lng: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true, arriveDate: true, departDate: true, lat: true, lng: true },
  });
  // ADR 0038: a scheduled stop's position IS its dates — the cover map's
  // route order must follow canonical plan order, not raw sortOrder.
  const coverStops = orderPlanStops(coverStopsRaw);

  // Same canonical order for the "current timezone" pick — trip.stops is
  // fetched by sortOrder, which no longer tracks date order under ADR 0038.
  const today = todayISOInZone(currentTripTimezone(orderPlanStops(trip.stops)));
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });

  // Taller on a phone than on desktop, deliberately: the hero spans the full
  // content width, so on a wide screen extra height makes an enormous band,
  // while on a phone it is the only way a portrait cover gets real room.
  const cover = (
    <TripCoverCard className="-mt-2 mb-2 h-56 w-full sm:h-48">
      <TripCover
        tripId={tripId}
        name={trip.name}
        hasCover={trip.coverImageKey != null}
        stops={coverStops.map((s) => ({ lat: s.lat as number, lng: s.lng as number }))}
        home={trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null}
        roundTrip={trip.roundTrip ?? false}
        coverVersion={trip.coverImageKey}
      />
    </TripCoverCard>
  );

  // Reminders are a Trip's dated notes and belong on Home in *every* Phase —
  // they used to render only inside PhaseTravelling, so on a trip that had not
  // started nobody could see or write one.
  const reminders = await listRemindersForTrip(tripId, today);

  // Reminders join whichever Phase's own right column/aside, rather than a
  // full-width row of their own below it (LA-029/045) — each phase component
  // renders this node at the end of its aside (desktop) / single column
  // (mobile).
  const remindersEl = <RemindersCard tripId={tripId} reminders={reminders} today={today} />;

  const phaseEl = (() => {
    switch (phase) {
      case "sketching":
        return (
          <PhaseSketching
            tripId={tripId}
            tripName={trip.name}
            chaptersEnabled={trip.chaptersEnabled}
            reminders={remindersEl}
          />
        );
      case "travelling":
        return <PhaseTravelling tripId={tripId} reminders={remindersEl} />;
      case "past":
        return <PhasePast tripId={tripId} trip={trip} reminders={remindersEl} />;
      default: // planning | final-prep
        return (
          <PhasePlanning tripId={tripId} trip={trip} today={today} phase={phase} reminders={remindersEl} />
        );
    }
  })();

  return (
    <>
      <span hidden data-trip-phase={phase} />
      <WhatsNewBanner />
      {cover}
      {phaseEl}
    </>
  );
}
