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
 * pulls in `@/lib/guards`' next-auth dependency — pulling that into a test
 * that doesn't expect it breaks module resolution (see phase-planning.test.tsx).
 */
import {
  detectFlags,
  type FlagStop,
  type FlagTransport,
  type FlagAccommodation,
  type FlagItem,
} from "@/lib/flags";
import { buildNextSteps, type NextStep } from "@/lib/next-steps";
import { hasOutboundLeg, hasReturnLeg, type HomeBase } from "@/lib/home-base";
import type { TripPhase } from "@/lib/trip-phase";

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
  drivingWindingFactor?: number;
  drivingAvgSpeedKph?: number;
  undatedChapterCount: number;
  hasPackingList: boolean;
  hasPretripList: boolean;
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
    drivingWindingFactor: input.drivingWindingFactor,
    drivingAvgSpeedKph: input.drivingAvgSpeedKph,
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
    },
    tripBasePath: input.tripBasePath,
  });
}
