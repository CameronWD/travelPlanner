import { z } from "zod";
import { haversineKm, type LatLng } from "@/lib/geo";
import type { GeoCandidate } from "@/lib/geocode";
import { resolveHomeTimezone, resolveStopTimezone } from "@/lib/tz-point";

export type BackfillKind = "item" | "stop" | "accommodation" | "transport-dep" | "transport-arr" | "marker" | "home";
export type BackfillVerdict = "accept" | "new" | "too-far" | "address-only" | "no-match" | "no-anchor" | "error";
export type Matched = "venue" | "address";

export const KINDS: BackfillKind[] = ["item", "stop", "accommodation", "transport-dep", "transport-arr", "marker", "home"];
export const PLAN_FILE = "backfill-places-plan.json";
export const MAX_PLAN_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_CONSECUTIVE_ERRORS = 5;

export function toleranceKm(kind: BackfillKind): number {
  return kind === "stop" || kind === "home" ? 25 : 1;
}

export function hasAnchor(text: string | null | undefined, old: LatLng | null): boolean {
  return old !== null || Boolean(text?.trim());
}

export function verdict(kind: BackfillKind, old: LatLng | null, next: (LatLng & { matched?: Matched }) | null): BackfillVerdict {
  if (!next) return "no-match";
  if (!old) return "new";
  if (next.matched === "address") return "address-only";
  return haversineKm(old, next) <= toleranceKm(kind) ? "accept" : "too-far";
}

const point = (p: LatLng | null): string => (p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : "—");

export function formatRow(row: {
  kind: BackfillKind;
  id: string;
  query: string;
  old: LatLng | null;
  next: (LatLng & { address?: string | null; matched?: Matched }) | null;
  verdict: BackfillVerdict;
}): string {
  const km = row.old && row.next ? haversineKm(row.old, row.next).toFixed(1) : "—";
  const line = `${row.kind} ${row.id} · "${row.query}" · ${point(row.old)} → ${point(row.next)} · ${km} km · ${row.verdict.toUpperCase()}`;
  if (!row.next) return line;
  const found = [row.next.matched && `[${row.next.matched}]`, row.next.address].filter(Boolean).join(" ");
  return found ? `${line} · ${found}` : line;
}

export function errorStreak() {
  let run = 0;
  return {
    record(failed: boolean): boolean {
      run = failed ? run + 1 : 0;
      return run >= MAX_CONSECUTIVE_ERRORS;
    },
  };
}

type PlanValue = string | number | null;
export type PlanSet = Record<string, PlanValue>;

// The first three columns of each kind are its point and place ID, always written together.
const SET_COLUMNS: Record<BackfillKind, readonly string[]> = {
  item: ["lat", "lng", "placeId", "countryCode"],
  marker: ["lat", "lng", "placeId", "countryCode"],
  accommodation: ["lat", "lng", "placeId"],
  stop: ["lat", "lng", "placeId", "countryCode", "timezone"],
  "transport-dep": ["depLat", "depLng", "depPlaceId"],
  "transport-arr": ["arrLat", "arrLng", "arrPlaceId"],
  home: ["homeLat", "homeLng", "homePlaceId", "homeCountryCode", "homeTimezone"],
};

export function planColumns(kind: BackfillKind): { lat: string; lng: string; placeId: string; timezone: string | null } {
  const [lat, lng, placeId] = SET_COLUMNS[kind];
  const timezone = kind === "stop" ? "timezone" : kind === "home" ? "homeTimezone" : null;
  return { lat, lng, placeId, timezone };
}

export function plannedSet(kind: BackfillKind, f: GeoCandidate, timezone: string | null = null): PlanSet {
  const [lat, lng, placeId, countryCol, timezoneCol] = SET_COLUMNS[kind];
  return {
    [lat]: f.lat,
    [lng]: f.lng,
    [placeId]: f.placeId,
    ...(countryCol && f.countryCode ? { [countryCol]: f.countryCode } : {}),
    ...(timezoneCol && timezone ? { [timezoneCol]: timezone } : {}),
  };
}

export function plannedStopTimezone(
  row: { timezone: string | null; arriveDate: string | null; country: string | null },
  v: BackfillVerdict,
  f: GeoCandidate,
): string | null {
  if (v !== "new" || row.timezone || !row.arriveDate) return null;
  return resolveStopTimezone({ lat: f.lat, lng: f.lng, countryCode: f.countryCode, country: row.country });
}

export function plannedHomeTimezone(row: { homeTimezone: string | null }, v: BackfillVerdict, f: GeoCandidate): string | null {
  if (v !== "new" || row.homeTimezone) return null;
  return resolveHomeTimezone({ lat: f.lat, lng: f.lng, countryCode: f.countryCode });
}

export function needsDetails(kind: BackfillKind, address: string | null, f: GeoCandidate & { matched?: Matched }): boolean {
  return kind === "item" && f.matched === "venue" && Boolean(address?.trim()) && Boolean(f.placeId);
}

const latLng = z.object({ lat: z.number(), lng: z.number() });

const planRowSchema = z
  .object({
    kind: z.enum(KINDS),
    id: z.string().min(1),
    query: z.string(),
    verdict: z.enum(["accept", "new"]),
    matched: z.enum(["venue", "address"]).nullable(),
    address: z.string().nullable(),
    old: latLng.nullable(),
    set: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
    details: z.boolean(),
  })
  .refine((r) => Object.keys(r.set).every((k) => SET_COLUMNS[r.kind].includes(k)), "a row sets a column its kind doesn't own")
  .refine((r) => SET_COLUMNS[r.kind].slice(0, 3).every((k) => k in r.set), "a row is missing its point or place ID");

const planSchema = z.object({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  rows: z.array(planRowSchema),
});

export type Plan = z.infer<typeof planSchema>;
export type PlanRow = Plan["rows"][number];

export function readPlan(text: string | null, now: Date): { ok: true; plan: Plan } | { ok: false; error: string } {
  if (text === null) return { ok: false, error: "No plan file. Run the dry run first: npm run backfill:places" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "The plan file isn't valid JSON." };
  }
  const parsed = planSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: `The plan file isn't a backfill plan: ${parsed.error.issues[0]?.message ?? "unreadable"}` };
  if (now.getTime() - Date.parse(parsed.data.createdAt) > MAX_PLAN_AGE_MS) {
    return { ok: false, error: `The plan is older than 24 hours (made ${parsed.data.createdAt}). Run the dry run again.` };
  }
  return { ok: true, plan: parsed.data };
}
