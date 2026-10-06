import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { REAL_PLAN } from "@/lib/plan-scope";
import { requireTripAccess } from "@/lib/guards";
import { WhatsNewBanner } from "@/components/whats-new/whats-new-banner";
import { currentTripTimezone, instantToZonedDateISO } from "@/lib/tz";
import { tripTodayISO } from "@/lib/trip-today";
import { computeTripPhase } from "@/lib/trip-phase";
import { PhaseSketching } from "@/components/trip/home/phase-sketching";
import { PhasePlanning } from "@/components/trip/home/phase-planning";
import { PhaseTravelling } from "@/components/trip/home/phase-travelling";
import { PhasePast } from "@/components/trip/home/phase-past";
import { TripCoverCard } from "@/components/trip/trip-cover-card";
import { CoverArt } from "@/components/trips/trip-cover";
import { showsPortraitCoverFrame } from "@/lib/cover";
import { cn } from "@/lib/cn";
import { assignTripHues } from "@/lib/trips/trip-colour";
import { RemindersCard } from "@/components/trip/reminders-card";
import { listRemindersForTrip } from "@/server/actions/reminders";
import { readMemberTrips } from "@/lib/membership-reads";
import { orderPlanStops } from "@/lib/plan-order";
import { nightsBetween } from "@/lib/dates";
import { homeStats } from "@/lib/home-stats";
import type { HomeTripInput } from "@/lib/desktop-home-loader";
import { isTripOwnerOrAdmin } from "@/lib/access";
import { TRAVELLER_SELECT, travellerFirstName, type TravellerLike } from "@/lib/traveller";
import { countdownFor, firstLegLine } from "@/lib/countdown";
import { readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";
import { HomeHeader, homeMetaLine } from "@/components/trip/home/desktop/home-header";
import { HOME_STACK } from "@/components/trip/home/spacing";
import { DesktopHomeGrid } from "@/components/trip/home/desktop/desktop-home-grid";
import { CountdownTile } from "@/components/trip/home/desktop/countdown-tile";
import { ArrivalDropIn } from "@/components/trip/home/desktop/arrival-drop-in";
import { SharedPotTile } from "@/components/trip/home/desktop/shared-pot-tile";
import { RouteMapTile } from "@/components/trip/home/desktop/route-map-tile";
import { SortTheseOutTile } from "@/components/trip/home/desktop/sort-these-out-tile";
import { loadHomePlanningData } from "@/lib/desktop-home-loader";
import { buildHomeMapStops } from "@/lib/home-map-stops";
import { sortTheseOut, SORT_ROW_LIMIT_DESKTOP } from "@/lib/sort-these-out";
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

  // One wave after the gate (spec 2026-10-06 §C): the Trip, its located
  // Stops for the cover, the viewer's Trips (for the hue — the same cache()d
  // read the app layout makes) and the Reminders, which wait only for the
  // Trip's own today. `.then((row) => row)` turns the Prisma query into one
  // settled promise both consumers share.
  const tripPromise = db.trip
    .findUnique({
      where: { id: tripId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        hardEndDate: true,
        roughMonth: true,
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
    })
    .then((row) => row);
  const [trip, coverStopsRaw, myTrips, reminders] = await Promise.all([
    tripPromise,
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN, lat: { not: null }, lng: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true, arriveDate: true, departDate: true, lat: true, lng: true },
    }),
    readMemberTrips(user.id, user.email ?? null),
    // Reminders are a Trip's dated notes and belong on Home in *every* Phase
    // (see remindersEl below). "today" is the Trip's own.
    tripPromise.then((row) => (row ? listRemindersForTrip(tripId, tripTodayISO(row.stops)) : [])),
  ]);
  if (!trip) notFound();

  // ADR 0038: a scheduled stop's position IS its dates — the cover map's
  // route order must follow canonical plan order, not raw sortOrder.
  const coverStops = orderPlanStops(coverStopsRaw);

  // Same canonical order for the "current timezone" pick — trip.stops is
  // fetched by sortOrder, which no longer tracks date order under ADR 0038.
  const today = tripTodayISO(trip.stops);
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });

  // Trip colour is per viewer (creation order among the viewer's trips).
  const hue = assignTripHues(myTrips.map((m) => m.trip)).get(tripId) ?? "coral";

  // Byte-identical to the layout's own coverUrl (app/(app)/trips/[tripId]/layout.tsx)
  // and the Trips list's (lib/trips/trips-page-loader.ts) — same cache key.
  const coverUrl = trip.coverImageKey
    ? `/api/trips/${tripId}/cover?v=${encodeURIComponent(trip.coverImageKey)}`
    : null;

  const coverArt = {
    tripId,
    name: trip.name,
    hue,
    photo: coverUrl
      ? {
          url: coverUrl,
          focalX: trip.coverFocalX,
          focalY: trip.coverFocalY,
          version: trip.coverImageKey,
        }
      : null,
    stops: coverStops.map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat as number,
      lng: s.lng as number,
      nights: s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : 0,
    })),
    startDate: trip.startDate,
    canEdit: false, // the Home has its own "+ Add a photo" / "Change" (countdown tile)
  } as const;

  // Spec 2026-10-05 §I: below sm a portrait photo shows whole in a small
  // frame beside the trip name (the layout's header — PortraitCoverFrame),
  // so the band steps aside there. sm+ and landscape/square/unknown keep it.
  // Gated on the same compound condition as the layout's own frame check
  // (`coverUrl && showsPortraitCoverFrame(trip)`) so band and frame can never
  // disagree about whether there's a cover to show (final review #4).
  const phonePortrait = !!coverUrl && showsPortraitCoverFrame(trip);

  // Sketching, Travelling and Past keep the full-width cover above the Phase.
  // Taller on a phone than on desktop, deliberately: the band spans the full
  // content width, so on a wide screen extra height makes an enormous band,
  // while on a phone it is the only way a portrait cover gets real room.
  // No ad-hoc margin here (spec §E) — it is a stack child, spaced from the
  // Phase below it by the phone tree's own HOME_STACK gap.
  const cover = (
    <TripCoverCard className={cn("h-56 w-full sm:h-48", phonePortrait && "max-sm:hidden")}>
      <CoverArt {...coverArt} size="hero" box="band" sizesPx="100vw" />
    </TripCoverCard>
  );

  // Planning/Final-prep: the cover is a tile in the Phase's grid (spec E2),
  // beside the countdown hero. From lg its grid cell sets the size — the
  // cover is pinned inside it (absolute) so the photo's own height never
  // drives the row; below lg it keeps the phone band's height.
  const coverTile = (
    <TripCoverCard className="h-56 w-full sm:h-48 lg:h-auto lg:min-h-36">
      <CoverArt {...coverArt} size="hero" box="band" sizesPx="50vw" className="lg:absolute lg:inset-0" />
    </TripCoverCard>
  );

  // Reminders are a Trip's dated notes and belong on Home in *every* Phase —
  // they used to render only inside PhaseTravelling, so on a trip that had not
  // started nobody could see or write one.
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
            coverClassName={phonePortrait ? "max-sm:hidden" : undefined}
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

  // Spec C/D: at lg+ every Phase's Home is the desktop layout — header +
  // 12-col grid (Travelling and Past render their own grid, spec D). Below lg
  // the phone Phase tree above renders unchanged. CSS switches between them.
  return (
    <>
      <span hidden data-trip-phase={phase} />
      <WhatsNewBanner className="mb-6" />
      <div className={`${HOME_STACK} lg:hidden`}>{phoneTree}</div>
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
  );
}

