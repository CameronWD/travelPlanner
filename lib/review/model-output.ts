/**
 * A Review's model output (spec 2026-10-17 R8, R11): the schema Claude's
 * submit_review tool takes (lib/review/call.ts) and validates against, and
 * the step from its Findings to R's FindingDraft. Nothing Claude says is
 * trusted further than this: a target or fix must name a visible row of the
 * right type (ReviewTargets), a fix must pass R's suggestedFixSchema, and a
 * source must be a web address.
 */
import { z } from "zod";
import { BOOKING_STATES } from "@/lib/enum-values";
import { WEEKDAYS, type HoursSpan, type OpeningHours, type WeekHours } from "@/lib/opening-hours";
import { safeWebHref } from "@/lib/url";
import type { ReviewTargetType, ReviewTargets } from "./input-shape";
import { findingKey } from "./key";
import { suggestedFixSchema } from "./schema";
import { FINDING_SEVERITIES, FINDING_TARGET_TYPES, type FindingCategory, type FindingDraft, type SuggestedFix } from "./types";

/** R8's eight categories: Claude may use every one (a restated Flag maps onto one of them too, R decision 2). */
export const MODEL_CATEGORIES = [
  "CLOSURE", "SEASON", "TICKET", "HOLIDAY", "LOGISTICS", "STALE_NOTE", "PACKING", "BOOKING",
] as const satisfies readonly FindingCategory[];

/** More than this from one run is noise: the rest are dropped, not the run. */
export const MAX_MODEL_FINDINGS = 40;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX = 120;
const DETAIL_MAX = 1_200;

// Strict tool use: every field is required (nullable, never optional), so
// the server checks the shape. The SDK's schema transform (SDK 0.105,
// lib/transform-json-schema.js) moves enum values, patterns and limits into
// descriptions: Claude reads them there, and reviewOutputSchema.safeParse
// (lib/review/call.ts) is what enforces them.
//
// Everything Claude supplies is trimmed here, and enum values are read
// whatever their case: a Finding's key (lib/review/key.ts) and the target
// checks below compare category, target type, id and date exactly, so a
// padded " museum" must not become a different Finding or a lost target.
// `.trim()` and the case overwrites keep the JSON Schema a plain string,
// and a pipe shows its enum (the output side) to Claude.
const text = () => z.string().trim();
const upperEnum = <const T extends readonly [string, ...string[]]>(values: T) => text().toUpperCase().pipe(z.enum(values));
const lowerEnum = <const T extends readonly [string, ...string[]]>(values: T) => text().toLowerCase().pipe(z.enum(values));
const exactEnum = <const T extends readonly [string, ...string[]]>(values: T) => text().pipe(z.enum(values));

const dayHoursSchema = z.object({
  day: lowerEnum(WEEKDAYS),
  /** Empty = closed that weekday. */
  spans: z.array(z.object({ open: text(), close: text() })),
});

const modelFixSchema = z.union([
  z.object({ kind: exactEnum(["item.times"]), itemId: text(), startTime: text().nullable(), endTime: text().nullable(), date: text().nullable() }),
  z.object({
    kind: exactEnum(["item.bookingState", "transport.bookingState", "accommodation.bookingState"]),
    id: text(),
    bookingState: upperEnum(BOOKING_STATES),
    bookBy: text().nullable(),
  }),
  z.object({
    kind: exactEnum(["item.openingHours"]),
    itemId: text(),
    week: z.array(dayHoursSchema),
    seasons: z.array(z.object({ label: text().nullable(), from: text(), to: text(), week: z.array(dayHoursSchema) })),
    closed: z.array(text()),
  }),
  z.object({ kind: exactEnum(["item.note"]), itemId: text(), append: text() }),
]);

const modelFindingSchema = z.object({
  severity: lowerEnum(FINDING_SEVERITIES),
  category: upperEnum(MODEL_CATEGORIES),
  targetType: upperEnum(FINDING_TARGET_TYPES),
  targetId: text().nullable(),
  date: text().nullable(),
  title: text(),
  detail: text(),
  source: text().nullable(),
  suggestedFix: modelFixSchema.nullable(),
});

