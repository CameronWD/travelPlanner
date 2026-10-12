/**
 * Pure combiner for a Trip's "Next steps" (the Planning/Final-prep Home's
 * ranked to-do list — see lib/next-steps.ts and CONTEXT.md): detect Flags,
 * assemble the forward-looking nudges, hand both to `buildNextSteps`.
 *
 * Deliberately has NO Prisma/auth imports — components/trip/home/phase-planning.tsx
 * (the trip Home, which has already fetched all this data for the budget/route/
 * etc cards) and lib/next-steps-loader.ts's `loadNextSteps` (a self-contained
 * loader for a caller that hasn't, e.g. the trips list's featured card) both
 * call this one function, so the two can never drift apart. Keeping it
 * pure/DB-free also means importing it (e.g. from phase-planning.tsx) never
 * pulls in `@/lib/guards`' Better Auth dependency — pulling that into a test
 * that doesn't expect it breaks module resolution (see phase-planning.test.tsx).
 */
import {
  detectFlags,
  type FlagStop,
  type FlagTransport,
  type FlagAccommodation,
  type FlagItem,
} from "@/lib/flags";
import { buildNextSteps, type NextStep, type SurpriseToReveal } from "@/lib/next-steps";
import { hasOutboundLeg, hasReturnLeg, type HomeBase } from "@/lib/home-base";
import type { TripPhase } from "@/lib/trip-phase";
import type { TripDeadline } from "@/lib/trip-deadline";
import type { SurpriseView } from "@/lib/surprise";

export interface BuildTripNextStepsInput {
  tripBasePath: string;
  phase: TripPhase;
  tripStart: string;
  tripEnd: string;
  roundTrip: boolean;
  home: HomeBase | null;
  /** Dated (scheduled) Stops, in canonical plan order — see ADR 0038. */
  datedStops: FlagStop[];
  roughStopCount: number;
  /** All Stops (dated + rough), in sortOrder — first/last drive the outbound/return-leg nudges. */
  allStops: { id: string; name: string }[];
  transports: FlagTransport[];
  accommodations: FlagAccommodation[];
  items: FlagItem[];
  projectedEnd: string | null;
  hardEndDate: string | null;
  /** The Trip's deadline from getTripProjection (ADR 0068); omitted → derived from hardEndDate. */
  deadline?: TripDeadline | null;
  drivingWindingFactor?: number;
  drivingAvgSpeedKph?: number;
  undatedChapterCount: number;
  hasPackingList: boolean;
  hasPretripList: boolean;
  /** Surprise Stops hidden from the viewer: no Flag about their inside (lib/flags.ts); omitted → none. */
  hiddenStopIds?: readonly string[];
  /** The viewer's own Surprises whose day has come (lib/next-steps.ts); omitted → none. */
  surprisesToReveal?: SurpriseToReveal[];
  /** Cap on the ranked list (buildNextSteps defaults to 4); pass Infinity for all. */
  limit?: number;
}

/** Pure: Flags + nudges → the ranked Next steps list. */
export function buildTripNextSteps(input: BuildTripNextStepsInput): NextStep[] {
  const flags = detectFlags({
    stops: input.datedStops,
    transports: input.transports,
    accommodations: input.accommodations,
    items: input.items,
    tripStart: input.tripStart,
    tripEnd: input.tripEnd,
    roughStopCount: input.roughStopCount,
    projectedEnd: input.projectedEnd,
    hardEndDate: input.hardEndDate,
    deadline: input.deadline,
    drivingWindingFactor: input.drivingWindingFactor,
    drivingAvgSpeedKph: input.drivingAvgSpeedKph,
    hiddenStopIds: input.hiddenStopIds,
  });

  const firstStop = input.allStops[0] ?? null;
  const lastStop = input.allStops[input.allStops.length - 1] ?? null;

  return buildNextSteps({
    flags,
    phase: input.phase,
    nudges: {
      hasDates: true, // caller only reaches here for a dated trip
      undatedChapterCount: input.undatedChapterCount,
      hasPackingList: input.hasPackingList,
      hasPretripList: input.hasPretripList,
      unbookedTransportCount: input.transports.filter((t) => !t.depAt).length,
      hasHomeBase: !!input.home,
      hasOutboundLeg: hasOutboundLeg(input.transports, firstStop?.id ?? null),
      hasReturnLeg: hasReturnLeg(input.transports, lastStop?.id ?? null),
      roundTrip: input.roundTrip,
      homeName: input.home?.name ?? null,
      firstStopName: firstStop?.name ?? null,
      lastStopName: lastStop?.name ?? null,
      firstStopId: firstStop?.id ?? null,
      lastStopId: lastStop?.id ?? null,
      surprisesToReveal: input.surprisesToReveal,
    },
    tripBasePath: input.tripBasePath,
    limit: input.limit,
  });
}

/**
 * Pure: the viewer's own live Surprises whose day has come, for the reveal
 * nudge (CONTEXT.md Surprise: "The planner's Home nudges them to reveal it on
 * the Stop's arrive date or the Item's day"). `views` holds only live
 * Surprises; a Stop with no arrive date or an Item with no day never comes
 * due. Only rows the caller read (`stops`, `items`) can come due, so a
 * Surprise in another plan is never nudged.
 */
export function surprisesToReveal(input: {
  views: { stops: Map<string, SurpriseView>; items: Map<string, SurpriseView> };
  viewerId: string;
  today: string;
  stops: ReadonlyArray<{ id: string; name: string; arriveDate: string | null }>;
  items: ReadonlyArray<{ id: string; title: string; date: string | null; stopId: string | null }>;
}): SurpriseToReveal[] {
  const mine = (view: SurpriseView | undefined) => view?.plannerId === input.viewerId;
  return [
    ...input.stops
      .filter((s) => mine(input.views.stops.get(s.id)) && s.arriveDate !== null && s.arriveDate <= input.today)
      .map((s) => ({ id: s.id, kind: "STOP" as const, label: s.name, stopId: s.id })),
    ...input.items
      .filter((i) => mine(input.views.items.get(i.id)) && i.date !== null && i.date <= input.today)
      .map((i) => ({ id: i.id, kind: "ITEM" as const, label: i.title, stopId: i.stopId })),
  ];
}