/**
 * The desktop (lg+) Home (spec C, docs/specs/2026-09-27-desktop-home.md
 * §2–§4; spec D for Travelling/Past): HomeHeader owns the page's h1, bell,
 * people and "+ Add a stop" here (the trip layout's header is lg:hidden on
 * Home — ruling R2). Sketching/Planning/Final prep fill the Shared pot, Route
 * map and "Sort these out" slots with their own tiles; Travelling and Past
 * render their Phase's desktop grid, which reads the same cache()d model as
 * the phone Phase on this request.
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
    roughMonth: string | null;
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
  const slug = await tripSlugFor(tripId);
  const base = tripPath(slug);
  const members = trip.members.map((m) => m.user);
  const me = members.find((m) => m.id === userId) ?? fallbackTraveller;

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

  const header = (unreadCount: number, recent: Awaited<ReturnType<typeof readRecentActivity>>) => (
    <HomeHeader
      firstName={travellerFirstName(me)}
      tripName={trip.name}
      metaLine={homeMetaLine({
        startDate: trip.startDate,
        endDate: trip.endDate,
        currency: trip.homeCurrency,
      })}
      unreadCount={unreadCount}
      recent={recent}
      members={members}
      tripId={tripId}
      tripSlug={slug}
      isOwner={isOwner}
    />
  );

  // Spec D: Travelling and Past — the header, then the Phase's own desktop
  // grid. `userId` matches the phone PhaseTravelling call so its cache()d
  // model is shared. Nights and Stops live on the countdown tile's stats
  // row, not the header: Travelling builds its own (the dated Stops it is
  // built from); Past has its own stat tiles (Nights among them).
  if (phase === "travelling" || phase === "past") {
    const [unreadCount, recent] = await Promise.all([
      readUnreadActivityCount(tripId),
      readRecentActivity(tripId, 10),
    ]);
    return (
      <div data-testid="desktop-home" className="hidden flex-col gap-5 lg:flex">
        {header(unreadCount, recent)}
        {phase === "travelling" ? (
          <PhaseTravelling tripId={tripId} userId={userId} layout="desktop" cover={cover} />
        ) : (
          <PhasePast tripId={tripId} trip={trip} layout="desktop" cover={cover} />
        )}
      </div>
    );
  }

  const [unreadCount, recent, planning, leg] = await Promise.all([
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
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
    limit: SORT_ROW_LIMIT_DESKTOP,
  });

  return (
    <div data-testid="desktop-home" className="hidden flex-col gap-5 lg:flex">
      {header(unreadCount, recent)}
      <DesktopHomeGrid
        hasCover={hasCover}
        countdown={
          <ArrivalDropIn tripId={tripId} className="h-full">
            <CountdownTile
              href={tripPath(slug, "/plan")}
              status="PLANNING"
              countdown={countdownFor({ startDate: trip.startDate, endDate: trip.endDate, today, roughMonth: trip.roughMonth })}
              firstLeg={firstLeg}
              cover={cover}
              tripId={tripId}
              stats={homeStats({
                startDate: trip.startDate,
                endDate: trip.endDate,
                stops: planStops,
                chaptersEnabled: trip.chaptersEnabled,
                chapterCount: planning.datedChapters.length + planning.undatedChapterCount,
              })}
            />
          </ArrivalDropIn>
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