export const reviewOutputSchema = z.object({
  summary: text(),
  findings: z.array(modelFindingSchema),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
type ModelFinding = ReviewOutput["findings"][number];
type ModelFix = NonNullable<ModelFinding["suggestedFix"]>;

function weekOf(days: ReadonlyArray<z.infer<typeof dayHoursSchema>>): WeekHours {
  const week: WeekHours = {};
  for (const d of days) week[d.day] = d.spans.map((s): HoursSpan => [s.open, s.close]);
  return week;
}

const BOOKING_TARGET: Record<"item.bookingState" | "transport.bookingState" | "accommodation.bookingState", ReviewTargetType> = {
  "item.bookingState": "ITEM",
  "transport.bookingState": "TRANSPORT",
  "accommodation.bookingState": "ACCOMMODATION",
};

/** The fix in R's shape, and the row it touches; null when it changes nothing. */
function fixCandidate(fix: ModelFix, source: string | undefined): { type: ReviewTargetType; id: string; value: unknown } | null {
  switch (fix.kind) {
    case "item.times": {
      const times = {
        ...(fix.startTime ? { startTime: fix.startTime } : {}),
        ...(fix.endTime ? { endTime: fix.endTime } : {}),
        ...(fix.date ? { date: fix.date } : {}),
      };
      if (Object.keys(times).length === 0) return null;
      return { type: "ITEM", id: fix.itemId, value: { kind: fix.kind, itemId: fix.itemId, ...times } };
    }
    case "item.bookingState":
    case "transport.bookingState":
    case "accommodation.bookingState":
      return {
        type: BOOKING_TARGET[fix.kind],
        id: fix.id,
        value: { kind: fix.kind, id: fix.id, bookingState: fix.bookingState, ...(fix.bookBy ? { bookBy: fix.bookBy } : {}) },
      };
    case "item.openingHours": {
      const hours: OpeningHours = {
        week: weekOf(fix.week),
        seasons: fix.seasons.map((s) => ({ ...(s.label ? { label: s.label } : {}), from: s.from, to: s.to, week: weekOf(s.week) })),
        closed: fix.closed,
        ...(source ? { source } : {}),
      };
      return { type: "ITEM", id: fix.itemId, value: { kind: fix.kind, itemId: fix.itemId, hours } };
    }
    case "item.note": {
      const append = fix.append.trim();
      return append ? { type: "ITEM", id: fix.itemId, value: { kind: fix.kind, itemId: fix.itemId, append } } : null;
    }
  }
}

function toSuggestedFix(fix: ModelFix | null, targets: ReviewTargets, source: string | undefined): SuggestedFix | undefined {
  if (!fix) return undefined;
  const candidate = fixCandidate(fix, source);
  if (!candidate || !targets[candidate.type].has(candidate.id)) return undefined;
  const parsed = suggestedFixSchema.safeParse(candidate.value);
  return parsed.success ? parsed.data : undefined;
}

type Placement = Pick<FindingDraft, "targetType" | "targetId" | "date">;

/** Where the Finding points. An id that isn't a visible row of that type (made up, or a Surprise's) becomes the Trip. */
function placement(f: ModelFinding, targets: ReviewTargets): Placement {
  const date = f.date && ISO_DAY.test(f.date) ? f.date : undefined;
  const dated = date ? { date } : {};
  if (f.targetType === "DAY") return date ? { targetType: "DAY", date } : { targetType: "TRIP" };
  if (f.targetType !== "TRIP" && f.targetId && targets[f.targetType].has(f.targetId)) {
    return { targetType: f.targetType, targetId: f.targetId, ...dated };
  }
  return { targetType: "TRIP", ...dated };
}

export function toFindingDrafts(output: ReviewOutput, targets: ReviewTargets): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  for (const f of output.findings.slice(0, MAX_MODEL_FINDINGS)) {
    const title = f.title.trim().slice(0, TITLE_MAX);
    if (!title) continue;
    const source = safeWebHref(f.source) ?? undefined;
    const suggestedFix = toSuggestedFix(f.suggestedFix, targets, source);
    drafts.push({
      severity: f.severity,
      category: f.category,
      ...placement(f, targets),
      title,
      detail: f.detail.trim().slice(0, DETAIL_MAX),
      ...(suggestedFix ? { suggestedFix } : {}),
      ...(source ? { source } : {}),
      origin: "MODEL",
    });
  }
  return drafts;
}

/** One draft per findingKey, the first kept: pass the restated Flags first so they win (R10 matching needs unique keys). */
export function mergeDrafts(...groups: readonly FindingDraft[][]): FindingDraft[] {
  const seen = new Set<string>();
  const merged: FindingDraft[] = [];
  for (const d of groups.flat()) {
    const key = findingKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(d);
  }
  return merged;
}

/** The history's summary line (R10): Claude's, on one line, or a count. */
export function reviewSummary(output: ReviewOutput, count: number): string {
  const line = output.summary.replace(/\s+/g, " ").trim().slice(0, 200);
  if (line) return line;
  if (count === 0) return "Nothing to look at.";
  return `${count} ${count === 1 ? "thing" : "things"} to look at.`;
}
