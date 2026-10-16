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
import { buildDayModel } from "@/lib/day-view-model";
import { readDayRows } from "@/lib/day-reads";
import { buildSpendSoFar, type SpendCost } from "@/lib/spend-so-far";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { zoneLabel } from "@/lib/time-display";
import type { TransportMode } from "@/lib/enum-values";
import { REAL_PLAN } from "@/lib/plan-scope";
import { buildCostLabelMap } from "@/lib/cost-labels";
import { buildUpcomingPayments } from "@/lib/upcoming-payments";
import { loadTodaysJournal } from "@/lib/journal-loader";
import { surprisesToReveal } from "@/lib/next-steps-builder";
import { revealSurpriseStep } from "@/lib/next-steps";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";

async function loadTravellingHomeUncached(tripId: string, userId: string | null) {
  // Reminders are NOT read here: the Reminders card is rendered by the trip
  // Home page in every Phase, not only while Travelling.
  const read = await readDayRows(tripId, userId, async (ctx) => {
    const [costs, todaysJournal, slug] = await Promise.all([
      db.cost.findMany({
        where: { tripId, ...REAL_PLAN },
        select: {
          id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, paidAt: true, dueDate: true,
          ownerType: true, ownerId: true, label: true, category: true, settlement: true,
        },
      }),
      // Today's journal (spec K) — never for a day still ahead (CONTEXT.md
      // "Journal"): before day 1 the Trip's real today hasn't arrived, so
      // there's nothing to load or write. The day journaled is today clamped
      // to the Trip's own range — the same day this Phase treats as "today".
      ctx.stopRows.then((rows) => {
        const tripToday = tripTodayISO(rows);
        return userId && tripToday >= ctx.startDate
          ? loadTodaysJournal(tripId, effectiveTodayISO(tripToday, ctx.startDate, ctx.endDate), userId)
          : null;
      }),
      // For the reveal nudges' links; cache()d, so the Phase's own read is free.
      tripSlugFor(tripId),
    ]);
    return { costs, todaysJournal, slug };
  });
  if (read === "missing") notFound();
  // A date-less trip has no calendar to anchor "today" against — the Phase
  // renders its empty treatment.
  if (read === "dateless") return { kind: "no-dates" as const };

  const { rows, visibility: v, alongside: { costs, todaysJournal, slug } } = read;
  const { trip, startDate, endDate, stops, items, transports, accommodations, chapters } = rows;
  const base = tripPath(slug);

  // Trip's reference-timezone "today" (things-to-fix P0-2); every read above
  // is the real plan (dated views follow the real plan — CONTEXT.md).
  const today = tripTodayISO(stops);
  const effectiveDate = effectiveTodayISO(today, startDate, endDate);
  const day = buildDayModel(rows, effectiveDate);

  // Placeholders are hidden from this viewer, so never theirs to reveal.
  const revealNudges = userId
    ? surprisesToReveal({ views: v.views, viewerId: userId, today, stops, items }).map((s) => {
        const { id, title, href } = revealSurpriseStep(s, base);
        return { id, title, href };
      })
    : [];

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
  const spend = buildSpendSoFar({ costs: costs as SpendCost[], homeCurrency, tripStart: startDate, tripEnd: endDate, today: effectiveDate });

  // ── Upcoming payments ── Owner labels (lib/cost-labels.ts) prefer the
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
  const hiddenOwners = new Set(v.hiddenOwnerIds);
  const lineCosts = costs.filter((c) => !c.ownerId || !hiddenOwners.has(c.ownerId));
  const upcomingPayments = buildUpcomingPayments({ costs: lineCosts, ownerNames, today });

  // The next departure, resolved for display (TransportCountdown on the
  // phone, the desktop Today tile).
  const nextTransport =
    nextTransportDep && nextTransportDep.transport.depAt
      ? {
          depAt: new Date(nextTransportDep.transport.depAt).toISOString(),
          depTimeLabel: nextTransportDep.depTimeLabel,
          // A Home departure has no fromStop of its own (CONTEXT.md "Home
          // base"): its zone is the Trip's own `homeTimezone` when set —
          // otherwise unchanged (a Stop's own zone, else no "→ UTC").
          depZone: zoneLabel(
            (nextTransportDep.transport.depIsHome && trip.homeTimezone) ||
              stops.find((s) => s.id === nextTransportDep.transport.fromStopId)?.timezone,
            effectiveDate,
          ),
          label: buildTransportLabel(nextTransportDep.transport),
        }
      : null;

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
    dayPlan: day.dayPlan,
    hasEntries: day.hasEntries,
    attachmentsByTarget: day.attachmentsByTarget,
    tonightAccom: day.tonight,
    nextTransport,
    effectiveStop: day.dayPlan?.stop ?? null,
    stopLocated: day.dayStop ?? undefined,
    spend,
    homeCurrency,
    upcomingPayments,
    dayMapModel: day.dayMap,
    itemDirections: day.itemDirections,
    freeForm: day.freeForm,
    thingsToDo: day.thingsToDo,
    wishlistIdeas: day.ideasWishlist,
    nearby: day.nearby,
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
