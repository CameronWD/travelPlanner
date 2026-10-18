/**
 * What a Review reads (spec 2026-10-17 R9, R11), pure: the plan as everyone
 * on the Trip sees it (lib/review/input.ts loads it as a Share link's null
 * viewer) turned into the compact JSON Claude reads, and the ids a Finding
 * or a suggested fix may point at. No database and no clock, so the smoke
 * script builds it from a fixture.
 */
import type { Flag } from "@/lib/flags";
import type { McpTripPlan } from "@/lib/mcp/reads/trip-plan";

export type ReviewTargetType = "STOP" | "ITEM" | "TRANSPORT" | "ACCOMMODATION";

/** The visible rows a Finding or a fix may name, by type (lib/review/model-output.ts). */
export type ReviewTargets = Readonly<Record<ReviewTargetType, ReadonlySet<string>>>;

export interface ReviewInput {
  tripName: string;
  startDate: string | null;
  endDate: string | null;
  /** The Trip's own today (lib/trip-today.ts): nothing before it is reviewed. */
  today: string;
  /** reviewPlanJson's output. */
  plan: string;
  /** The current Flags, as everyone sees them: Claude must not repeat them, and they are restated as Findings. */
  flags: Flag[];
  targets: ReviewTargets;
}

/**
 * Never sent to Claude: booking references and confirmation numbers (a
 * Review never needs one), Attachment titles, and who is asking (a Review
 * asks as nobody).
 */
const OMIT = new Set(["booking", "reference", "confirmation", "files", "you"]);

/**
 * The plan as compact JSON. Travellers become a count. Every live Surprise
 * is `surprise: true`: never who planned it or who it is for (R9).
 */
export function reviewPlanJson(plan: McpTripPlan): string {
  const { travellers, ...rest } = plan;
  return JSON.stringify({ ...rest, travellerCount: travellers.length }, (key, value: unknown) => {
    if (OMIT.has(key)) return undefined;
    if (key === "surprise") return value ? true : undefined;
    return value;
  });
}

/**
 * Every row a Finding may point at. Nothing that carries a live Surprise:
 * a hidden Stop's shell and a hidden Item's placeholder hold nothing to
 * review, and a Finding about them could only guess (R9).
 */
export function collectReviewTargets(plan: McpTripPlan): ReviewTargets {
  const STOP = new Set<string>();
  const ITEM = new Set<string>();
  const TRANSPORT = new Set<string>();
  const ACCOMMODATION = new Set<string>();
  const addItem = (i: { id: string; surprise: unknown }) => {
    if (!i.surprise) ITEM.add(i.id);
  };
  for (const stop of plan.stops) {
    if (stop.surprise) continue;
    STOP.add(stop.id);
    for (const a of stop.accommodations) ACCOMMODATION.add(a.id);
    stop.thingsToDo.forEach(addItem);
    for (const day of stop.days) day.items.forEach(addItem);
  }
  plan.unplacedDatedItems.forEach(addItem);
  for (const t of plan.transports) TRANSPORT.add(t.id);
  return { STOP, ITEM, TRANSPORT, ACCOMMODATION };
}

export function reviewInputFromPlan(plan: McpTripPlan, flags: Flag[], today: string): ReviewInput {
  return {
    tripName: plan.trip.name,
    startDate: plan.trip.startDate,
    endDate: plan.trip.endDate,
    today,
    plan: reviewPlanJson(plan),
    flags,
    targets: collectReviewTargets(plan),
  };
}
