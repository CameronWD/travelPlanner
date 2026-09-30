import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import type { ShareScope, ShareSection, ShareStage } from "@/lib/share-view";
import {
  currentLeg,
  dayIndex,
  groupDaysByStop,
  nextStopAfter,
  shareSections,
  shareStage,
  shareTally,
  stopStatuses,
  tonightsStay,
} from "@/lib/share-view";
import { formatDayLabel, formatWeekday, nightsBetween } from "@/lib/dates";
import { buildItinerary } from "@/lib/itinerary";
import { loadDayTitles } from "@/lib/day-titles-loader";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import { cn } from "@/lib/cn";
import type { RouteMapStop } from "@/components/trip/route-map";
import type { TransportMode } from "@/lib/enums";
import { homeMapPoint } from "@/lib/route-map";
import { describePhase } from "@/lib/trip-phase";
import { countdownFor } from "@/lib/countdown";
import { todayISOInZone, currentTripTimezone, instantToZonedDateISO, instantToZonedTime } from "@/lib/tz";
import { journalWritableDates } from "@/lib/journal-window";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { findShareLink, loadShareStops } from "@/lib/share-lookup";
import { shareTraveller } from "@/lib/share-traveller";
import { shareHrefs } from "@/lib/share-ref";
import { stopDotClass } from "@/lib/stop-colours";
import type { SketchStop } from "@/lib/trips/route-sketch";
import { ShareTopBar } from "./share-top-bar";
import { ShareHero } from "./share-hero";
import { RightNowCard, NextRow, type RightNowPlace } from "./right-now-card";
import { ShareTally } from "./share-tally";
import { ShareRouteList } from "./share-route-list";
import { DayByDay, type DayByDayStop } from "./day-by-day";
import { JournalPolaroids, buildJournalCards, type JournalPolaroidsProps } from "./journal-polaroids";
import { ShareCta, ShareFooter } from "./share-cta";
import { MODE_LABELS, buildShareRows, type ShareRowModel } from "./share-rows";

export { noOrphan } from "./no-orphan";

// ---------------------------------------------------------------------------
// Metadata — noindex so search engines don't index private trips
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Shared itinerary",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// Desktop placement per stage. The DOM order is the mobile order
// (shareSections, SHARE.md §1); lg:order-* rebuilds the two-column rows.
// ---------------------------------------------------------------------------

const PLACEMENT: Record<ShareStage, Partial<Record<ShareSection, string>>> = {
  before: { hero: "lg:order-1", route: "lg:order-2", map: "lg:order-3 lg:col-span-2", days: "lg:order-4 lg:col-span-2", cta: "lg:order-5 lg:col-span-2" },
  during: { hero: "lg:order-1", "right-now": "lg:order-2", next: "lg:hidden", map: "lg:order-3", route: "lg:order-4", days: "lg:order-5 lg:col-span-2", journal: "lg:order-6 lg:col-span-2", cta: "lg:order-7 lg:col-span-2" },
  after: { hero: "lg:order-1", tally: "lg:order-2 lg:self-start", journal: "lg:order-3 lg:col-span-2", map: "hidden lg:order-4 lg:block", route: "lg:order-5", days: "lg:order-6 lg:col-span-2", cta: "lg:order-7 lg:col-span-2" },
};

