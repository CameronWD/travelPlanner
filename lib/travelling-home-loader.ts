/**
 * The Travelling Home's ONE query path (spec D, Task 17): the phone Phase
 * (components/trip/home/phase-travelling.tsx, layout "phone") and the desktop
 * (lg+) 3-row grid (same component, layout "desktop") both render from this
 * model on the same request. Wrapped in React's `cache()` so the second call
 * — keyed on the primitive (tripId, userId) — is free.
 *
 * Deliberately NO auth import: the only caller is the trip Home page, which
 * has already run `requireTripAccess`. Policy (not a BND-2 spelling
 * exemption): a dated view — always the real plan, ignoring `?plan=`.
 *
 * Its day is read by `readDayRows` (lib/day-reads.ts) and assembled by
 * `buildDayModel` (lib/day-view-model.ts) — the Day view's own read and
 * assembly — so Today and the Day view agree by construction (card 3.M).
 * Surprise (ADR 0051): readDayRows applies the viewer's fragments, masking
 * and placeholders; this loader's own Cost read is whole: money stays in
 * spend so far (CONTEXT.md Surprise), and only the upcoming payment lines
 * drop the Costs owned by hidden Items and Accommodation. The planner's own
 * Surprises whose day has come (the Stop's arrive date or the Item's day on
 * or before the Trip's today) become `revealNudges`, the same nudge the
 * Planning Home's Next steps show.
 */
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { tripTodayISO } from "@/lib/trip-today";
import { effectiveTodayISO, type TransportDepartureEntry } from "@/lib/itinerary";
import { buildDayModel, buildDayEntryEditor, buildEditorBase } from "@/lib/day-view-model";
import { computeTripPhase } from "@/lib/trip-phase";
import { withDayMapHops } from "@/lib/day-map";
import { effectiveLocalMode, homePointOf } from "@/lib/travel-times/hops";
import { loadHolidayLines } from "@/lib/holidays/trip-days";
import { loadHopModes } from "@/lib/hop-modes";
import { loadTravelLookupFor } from "@/lib/travel-times/read";
import { readDayRows } from "@/lib/day-reads";
import { buildSpendSoFar, type SpendCost } from "@/lib/money/spend-so-far";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { resolveEndpointZones, zoneLabel } from "@/lib/time-display";
import { endZones } from "@/lib/leg-zones";
import type { BookingState, TransportMode } from "@/lib/enum-values";
import { REAL_PLAN, THINGS_TO_DO_WHERE } from "@/lib/plan-scope";
import { buildCostLabelMap } from "@/lib/money/cost-labels";
import { buildUpcomingPayments } from "@/lib/money/upcoming-payments";
import { applyFxRatesToCosts } from "@/lib/money/budget";
import { loadTodaysJournal } from "@/lib/journal-loader";
import { surprisesToReveal } from "@/lib/next-steps-builder";
import { revealSurpriseStep } from "@/lib/next-steps";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { nowNext, whereYouAre, type NowNextTimed } from "@/lib/now-next";
import { buildStillToBook } from "@/lib/still-to-book";
import { instantToZonedDateISO } from "@/lib/tz";

