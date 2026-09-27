import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { requireTripAccess } from "@/lib/guards";
import { WhatsNewBanner } from "@/components/whats-new/whats-new-banner";
import { todayISOInZone, currentTripTimezone, instantToZonedDateISO } from "@/lib/tz";
import { computeTripPhase } from "@/lib/trip-phase";
import { PhaseSketching } from "@/components/trip/home/phase-sketching";
import { PhasePlanning } from "@/components/trip/home/phase-planning";
import { PhaseTravelling } from "@/components/trip/home/phase-travelling";
import { PhasePast } from "@/components/trip/home/phase-past";
import { TripCover, TripCoverCard } from "@/components/trip/trip-cover";
import { RemindersCard } from "@/components/trip/reminders-card";
import { listRemindersForTrip } from "@/server/actions/reminders";
import { orderPlanStops } from "@/lib/plan-order";
import type { HomeTripInput } from "@/lib/desktop-home-loader";
import { isTripOwnerOrAdmin } from "@/lib/access";
import { TRAVELLER_SELECT, travellerFirstName, type TravellerLike } from "@/lib/traveller";
import { countdownFor, firstLegLine } from "@/lib/countdown";
import { getUnreadActivityCount, getRecentActivity } from "@/server/actions/activity";
import { HomeHeader, homeMetaLine } from "@/components/trip/home/desktop/home-header";
import { DesktopHomeGrid } from "@/components/trip/home/desktop/desktop-home-grid";
import { CountdownTile } from "@/components/trip/home/desktop/countdown-tile";
import { SharedPotTile } from "@/components/trip/home/desktop/shared-pot-tile";
import { RouteMapTile } from "@/components/trip/home/desktop/route-map-tile";
import { SortTheseOutTile } from "@/components/trip/home/desktop/sort-these-out-tile";
import { loadHomePlanningData } from "@/lib/desktop-home-loader";
import { buildHomeMapStops } from "@/lib/home-map-stops";
import { sortTheseOut } from "@/lib/sort-these-out";
import type { NextStep } from "@/lib/next-steps";
import type { ReminderItem } from "@/server/actions/reminders";
import type { TripPhase } from "@/lib/trip-phase";

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
  const { user, membership } = await requireTripAccess(tripId);

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
      coverFocalX: true,
      coverFocalY: true,
      coverAspect: true,
      homeName: true,
      homeLat: true,
      homeLng: true,
      homeCountryCode: true,
      roundTrip: true,
      chaptersEnabled: true,
      members: { select: { user: { select: TRAVELLER_SELECT } } },
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

  const coverProps = {
    tripId,
    name: trip.name,
    hasCover: trip.coverImageKey != null,
    stops: coverStops.map((s) => ({ lat: s.lat as number, lng: s.lng as number })),
    home: trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null,
    roundTrip: trip.roundTrip ?? false,
    coverVersion: trip.coverImageKey,
    focalX: trip.coverFocalX,
    focalY: trip.coverFocalY,
  };

  // Sketching, Travelling and Past keep the full-width cover above the Phase.
  // Taller on a phone than on desktop, deliberately: the band spans the full
  // content width, so on a wide screen extra height makes an enormous band,
  // while on a phone it is the only way a portrait cover gets real room.
  const cover = (
    <TripCoverCard className="mb-2 h-56 w-full sm:h-48">
      <TripCover {...coverProps} />
    </TripCoverCard>
  );

  // Planning/Final-prep: the cover is a tile in the Phase's grid (spec E2),
  // beside the countdown hero. From lg its grid cell sets the size — the
  // cover is pinned inside it (absolute) so the photo's own height never
  // drives the row; below lg it keeps the phone band's height.
  const coverTile = (
    <TripCoverCard className="h-56 w-full sm:h-48 lg:h-auto lg:min-h-36">
      <TripCover {...coverProps} variant="tile" className="lg:absolute lg:inset-0" />
    </TripCoverCard>
  );

  // Reminders are a Trip's dated notes and belong on Home in *every* Phase —
  // they used to render only inside PhaseTravelling, so on a trip that had not
  // started nobody could see or write one.
  const reminders = await listRemindersForTrip(tripId, today);

  // Reminders join whichever Phase's own right column/aside, rather than a
  // full-width row of their own below it (LA-029/045) — each phase component
  // renders this node at the end of its aside (desktop) / single column
  // (mobile). Task 16: the desktop (lg+) Sketching/Planning/Final-prep Home
  // has no Reminders panel — a Reminder shows there as a "Sort these out" row
  // from 7 days before its date. The phone tree (no such tile) keeps the card.
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
        return <PhaseTravelling tripId={tripId} userId={user.id} reminders={remindersEl} />;
      case "past":
        return <PhasePast tripId={tripId} trip={trip} reminders={remindersEl} />;
      default: // planning | final-prep
        return (
          <PhasePlanning
            tripId={tripId}
            trip={trip}
            today={today}
            phase={phase}
            reminders={remindersEl}
            reminderItems={reminders}
            cover={coverTile}
          />
        );
    }
  })();

  const phoneTree = (
    <>
      {phase === "planning" || phase === "final-prep" ? null : cover}
      {phaseEl}
    </>
  );

  // Spec C: at lg+ the Sketching/Planning/Final-prep Home is the desktop
  // layout — header + 12-col grid. Below lg the phone Phase tree above renders
  // unchanged. Travelling/Past keep the phone tree at every width until their
  // own desktop layout (spec D) lands.
  const desktop = phase === "sketching" || phase === "planning" || phase === "final-prep";

  return (
    <>
      <span hidden data-trip-phase={phase} />
      <WhatsNewBanner className="mb-6" />
      {desktop ? (
        <>
          <div className="lg:hidden">{phoneTree}</div>
          {await renderDesktopHome({
            tripId,
            trip,
            today,
            phase,
            reminders,
            userId: user.id,
            isOwner: isTripOwnerOrAdmin(membership, user.email),
            fallbackTraveller: { id: user.id, name: user.name ?? null, image: null, email: user.email },
          })}
        </>
      ) : (
        phoneTree
      )}
    </>
  );
}

