/**
 * Pure helpers for the public share view and the settings share-links panel.
 *
 * A ShareScope is one link's three dials (ADR 0051). The floor beneath the
 * dials — money, notes, confirmations, booking refs never shared — is not
 * modelled here because no scope can express it: the public page simply
 * never queries those fields.
 */

import type { TripPhase } from "@/lib/trip-phase";
import { daysBetween, dayNumberInTrip, nightsBetween } from "@/lib/dates";

export interface ShareScope {
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
}

const DIAL_LABELS: Array<[keyof ShareScope, string]> = [
  ["includeAccommodation", "Accommodation"],
  ["includeTransport", "Transport"],
  ["includeDailyPlans", "Daily plans"],
];

/** Human caption for a link row in Settings. */
export function scopeCaption(scope: ShareScope): string {
  const on = DIAL_LABELS.filter(([key]) => scope[key]).map(([, label]) => label);
  if (on.length === DIAL_LABELS.length) return "Full itinerary";
  if (on.length === 0) return "Route & dates only";
  return ["Route & dates", ...on].join(" · ");
}

/**
 * The accommodation covering tonight: you sleep there on `todayISO` when
 * checkIn <= today < checkOut. On a changeover day two stays can both match
 * the calendar (you check out of one and into the other); the latest check-in
 * is where you actually sleep.
 */
export function tonightsStay<A extends { checkIn: string; checkOut: string }>(
  accommodations: A[],
  todayISO: string,
): A | null {
  const covering = accommodations.filter(
    (a) => a.checkIn <= todayISO && todayISO < a.checkOut,
  );
  if (covering.length === 0) return null;
  return covering.reduce((latest, a) => (a.checkIn > latest.checkIn ? a : latest));
}

export type ShareStage = "before" | "during" | "after";

/** SHARE.md §1: the public page's three stages, read off the Phase. */
export function shareStage(phase: TripPhase): ShareStage {
  if (phase === "travelling") return "during";
  if (phase === "past") return "after";
  return "before";
}

export interface DayIndex {
  day: number;
  total: number;
  fraction: number;
  nightsLeft: number;
}

/** Day N of M on the same inclusive base as describePhase (lib/trip-phase.ts). */
export function dayIndex({ startDate, endDate, today }: { startDate: string; endDate: string; today: string }): DayIndex {
  const total = daysBetween(startDate, endDate) + 1;
  const day = Math.min(total, Math.max(1, dayNumberInTrip(today, startDate)));
  return { day, total, fraction: day / total, nightsLeft: nightsBetween(today, endDate) };
}

/** The transport in progress: departed, not yet arrived. Both instants must be known. */
export function currentLeg<T extends { depAt: Date | string | null; arrAt: Date | string | null }>(
  transports: T[],
  now: Date,
): T | null {
  const t = now.getTime();
  for (const leg of transports) {
    if (!leg.depAt || !leg.arrAt) continue;
    if (new Date(leg.depAt).getTime() <= t && t < new Date(leg.arrAt).getTime()) return leg;
  }
  return null;
}

export type StopStatus = "past" | "current" | "future";

/**
 * `currentStopId` is the itinerary's stop for today (buildItinerary picks the
 * latest-arrived stop, so a changeover day belongs to the arriving stop).
 */
export function stopStatuses(
  stops: { id: string; arriveDate: string }[],
  currentStopId: string | null,
  todayISO: string,
): Map<string, StopStatus> {
  const out = new Map<string, StopStatus>();
  for (const s of stops) {
    if (s.id === currentStopId) out.set(s.id, "current");
    else if (s.arriveDate > todayISO) out.set(s.id, "future");
    else out.set(s.id, "past");
  }
  return out;
}

export function nextStopAfter<S extends { id: string }>(stops: S[], id: string | null): S | null {
  if (!id) return null;
  const i = stops.findIndex((s) => s.id === id);
  return i >= 0 && i + 1 < stops.length ? stops[i + 1] : null;
}

/** SHARE.md §6 — nights, stops, countries. Never distance or spend. */
export function shareTally(stops: { country: string | null }[], totalNights: number) {
  const countries = new Set(stops.map((s) => s.country?.trim()).filter((c): c is string => Boolean(c)));
  return { nights: totalNights, stops: stops.length, countries: countries.size };
}

export function travellersLabel(names: string[], opts: { possessive?: boolean } = {}): string {
  if (names.length === 0) return "";
  const s = opts.possessive ? "'s trip" : "";
  if (names.length === 1) return `${names[0]}${s}`;
  if (names.length === 2) return `${names[0]} & ${names[1]}${s}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} & ${rest} other${rest === 1 ? "" : "s"}`;
}

const TILTS = [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2];

/** Derived from the id, not Math.random(), so server and client agree. */
export function polaroidTilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TILTS[Math.abs(h) % TILTS.length];
}

function plusHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** SHARE.md §4: a row is done once its end time (or start + 1h) has passed, local time. */
export function isDoneAt(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  nowHHMM: string,
): boolean {
  const end = endTime ?? (startTime ? plusHour(startTime) : null);
  return end != null && end <= nowHHMM;
}

export function groupDaysByStop<D extends { stop: { id: string } | null }>(
  days: D[],
  stopIds: string[],
): Map<string, D[]> {
  const out = new Map<string, D[]>(stopIds.map((sid): [string, D[]] => [sid, []]));
  let last: string | null = stopIds[0] ?? null;
  for (const day of days) {
    const stopId: string | null = day.stop?.id ?? last;
    if (stopId && out.has(stopId)) {
      out.get(stopId)!.push(day);
      last = stopId;
    }
  }
  return out;
}

export type ShareSection = "hero" | "right-now" | "next" | "tally" | "journal" | "map" | "route" | "days" | "cta";

const ORDER: Record<ShareStage, ShareSection[]> = {
  before: ["hero", "map", "route", "days", "cta"],
  during: ["hero", "right-now", "next", "journal", "map", "route", "days", "cta"],
  after: ["hero", "tally", "journal", "route", "map", "days", "cta"],
};

/** Mobile DOM order per stage (SHARE.md §1); desktop reorders with lg:order-*. */
export function shareSections(
  stage: ShareStage,
  has: { journal: boolean; days: boolean; next: boolean; map: boolean },
): ShareSection[] {
  return ORDER[stage].filter(
    (s) => (s !== "journal" || has.journal) && (s !== "days" || has.days) && (s !== "next" || has.next) && (s !== "map" || has.map),
  );
}
