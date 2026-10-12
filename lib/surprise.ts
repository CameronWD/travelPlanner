/**
 * Surprise (CONTEXT.md): the pure rules. A Stop or Item carries three
 * columns (SURPRISE_SELECT); this module decides what state they put it in
 * and who is surprised by it. No database here; lib/surprise-visibility.ts
 * is the server side.
 */
import { addDays } from "@/lib/dates";
import { instantToZonedDateISO } from "@/lib/tz";
import { travellerFirstName, type TravellerLike } from "@/lib/traveller";

export const SURPRISE_SELECT = { surprisePlannerId: true, surpriseForIds: true, surpriseRevealedAt: true } as const;

export interface SurpriseColumns {
  surprisePlannerId: string | null;
  surpriseForIds: string | null;
  surpriseRevealedAt: Date | null;
}

/** What decides the automatic reveal: the Stop's departDate or the Item's date, read in the Stop's zone. */
export interface SurpriseOver {
  endDate: string | null;
  timezone: string | null;
}

export type SurpriseState = "none" | "live" | "revealed";

export function parseSurpriseFor(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function serializeSurpriseFor(ids: Iterable<string>): string {
  return JSON.stringify(Array.from(new Set(ids)).sort());
}

/** The day the Surprise reveals itself: the day after it is over (never on the day). */
export function autoRevealDate(over: SurpriseOver): string | null {
  return over.endDate ? addDays(over.endDate, 1) : null;
}

export function surpriseState(row: SurpriseColumns, over: SurpriseOver, now: Date): SurpriseState {
  if (!row.surprisePlannerId) return "none";
  if (row.surpriseRevealedAt) return "revealed";
  const reveal = autoRevealDate(over);
  if (!reveal) return "live";
  const today = instantToZonedDateISO(now, over.timezone ?? "UTC");
  return today >= reveal ? "revealed" : "live";
}

/** A null viewer (a Share link, the Calendar feed) is surprised by every live Surprise. */
export function isSurprisedBy(row: SurpriseColumns, over: SurpriseOver, viewerId: string | null, now: Date): boolean {
  if (surpriseState(row, over, now) !== "live") return false;
  if (viewerId === null) return true;
  return parseSurpriseFor(row.surpriseForIds).includes(viewerId);
}

/**
 * The rules a new or changed Surprise must meet, shared by setSurprise and the
 * Item form's create (which checks them before writing, so a refusal creates nothing):
 * not already over (its auto-reveal day is not today or earlier in its zone),
 * everyone named is on the Trip and is not the planner, and someone is named.
 * Null when it may go ahead; otherwise the errors, keyed as setSurprise returns them.
 */
export function validateSurpriseFor(input: {
  forIds: readonly string[];
  plannerId: string;
  memberIds: readonly string[];
  over: SurpriseOver;
  now: Date;
}): Record<string, string[]> | null {
  const revealOn = autoRevealDate(input.over);
  if (revealOn && revealOn <= instantToZonedDateISO(input.now, input.over.timezone ?? "UTC")) {
    return { _: ["This is already over."] };
  }
  const members = new Set(input.memberIds);
  if (input.forIds.includes(input.plannerId) || input.forIds.some((id) => !members.has(id))) {
    return { forIds: ["Choose Travellers on this trip, other than yourself."] };
  }
  if (input.forIds.length === 0) return { forIds: ["Choose at least one Traveller."] };
  return null;
}

export interface SurpriseView {
  plannerId: string;
  plannerName: string;
  forIds: string[];
  forNames: string[];
  youAreSurprised: boolean;
}

export function surpriseView(
  row: SurpriseColumns, over: SurpriseOver, viewerId: string | null,
  members: readonly TravellerLike[], now: Date,
): SurpriseView | null {
  if (surpriseState(row, over, now) !== "live") return null;
  const byId = new Map(members.map((m) => [m.id, m]));
  const planner = byId.get(row.surprisePlannerId!);
  const forIds = parseSurpriseFor(row.surpriseForIds);
  return {
    plannerId: row.surprisePlannerId!,
    plannerName: planner ? travellerFirstName(planner) : "a Traveller",
    forIds,
    forNames: forIds.map((id) => { const m = byId.get(id); return m ? travellerFirstName(m) : "a Traveller"; }),
    youAreSurprised: viewerId === null || forIds.includes(viewerId),
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "no one";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function surpriseLine(view: SurpriseView): string {
  return view.youAreSurprised
    ? `Surprise, planned by ${view.plannerName}`
    : `Surprise for ${joinNames(view.forNames)}`;
}