/**
 * The desktop (lg+) Home for Sketching / Planning / Final prep (spec C,
 * docs/specs/2026-09-27-desktop-home.md §2–§4): HomeHeader owns the page's
 * h1, bell, people and "+ Add a stop" here (the trip layout's header is
 * lg:hidden on Home — ruling R2). The Shared pot, Route map and "Sort these
 * out" slots are filled by their own tiles.
 *
 * A plain async function the page awaits (not an async component), so the
 * page renders as one tree — the same way the page test renders it.
 */
async function renderDesktopHome({
  tripId,
  trip,
  today,
  phase,
  reminders,
  userId,
  isOwner,
  fallbackTraveller,
}: {
  tripId: string;
  trip: HomeTripInput & {
    name: string;
    startDate: string | null;
    endDate: string | null;
    homeCurrency: string;
    homeName: string | null;
    coverImageKey: string | null;
    coverFocalX: number | null;
    coverFocalY: number | null;
    coverAspect: number | null;
    members: { user: TravellerLike }[];
    stops: { timezone: string | null; arriveDate: string | null; departDate: string | null; id: string; sortOrder: number }[];
  };
  today: string;
  phase: TripPhase;
  reminders: ReminderItem[];
  userId: string;
  isOwner: boolean;
  fallbackTraveller: TravellerLike;
}) {
  const base = `/trips/${tripId}`;
  const [unreadCount, recent, planning, leg] = await Promise.all([
    getUnreadActivityCount(tripId),
    getRecentActivity(tripId, 10),
    // Same object as PhasePlanning gets, so the phone tree's call on this
    // request is a cache hit (lib/desktop-home-loader.ts).
    loadHomePlanningData(tripId, today, phase, trip),
    // The first Transport leg: earliest departure; legs with no time yet
    // after those, in their own order.
    db.transport.findFirst({
      where: { tripId, ...REAL_PLAN },
      orderBy: [{ depAt: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }],
      select: {
        depAt: true,
        depPlace: true,
        arrPlace: true,
        depIsHome: true,
        fromStop: { select: { name: true, timezone: true } },
        toStop: { select: { name: true } },
      },
    }),
  ]);

  const planStops = planning.planStops;
  const members = trip.members.map((m) => m.user);
  const me = members.find((m) => m.id === userId) ?? fallbackTraveller;
  const zone = leg?.fromStop?.timezone ?? currentTripTimezone(orderPlanStops(trip.stops));

  const firstLeg = firstLegLine({
    transport: leg
      ? {
          depDate: leg.depAt ? instantToZonedDateISO(leg.depAt, zone) : null,
          origin: leg.depIsHome ? null : (leg.fromStop?.name ?? leg.depPlace ?? null),
          destination: leg.toStop?.name ?? leg.arrPlace ?? null,
        }
      : null,
    homeName: trip.homeName,
    firstStop: planStops[0] ?? null,
  });

  const nextPayment = planning.upcomingPayments[0] ?? null;

  // Spec §9: with no Stops yet, "Sort these out" suggests adding one.
  const firstStopStep: NextStep = {
    id: "nudge-first-stop",
    title: "Add your first stop",
    subtitle: "We'll draw the route as you go",
    href: `${base}/plan?add=stop`,
    severity: "info",
    source: "nudge",
  };
  const sort = sortTheseOut({
    steps: planStops.length === 0 ? [firstStopStep, ...planning.steps] : planning.steps,
    reminders,
    today,
    basePath: base,
  });

  const hasCover = trip.coverImageKey != null;
  const cover = hasCover
    ? {
        url: `/api/trips/${tripId}/cover?v=${encodeURIComponent(trip.coverImageKey!)}`,
        aspect: trip.coverAspect,
        version: trip.coverImageKey,
        focalX: trip.coverFocalX,
        focalY: trip.coverFocalY,
      }
    : null;

  return (
    <div data-testid="desktop-home" className="hidden flex-col gap-5 lg:flex">
      <HomeHeader
        firstName={travellerFirstName(me)}
        tripName={trip.name}
        metaLine={homeMetaLine({
          startDate: trip.startDate,
          endDate: trip.endDate,
          stopCount: planStops.length,
          currency: trip.homeCurrency,
        })}
        unreadCount={unreadCount}
        recent={recent}
        members={members}
        tripId={tripId}
        isOwner={isOwner}
      />
      <DesktopHomeGrid
        hasCover={hasCover}
        countdown={
          <CountdownTile
            href={`/trips/${tripId}/plan`}
            status="PLANNING"
            countdown={countdownFor({ startDate: trip.startDate, endDate: trip.endDate, today })}
            firstLeg={firstLeg}
            cover={cover}
            tripId={tripId}
          />
        }
        pot={
          <SharedPotTile
            href={`${base}/budget`}
            hasCover={hasCover}
            costTotalMinor={planning.budget.grandTotal.costTotalMinor}
            paidTotalMinor={planning.budget.grandTotal.paidTotalMinor}
            currency={trip.homeCurrency}
            nextPayment={
              nextPayment
                ? {
                    amountMinor: nextPayment.costMinor,
                    currency: nextPayment.currency,
                    label: nextPayment.label,
                    dueDate: nextPayment.dueDate,
                  }
                : null
            }
          />
        }
        map={<RouteMapTile stops={buildHomeMapStops(planStops)} tripId={tripId} stopCount={planStops.length} />}
        sort={<SortTheseOutTile rows={sort.rows} total={sort.total} seeAllHref={`${base}/summary`} />}
      />
    </div>
  );
}