// ---------------------------------------------------------------------------
// Page — NO AUTH. Public read-only view via share token.
// Deliberately excludes: costs, budget, notes, confirmations.
// ---------------------------------------------------------------------------

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Resolve the token → trip. Invalid/revoked tokens show notFound.
  const shareLink = await findShareLink(token);

  if (!shareLink) notFound();

  const trip = shareLink.trip;
  const tripId = trip.id;
  // The public itinerary is a dated day-by-day projection; a date-less trip
  // has nothing dated to share yet.
  if (!trip.startDate || !trip.endDate) notFound();

  const scope: ShareScope = {
    includeAccommodation: shareLink.includeAccommodation,
    includeTransport: shareLink.includeTransport,
    includeDailyPlans: shareLink.includeDailyPlans,
  };

  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.

  // Fetch itinerary data — NO costs, no notes, no confirmations. An off dial
  // means the corresponding query never runs: hidden data never leaves the
  // database, so no rendering bug can leak it.
  const stops = await loadShareStops(tripId);

  const transports = scope.includeTransport
    ? await db.transport.findMany({
        where: { tripId, ...REAL_PLAN },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          mode: true,
          fromStopId: true,
          toStopId: true,
          depPlace: true,
          arrPlace: true,
          depAt: true,
          arrAt: true,
          // reference (booking number) and notes intentionally omitted — private
          sortOrder: true,
        },
      })
    : [];

  const accommodations = scope.includeAccommodation
    ? await db.accommodation.findMany({
        where: { tripId, ...REAL_PLAN },
        orderBy: { checkIn: "asc" },
        select: {
          id: true,
          stopId: true,
          name: true,
          address: true,
          checkIn: true,
          checkOut: true,
          checkInTime: true,
          checkOutTime: true,
          // confirmation intentionally omitted (private booking ref)
          // notes intentionally omitted
        },
      })
    : [];

  const items = scope.includeDailyPlans
    ? await db.item.findMany({
        // hiddenFromShares: false whatever the dials say (ADR 0051 floor) —
        // an Item marked hidden never reaches the public page, even when
        // includeDailyPlans is on.
        where: { tripId, ...REAL_PLAN, hiddenFromShares: false },
        orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          title: true,
          category: true,
          date: true,
          startTime: true,
          endTime: true,
          stopId: true,
          address: true,
          // link, booking, notes intentionally omitted
        },
      })
    : [];

  // Trip's own reference timezone and "today" (ADR 0010) — computed here,
  // ahead of the itinerary/phase code below, because the Journal section's
  // "arrived days" gate (spec L) needs it too.
  const timeZone = currentTripTimezone(stops);
  const todayISO = todayISOInZone(timeZone);

  // Build itinerary projection (dates + entries only)
  const itinerary = buildItinerary({
    startDate: trip.startDate,
    endDate: trip.endDate,
    stops: stops.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      timezone: s.timezone,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      sortOrder: s.sortOrder,
    })),
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      stopId: item.stopId,
      address: item.address,
    })),
    transports: transports.map((t) => ({
      id: t.id,
      mode: t.mode as TransportMode,
      fromStopId: t.fromStopId,
      toStopId: t.toStopId,
      depPlace: t.depPlace,
      arrPlace: t.arrPlace,
      depAt: t.depAt,
      arrAt: t.arrAt,
    })),
    accommodations: accommodations.map((a) => ({
      id: a.id,
      stopId: a.stopId,
      name: a.name,
      address: a.address,
      checkIn: a.checkIn,
      checkOut: a.checkOut,
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
    })),
  });

  // Day titles (CONTEXT.md "Day title", Task 5, spec §H) — only when the
  // link's includeDailyPlans is on; never in the Calendar feed. Gated at the
  // query itself (never calling loadDayTitles at all), not just the render,
  // so an off dial never even fetches them.
  const dayTitles = scope.includeDailyPlans
    ? await loadDayTitles(
        stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
      )
    : new Map<string, { title: string; stopId: string }>();

  // Journal ("How it's going", spec L / ADR 0051 amendment) — arrived Trip
  // days only, gated at the query itself: an off dial means none of these
  // three calls ever run at all, never mind what they'd return.
  //
  // hiddenFromShares is filtered in the `where`, not in JS (same pattern as
  // the Item query above): a body an author marked "Keep off Share links"
  // must never be selected into this page's props at all, not merely
  // dropped by the render. A photo has no `hiddenFromShares` of its own —
  // that lives on the (date, author) JournalEntry — so a second, minimal
  // query fetches just the hidden (date, authorId) pairs (no body, ever)
  // and the photo query excludes exactly those pairs at the query level too.
  const journalDates = journalWritableDates({
    startDate: trip.startDate,
    endDate: trip.endDate,
    today: todayISO,
  });
  const journalHiddenPairs = shareLink.includeJournal
    ? await db.journalEntry.findMany({
        where: { tripId, date: { in: journalDates }, hiddenFromShares: true },
        select: { date: true, authorId: true },
      })
    : [];
  const journalEntryRows = shareLink.includeJournal
    ? await db.journalEntry.findMany({
        where: { tripId, date: { in: journalDates }, hiddenFromShares: false },
        orderBy: [{ date: "desc" }, { createdAt: "asc" }],
        select: {
          date: true,
          authorId: true,
          body: true,
          author: { select: TRAVELLER_SELECT },
        },
      })
    : [];
  const journalPhotoRows = shareLink.includeJournal
    ? await db.attachment.findMany({
        where: {
          tripId,
          targetType: "JOURNAL",
          targetId: { in: journalDates },
          // Only photos (final review #11) — the link-scoped photo route
          // refuses non-images too; never list one it would 404.
          mime: { startsWith: "image/" },
          ...(journalHiddenPairs.length > 0
            ? {
                NOT: {
                  OR: journalHiddenPairs.map((p) => ({
                    targetId: p.date,
                    uploadedById: p.authorId,
                  })),
                },
              }
            : {}),
        },
        orderBy: [{ targetId: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          targetId: true,
          uploadedById: true,
          uploadedBy: { select: TRAVELLER_SELECT },
        },
      })
    : [];

  // "Show who's going" (ADR 0051 amendment 2026-09-30): off means this query
  // never runs. TRAVELLER_SELECT carries no email; never add it here.
  const members = shareLink.showTravellers
    ? await db.tripMember.findMany({
        where: { tripId },
        orderBy: { createdAt: "asc" },
        select: { user: { select: TRAVELLER_SELECT } },
      })
    : [];
  const travellers = members.map((m) => shareTraveller(m.user, { token, showPhoto: true }));

  const totalNights = nightsBetween(trip.startDate, trip.endDate);

  // Stage: which part of its life the trip is in (ADR 0010, SHARE.md §1),
  // from the trip's own reference timezone — the public page has no visitor clock.
  const phaseDesc = describePhase({
    startDate: trip.startDate,
    endDate: trip.endDate,
    today: todayISO,
  });
  const stage = shareStage(phaseDesc.phase);
  const now = new Date();

  const todayPlan = stage === "during" ? (itinerary.find((d) => d.dateISO === todayISO) ?? null) : null;
  const currentStopId = todayPlan?.stop?.id ?? null;
  const statuses = stopStatuses(stops, currentStopId, todayISO);
  // transports is [] when includeTransport is off, so no leg either.
  const leg = stage === "during" ? currentLeg(transports, now) : null;
  const currentStop = stops.find((s) => s.id === currentStopId) ?? null;
  const zone = currentStop?.timezone ?? timeZone;
  const localDateISO = todayISOInZone(zone);
  const nowHHMM = instantToZonedTime(now, zone);
  const next = nextStopAfter(stops, currentStopId ?? leg?.toStopId ?? null);
  const hrefs = shareHrefs(token);
  const stayTonight = stage === "during" ? tonightsStay(accommodations, todayISO) : null;
  const zoneOf = (stopId: string | null) => stops.find((s) => s.id === stopId)?.timezone ?? zone;

  // ── Right now (During) ──
  let place: RightNowPlace = { kind: "none" };
  if (leg) {
    const to = stops.find((s) => s.id === leg.toStopId);
    place = {
      kind: "leg",
      toName: to?.name ?? leg.arrPlace ?? "the next stop",
      mode: leg.mode,
      landsAt: leg.arrAt ? instantToZonedTime(leg.arrAt, zoneOf(leg.toStopId)) : null,
    };
  } else if (currentStop) {
    place = {
      kind: "stop",
      name: currentStop.name,
      country: currentStop.country,
      night: nightsBetween(currentStop.arriveDate, todayISO) + 1,
      nights: nightsBetween(currentStop.arriveDate, currentStop.departDate),
      dayTitle: dayTitles.get(todayISO)?.title ?? null,
      next: next ? { name: next.name, weekday: formatWeekday(next.arriveDate) } : null,
    };
  }

  let rightNowRows: ShareRowModel[] | null =
    scope.includeDailyPlans && todayPlan ? buildShareRows(todayPlan, { nowHHMM, withAddress: false }) : null;
  if (rightNowRows && leg && !rightNowRows.some((r) => r.key === `transport-departure-${leg.id}`)) {
    const toName = place.kind === "leg" ? place.toName : null;
    rightNowRows = [
      {
        key: `transport-departure-${leg.id}`,
        time: leg.depAt ? instantToZonedTime(leg.depAt, zoneOf(leg.fromStopId)) : null,
        title: `${MODE_LABELS[leg.mode] ?? "Transport"}${toName ? ` to ${toName}` : ""}`,
        sub: null,
        kind: "transport",
        category: null,
        mode: leg.mode,
        done: false,
      },
      ...rightNowRows,
    ];
  }

  // ── Next (During, mobile) ──
  const outgoing = currentStopId ? transports.find((t) => t.fromStopId === currentStopId) : undefined;
  const nextRow = next
    ? {
        name: next.name,
        dotClass: stopDotClass(next.sortOrder),
        right: outgoing
          ? {
              mode: outgoing.mode,
              label: outgoing.depAt
                ? `${formatDayLabel(instantToZonedDateISO(outgoing.depAt, zone))} · ${instantToZonedTime(outgoing.depAt, zone)}`
                : formatDayLabel(next.arriveDate),
            }
          : { mode: null, label: formatDayLabel(next.arriveDate) },
      }
    : null;

  // ── Day by day ──
  const daysByStop = groupDaysByStop(itinerary, stops.map((s) => s.id));
  const dayStops: DayByDayStop[] = stops.map((s, i) => {
    const following = stops[i + 1];
    const t = following ? transports.find((tr) => tr.fromStopId === s.id && tr.toStopId === following.id) : undefined;
    let legAfter: DayByDayStop["legAfter"] = null;
    if (t && following) {
      const depZone = s.timezone;
      const arrZone = following.timezone;
      const dep = [t.depPlace, t.depAt ? instantToZonedTime(t.depAt, depZone) : null].filter(Boolean).join(" ");
      const arr = [t.arrPlace, t.arrAt ? instantToZonedTime(t.arrAt, arrZone) : null].filter(Boolean).join(" ");
      const route = dep && arr ? `${dep} → ${arr}` : dep || arr;
      legAfter = {
        mode: t.mode,
        label: `${MODE_LABELS[t.mode] ?? "Transport"} to ${following.name}`,
        line: [t.depAt ? formatDayLabel(instantToZonedDateISO(t.depAt, depZone)) : null, route || null]
          .filter(Boolean)
          .join(" · "),
      };
    }
    return {
      id: s.id,
      name: s.name,
      number: i + 1,
      sortOrder: s.sortOrder,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      nights: nightsBetween(s.arriveDate, s.departDate),
      status: statuses.get(s.id) ?? "future",
      days: (daysByStop.get(s.id) ?? []).map((day) => ({
        dateISO: day.dateISO,
        isToday: stage === "during" && day.dateISO === todayISO,
        title: scope.includeDailyPlans ? (dayTitles.get(day.dateISO)?.title ?? null) : null,
        rows: buildShareRows(day, { nowHHMM: day.dateISO === localDateISO ? nowHHMM : null, withAddress: true }),
      })),
      legAfter,
    };
  });
  // Computed here so the client's first render matches (current stop during,
  // first stop before, everything folded after).
  const initialOpenId =
    stage === "before" ? (stops[0]?.id ?? null) : stage === "during" ? (currentStopId ?? next?.id ?? null) : null;

  // ── Journal ──
  const stopNameByDate = Object.fromEntries(
    itinerary.filter((d) => d.stop).map((d) => [d.dateISO, d.stop!.name]),
  );
  const journalProps: JournalPolaroidsProps = {
    token,
    dates: journalDates,
    entries: journalEntryRows,
    photos: journalPhotoRows,
    stage,
    stopNameByDate,
    showTravellers: shareLink.showTravellers,
  };
  const journalHasCards = shareLink.includeJournal && buildJournalCards(journalProps).length > 0;

  // ── Hero ──
  const countdown = countdownFor({ startDate: trip.startDate, endDate: trip.endDate, today: todayISO });
  const coverStops: SketchStop[] = stops.flatMap((s) =>
    s.lat != null && s.lng != null
      ? [{ id: s.id, name: s.name, lat: s.lat, lng: s.lng, nights: nightsBetween(s.arriveDate, s.departDate) }]
      : [],
  );

  // Route map stops
  const mapStops: RouteMapStop[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    arriveDate: s.arriveDate,
    departDate: s.departDate,
    sortOrder: s.sortOrder,
  }));

  const sections = shareSections(stage, {
    journal: journalHasCards,
    days: stops.length > 0 && (scope.includeAccommodation || scope.includeTransport || scope.includeDailyPlans),
    next: stage === "during" && nextRow != null,
    map: mapStops.length > 0,
  });

  function section(key: ShareSection) {
    switch (key) {
      case "hero":
        return (
          <ShareHero
            stage={stage}
            name={trip.name}
            startDate={trip.startDate!}
            endDate={trip.endDate!}
            totalNights={totalNights}
            stopCount={stops.length}
            countdown={stage === "before" && countdown.kind === "sleeps" ? { n: countdown.n, unit: countdown.unit } : null}
            progress={stage === "during" ? dayIndex({ startDate: trip.startDate!, endDate: trip.endDate!, today: todayISO }) : null}
            travellers={travellers}
            coverStops={coverStops}
            token={token}
          />
        );
      case "right-now":
        return (
          <RightNowCard
            timeZone={zone}
            localDateISO={localDateISO}
            nowHHMM={nowHHMM}
            place={place}
            rows={rightNowRows}
            dayTitle={scope.includeDailyPlans ? (dayTitles.get(todayISO)?.title ?? null) : null}
            tonight={stayTonight?.name ?? null}
          />
        );
      case "next":
        return nextRow ? <NextRow next={nextRow} /> : null;
      case "tally":
        return <ShareTally {...shareTally(stops, totalNights)} />;
      case "journal":
        return <JournalPolaroids {...journalProps} />;
      case "map":
        return (
          <section aria-label="Route map">
            <RouteMap
              stops={mapStops}
              home={homeMapPoint(trip)}
              showReturn={trip.roundTrip ?? false}
              progress={stage === "during" ? { stage, currentStopId } : { stage }}
              frameClassName={cn("rounded-3xl shadow-hard-4 lg:h-[400px]", stage === "during" ? "h-[180px]" : "h-[200px]")}
            />
          </section>
        );
      case "route":
        return (
          <ShareRouteList
            stage={stage}
            stops={stops.map((s) => ({
              id: s.id,
              name: s.name,
              country: s.country,
              sortOrder: s.sortOrder,
              arriveDate: s.arriveDate,
              departDate: s.departDate,
              nights: nightsBetween(s.arriveDate, s.departDate),
              status: statuses.get(s.id) ?? "future",
            }))}
          />
        );
      case "days":
        return <DayByDay stops={dayStops} initialOpenId={initialOpenId} />;
      case "cta":
        return <ShareCta stage={stage} stopCount={stops.length} hrefs={hrefs} />;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <ShareTopBar requestAccessHref={hrefs.requestAccess} />
      <main className="mx-auto w-full max-w-page-wide px-4 pb-5 pt-2 sm:px-6 lg:px-12 lg:pt-8">
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[7fr_5fr] lg:gap-6">
          {sections.map((key) => (
            <div key={key} data-share-section={key} className={cn("min-w-0", PLACEMENT[stage][key])}>
              {section(key)}
            </div>
          ))}
        </div>
        <ShareFooter />
      </main>
    </div>
  );
}