async function loadTravellingHomeUncached(tripId: string, userId: string | null) {
  // Reminders are NOT read here: the Reminders card is rendered by the trip
  // Home page in every Phase, not only while Travelling.
  const read = await readDayRows(tripId, userId, async (ctx) => {
    const [costs, exchangeRates, todaysJournal, slug, thingsToBook] = await Promise.all([
      db.cost.findMany({
        where: { tripId, ...REAL_PLAN },
        select: {
          id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, paidAt: true, refundMinor: true, refundedAt: true, dueDate: true,
          ownerType: true, ownerId: true, label: true, category: true, settlement: true,
        },
      }),
      db.exchangeRate.findMany({ where: { tripId }, select: { base: true, quote: true, rate: true } }),
      // Today's journal (spec K) — never for a day still ahead (CONTEXT.md
      // "Journal"): before day 1 the Trip's real today hasn't arrived, so
      // there's nothing to load or write. The day journaled is today clamped
      // to the Trip's own range — the same day this Phase treats as "today".
      ctx.stopRows.then((rows) => {
        const tripToday = tripTodayISO(rows, ctx.trip.homeTimezone);
        return userId && tripToday >= ctx.startDate
          ? loadTodaysJournal(tripId, effectiveTodayISO(tripToday, ctx.startDate, ctx.endDate), userId)
          : null;
      }),
      // For the reveal nudges' links; cache()d, so the Phase's own read is free.
      tripSlugFor(tripId),
      // Still to book: the day read holds only dated Items, so a Stop's undated things to do are read here.
      db.item.findMany({
        where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, bookingState: "TO_BOOK", ...ctx.visibility.where.item },
        select: { id: true, title: true, stopId: true, date: true, bookingState: true, bookBy: true },
      }),
    ]);
    return { costs, exchangeRates, todaysJournal, slug, thingsToBook };
  });
  if (read === "missing") notFound();
  // A date-less trip has no calendar to anchor "today" against — the Phase
  // renders its empty treatment.
  if (read === "dateless") return { kind: "no-dates" as const };

  const { rows, visibility: v, alongside: { costs, exchangeRates, todaysJournal, slug, thingsToBook } } = read;
  const { trip, startDate, endDate, stops, items, transports, accommodations, chapters } = rows;
  const base = tripPath(slug);

  // Trip's reference-timezone "today" (things-to-fix P0-2); every read above
  // is the real plan (dated views follow the real plan — CONTEXT.md).
  const today = tripTodayISO(stops, trip.homeTimezone);
  const effectiveDate = effectiveTodayISO(today, startDate, endDate);
  const day = buildDayModel(rows, effectiveDate, { fromHere: effectiveDate === today });
  const hopModesRead = loadHopModes(tripId);
  const [hopModes, travel, holidayLines] = await Promise.all([
    hopModesRead,
    hopModesRead.then((modes) => loadTravelLookupFor({ items, stops, transports, home: homePointOf(trip), hopModes: modes, accommodations })),
    loadHolidayLines(tripId, [effectiveDate]),
  ]);

  // Placeholders are hidden from this viewer, so never theirs to reveal.
  const revealNudges = userId
    ? surprisesToReveal({ views: v.views, viewerId: userId, today, stops, items }).map((s) => {
        const { id, title, href } = revealSurpriseStep(s, base);
        return { id, title, href };
      })
    : [];

  // The Day view's own editor for today, so Today's plan rows open the same details. Costs inside a Surprise hidden from the viewer are left out, as the Day view's read does.
  const hiddenOwners = new Set(v.hiddenOwnerIds);
  const editor = buildDayEntryEditor(
    rows,
    buildEditorBase(
      tripId,
      rows,
      costs.filter((c) => c.ownerId && !hiddenOwners.has(c.ownerId) && (c.ownerType === "ITEM" || c.ownerType === "TRANSPORT" || c.ownerType === "ACCOMMODATION")),
    ),
    day,
    computeTripPhase({ startDate, endDate, today }),
  );

  const isBeforeTrip = today < startDate;
  const isAfterTrip = today > endDate;
  const isWithinTrip = today >= startDate && today <= endDate;

  // The next departure that hasn't left yet, from today's entries onward.
  const now = new Date();
  const nextTransportDep =
    day.itinerary
      .filter((d) => d.dateISO >= effectiveDate)
      .flatMap((d) => d.transportEntries)
      .filter((e): e is TransportDepartureEntry => e.kind === "transport-departure")
      .filter((e) => e.transport.depAt != null && new Date(e.transport.depAt) > now)
      .sort((a, b) => new Date(a.transport.depAt!).getTime() - new Date(b.transport.depAt!).getTime())[0] ?? null;

  // ── Spend so far ──
  const homeCurrency = trip.homeCurrency;
  const spend = buildSpendSoFar({ costs: costs.map((c) => ({ ...c, ownerType: c.ownerType as SpendCost["ownerType"] })), homeCurrency, tripStart: startDate, tripEnd: endDate, today: effectiveDate });

  // ── Upcoming payments ── Owner labels (lib/money/cost-labels.ts) prefer the
  // linked Stop's current name over the Transport's free text.
  const stopName = new Map(stops.map((s) => [s.id, s.name] as const));
  const ownerNames = buildCostLabelMap({
    items: items.map((i) => ({ id: i.id, title: i.title })),
    accommodations: accommodations.map((a) => ({ id: a.id, name: a.name })),
    transports: transports.map((t) => ({
      id: t.id,
      mode: t.mode,
      depPlace: (t.fromStopId ? stopName.get(t.fromStopId) : null) ?? t.depPlace ?? null,
      arrPlace: (t.toStopId ? stopName.get(t.toStopId) : null) ?? t.arrPlace ?? null,
    })),
  });
  // `today` (trip-timezone "now"), not `effectiveDate` — a due date can fall
  // outside the trip. Surprise: the lines leave out money inside a Surprise
  // hidden from the viewer.
  const rateById = new Map(applyFxRatesToCosts({ costs, exchangeRates, homeCurrency }).map((c) => [c.id, c.rateToHome] as const));
  const lineCosts = costs
    .filter((c) => !c.ownerId || !hiddenOwners.has(c.ownerId))
    .map((c) => ({ ...c, rateToHome: rateById.get(c.id) ?? null }));
  const upcomingPayments = buildUpcomingPayments({ costs: lineCosts, ownerNames, homeCurrency, today });

  // Still to book, built as the Planning Home's is (lib/desktop-home-loader.ts).
  const tzById = new Map(stops.map((s) => [s.id, s.timezone] as const));
  const stillToBook = buildStillToBook(
    [
      ...[...items, ...thingsToBook].map((i) => ({
        kind: "ITEM" as const, id: i.id, label: i.title, bookingState: i.bookingState as BookingState, bookBy: i.bookBy, date: i.date, stopId: i.stopId,
      })),
      ...transports.map((t) => {
        const { fromTimezone, toTimezone } = endZones(t, (id) => (id ? tzById.get(id) : null));
        const { depTz } = resolveEndpointZones(fromTimezone, toTimezone, {
          depIsHome: t.depIsHome,
          arrIsHome: t.arrIsHome,
          homeTimezone: trip.homeTimezone,
        });
        return {
          kind: "TRANSPORT" as const, id: t.id, label: ownerNames.get(t.id) ?? "Transport", bookingState: t.bookingState, bookBy: t.bookBy,
          date: t.depAt ? instantToZonedDateISO(t.depAt, depTz) : null, stopId: t.anchorStopId ?? t.fromStopId ?? t.toStopId,
        };
      }),
      ...accommodations.map((a) => ({
        kind: "ACCOMMODATION" as const, id: a.id, label: a.name, bookingState: a.bookingState, bookBy: a.bookBy, date: a.checkIn, stopId: a.stopId,
      })),
    ],
    base,
  );

  // The next departure, resolved for display (TransportCountdown on the
  // phone, the desktop Today tile).
  const nextTransport =
    nextTransportDep && nextTransportDep.transport.depAt
      ? {
          id: nextTransportDep.transport.id,
          depAt: new Date(nextTransportDep.transport.depAt).toISOString(),
          depTimeLabel: nextTransportDep.depTimeLabel,
          // A Home departure has no fromStop of its own (CONTEXT.md "Home
          // base"): its zone is the Trip's own `homeTimezone` when set —
          // otherwise unchanged (a Stop's own zone, else no "→ UTC").
          depZone: zoneLabel(
            (nextTransportDep.transport.depIsHome && trip.homeTimezone) ||
              stops.find((s) => s.id === nextTransportDep.transport.fromStopId)?.timezone ||
              nextTransportDep.transport.depTimezone,
            effectiveDate,
          ),
          label: buildTransportLabel(nextTransportDep.transport),
          mode: nextTransportDep.transport.mode,
        }
      : null;

  const hereId = whereYouAre(stops, transports, now)?.stopId;
  const here = stops.find((s) => s.id === hereId) ?? null;

  const itemById = new Map(items.map((i) => [i.id, i] as const));
  const accomById = new Map(accommodations.map((a) => [a.id, a] as const));
  const located = (p: { lat: number | null; lng: number | null } | undefined) =>
    p?.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
  const todays: NowNextTimed[] = [
    ...(day.dayPlan?.timedItems ?? []).map(({ item }) => {
      const row = itemById.get(item.id);
      return {
        type: "item" as const, id: item.id, title: item.title, date: item.date!, time: item.startTime!,
        stopId: item.stopId ?? null, place: located(row), address: item.address ?? null,
      };
    }),
    ...(day.dayPlan?.accommodationEntries ?? []).flatMap(({ kind, accommodation: a }) => {
      const checkIn = kind === "accommodation-checkin";
      const time = checkIn ? a.checkInTime : a.checkOutTime;
      if (!time) return [];
      return [{
        type: "accommodation" as const, id: a.id, title: `${checkIn ? "Check-in" : "Check-out"}: ${a.name}`,
        date: checkIn ? a.checkIn : a.checkOut, time, stopId: a.stopId, place: located(accomById.get(a.id)), address: a.address ?? null,
      }];
    }),
  ];
  const nowNextCard = nowNext(
    {
      stops,
      transports: transports.map((t) => ({ ...t, mode: t.mode as TransportMode })),
      todays,
      home: { name: trip.homeName, timezone: trip.homeTimezone },
    },
    now,
  );

  return {
    kind: "dated" as const,
    trip,
    // The desktop countdown tile's "at a glance" row (homeStats): the dated
    // Stops this Phase is built from, and every Chapter — dated and rough.
    glance: { stops: stops.map((s) => ({ countryCode: s.countryCode })), chapterCount: chapters.length },
    startDate,
    endDate,
    today,
    effectiveDate,
    isBeforeTrip,
    isAfterTrip,
    isWithinTrip,
    currentChapter: day.chapter,
    dayNum: day.dayNumber,
    totalDays: day.totalDays,
    // Today's Day title (CONTEXT.md "Day title"; the desktop Today tile's `dayTitle`).
    todaysDayTitle: day.dayTitle?.title ?? null,
    holidays: holidayLines.get(effectiveDate) ?? [],
    dayPlan: day.dayPlan,
    editor,
    hasEntries: day.hasEntries,
    attachmentsByTarget: day.attachmentsByTarget,
    tonightAccom: day.tonight,
    nextTransport,
    nowNext: nowNextCard,
    effectiveStop: here,
    stopLocated: here ?? undefined,
    localMode: here ? effectiveLocalMode(here, transports) : null,
    spend,
    homeCurrency,
    upcomingPayments,
    stillToBook,
    dayMapModel: withDayMapHops(day.dayMap, rows, effectiveDate, travel, hopModes),
    itemDirections: day.itemDirections,
    freeForm: day.freeForm,
    thingsToDo: day.thingsToDo,
    wishlistIdeas: day.ideasWishlist,
    nearby: day.nearby,
    nearbyStarts: day.nearbyStarts,
    todaysJournal,
    revealNudges,
  };
}

export const loadTravellingHome = cache(loadTravellingHomeUncached);

type TravellingHome = Awaited<ReturnType<typeof loadTravellingHomeUncached>>;
export type DatedTravellingHome = Extract<TravellingHome, { kind: "dated" }>;

function buildTransportLabel(transport: {
  mode: string;
  reference?: string | null;
  depPlace?: string | null;
  arrPlace?: string | null;
}): string {
  const meta = TRANSPORT_MODE_META[transport.mode as TransportMode];
  const modeLabel = meta?.label ?? transport.mode;
  const ref = transport.reference ? ` ${transport.reference}` : "";
  const route =
    transport.depPlace && transport.arrPlace
      ? ` · ${transport.depPlace} → ${transport.arrPlace}`
      : transport.depPlace
        ? ` · from ${transport.depPlace}`
        : transport.arrPlace
          ? ` · to ${transport.arrPlace}`
          : "";
  return `${modeLabel}${ref}${route}`;
}
