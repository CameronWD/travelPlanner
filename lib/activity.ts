/**
 * Activity feed helpers — pure module, no Prisma / React / network.
 *
 * Provides:
 *   - Verb and entity-type vocabularies
 *   - Field-level diffing (describeChanges)
 *   - Snapshot display labels (entityLabel)
 *   - Human-readable headline strings (headline)
 */

import { formatMoney } from "@/lib/money/money";
import { formatLongDate, formatDayLabel, formatISODate } from "@/lib/dates";
import { categoryLabel, type Category } from "@/lib/categories";
import type { VoteLevel } from "@/lib/enum-values";
import { BOOKING_STATE_LABELS } from "@/lib/booking-state-copy";
import type { OpeningHours } from "@/lib/opening-hours";
import { openingHoursSummary } from "@/lib/opening-hours-display";
import { sameTryEntries, tryListSummary, type TryList } from "@/lib/try-list";

// ---------------------------------------------------------------------------
// Vocab
// ---------------------------------------------------------------------------

export const ACTIVITY_VERBS = [
  "CREATED",
  "UPDATED",
  "DELETED",
  "NOTED",
  "PROMOTED",
] as const;
export type ActivityVerb = (typeof ACTIVITY_VERBS)[number];

export const ACTIVITY_ENTITY_TYPES = [
  "STOP",
  "ITEM",
  "TRANSPORT",
  "ACCOMMODATION",
  "CHAPTER",
  "COST",
  "NOTE",
  "FORK",
  "ATTACHMENT",
  "DAY_TITLE",
  "CHECKLIST_ITEM",
  "REMINDER",
  "VOTE",
] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

// ---------------------------------------------------------------------------
// ActivityChange
// ---------------------------------------------------------------------------

export interface ActivityChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** A single human-readable predicate, rendered as "{actor} {summary}". */
export interface ActivitySummary {
  summary: string;
}

// ---------------------------------------------------------------------------
// Transport mode labels (defined inline to avoid importing lucide-react)
// ---------------------------------------------------------------------------

const TRANSPORT_MODE_LABELS: Record<string, string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  BUS: "Bus",
  CAR: "Car",
  FERRY: "Ferry",
  OTHER: "Other",
};

// ---------------------------------------------------------------------------
// Field specs
// ---------------------------------------------------------------------------

/**
 * Format function that can optionally receive the owning row — used so the
 * COST formatter can look up the currency from the same row.
 */
type FormatFn = (value: unknown, row: Record<string, unknown>) => string;

interface FieldSpec {
  key: string;
  label: string;
  format?: FormatFn;
  /** Both sides non-empty: true when they count as the same (default: equal after normaliseForComparison). */
  same?: (before: unknown, after: unknown) => boolean;
}

/** Treat null / undefined / "" as "empty" for diffing purposes. */
function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/** Default formatter: empty → "", otherwise String(value). */
function defaultFormat(value: unknown): string {
  if (isEmpty(value)) return "";
  return String(value);
}

function dateFormat(value: unknown): string {
  if (isEmpty(value)) return "";
  try {
    return formatLongDate(String(value));
  } catch {
    return String(value);
  }
}

function categoryFormat(value: unknown): string {
  if (isEmpty(value)) return "";
  try {
    return categoryLabel(value as Category);
  } catch {
    return String(value);
  }
}

function transportModeFormat(value: unknown): string {
  if (isEmpty(value)) return "";
  return TRANSPORT_MODE_LABELS[String(value)] ?? String(value);
}

function pinnedFormat(value: unknown): string {
  if (isEmpty(value)) return "";
  return value ? "Pinned" : "Not pinned";
}

function bookingStateFormat(value: unknown): string {
  if (isEmpty(value)) return "";
  return BOOKING_STATE_LABELS[value as keyof typeof BOOKING_STATE_LABELS] ?? String(value);
}

/**
 * CONTEXT.md "Opening hours" (R4). `Item.openingHours` is stored as a JSON
 * string (lib/validations/opening-hours.ts), so the before/after snapshot
 * values here are that stored string (or null). Parsed with plain
 * `JSON.parse`, not `parseOpeningHours` — that module imports zod, and
 * lib/activity.ts is a client-safe module (notification-bell.tsx imports
 * it), so it stays off the zod side of the boundary (lib/client-zod.guard.test.ts).
 * The value was already validated by `openingHoursSchema` on write; this is
 * display-only, so anything unreadable just falls back to "Set".
 */
function openingHoursFormat(value: unknown): string {
  if (isEmpty(value)) return "Not set";
  try {
    return openingHoursSummary(JSON.parse(value as string) as OpeningHours);
  } catch {
    return "Set";
  }
}

/**
 * CONTEXT.md "Try list" (R6). `Item.tryList` is stored as a JSON string, so
 * the snapshot values are that string (or null). Plain JSON.parse, not
 * parseTryList, for the same client-safety reason as openingHoursFormat
 * above. Display only: an unreadable value reads as "Set".
 */
function readTryList(value: unknown): TryList | null {
  try {
    const parsed: unknown = JSON.parse(value as string);
    return Array.isArray(parsed) ? (parsed as TryList) : null;
  } catch {
    return null;
  }
}

function tryListFormat(value: unknown): string {
  if (isEmpty(value)) return "Not set";
  const list = readTryList(value);
  return list && list.length > 0 ? tryListSummary(list) : "Set";
}

/** A tick is not a list edit (ADR 0012 amendment: ticked as you go): the same entries in the same order are no change. */
function sameTryList(before: unknown, after: unknown): boolean {
  const b = readTryList(before);
  const a = readTryList(after);
  return b !== null && a !== null && sameTryEntries(b, a);
}

/**
 * Format a Date (or ISO string) as a readable UTC date-time like "3 Jul 2025, 14:00".
 * Null / undefined / "" → "—".
 */
function dateTimeFormat(value: unknown): string {
  if (isEmpty(value)) return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

/**
 * Normalise a value before equality comparison: Date → ISO string; otherwise as-is.
 * This prevents phantom changes when two distinct Date objects represent the same instant.
 */
function normaliseForComparison(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function moneyFormat(value: unknown, row: Record<string, unknown>): string {
  if (isEmpty(value)) return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  const currency = typeof row.currency === "string" ? row.currency : "AUD";
  return formatMoney(amount, currency);
}

const FIELD_SPECS: Record<ActivityEntityType, FieldSpec[]> = {
  STOP: [
    { key: "name", label: "Name" },
    { key: "country", label: "Country" },
    { key: "arriveDate", label: "Arrive date", format: (v) => dateFormat(v) },
    { key: "departDate", label: "Depart date", format: (v) => dateFormat(v) },
    { key: "nights", label: "Nights" },
    { key: "pinned", label: "Pinned", format: (v) => pinnedFormat(v) },
  ],
  ITEM: [
    { key: "title", label: "Title" },
    { key: "category", label: "Category", format: (v) => categoryFormat(v) },
    { key: "date", label: "Date", format: (v) => dateFormat(v) },
    { key: "startTime", label: "Start time" },
    { key: "endTime", label: "End time" },
    { key: "address", label: "Address" },
    // CONTEXT.md "Slot time" (R3); refundable is Boolean? (null = not known)
    { key: "slotTime", label: "Slot time" },
    { key: "arriveByMinutes", label: "Be there early", format: (v) => (isEmpty(v) ? "" : `${v} min`) },
    { key: "refundable", label: "Refundable", format: (v) => (v === true ? "Yes" : v === false ? "No" : "Not known") },
    { key: "bookingState", label: "Booking", format: (v) => bookingStateFormat(v) },
    { key: "bookBy", label: "Book by", format: (v) => dateFormat(v) },
    { key: "openingHours", label: "Opening hours", format: (v) => openingHoursFormat(v) },
    { key: "tryList", label: "Try list", format: (v) => tryListFormat(v), same: sameTryList },
  ],
  TRANSPORT: [
    {
      key: "mode",
      label: "Mode",
      format: (v) => transportModeFormat(v),
    },
    { key: "depPlace", label: "Departure place" },
    { key: "arrPlace", label: "Arrival place" },
    { key: "depAt", label: "Departure time", format: (v) => dateTimeFormat(v) },
    { key: "arrAt", label: "Arrival time", format: (v) => dateTimeFormat(v) },
    { key: "reference", label: "Reference" },
    { key: "bookingState", label: "Booking", format: (v) => bookingStateFormat(v) },
    { key: "bookBy", label: "Book by", format: (v) => dateFormat(v) },
  ],
  ACCOMMODATION: [
    { key: "name", label: "Name" },
    { key: "address", label: "Address" },
    { key: "checkIn", label: "Check-in", format: (v) => dateFormat(v) },
    { key: "checkOut", label: "Check-out", format: (v) => dateFormat(v) },
    { key: "checkInTime", label: "Check-in time" },
    { key: "checkOutTime", label: "Check-out time" },
    { key: "confirmation", label: "Confirmation" },
    { key: "bookingState", label: "Booking", format: (v) => bookingStateFormat(v) },
    { key: "bookBy", label: "Book by", format: (v) => dateFormat(v) },
  ],
  CHAPTER: [
    { key: "name", label: "Name" },
    { key: "colour", label: "Colour" },
    { key: "startDate", label: "Start date", format: (v) => dateFormat(v) },
    { key: "endDate", label: "End date", format: (v) => dateFormat(v) },
  ],
  COST: [
    { key: "costMinor", label: "Cost", format: moneyFormat },
    { key: "paidMinor", label: "You paid", format: moneyFormat },
    { key: "currency", label: "Currency" },
    { key: "category", label: "Category", format: (v) => categoryFormat(v) },
    { key: "paidAt", label: "Paid", format: (v) => (v == null ? "not paid" : dateFormat((v instanceof Date ? formatISODate(v) : v))) },
  ],
  // NOTE carries an excerpt, not field diffs
  NOTE: [],
  // FORK has no diffable fields — it's a container entity
  FORK: [],
  // ATTACHMENT uses an excerpt (filename), not field diffs
  ATTACHMENT: [],
  // DAY_TITLE has a fixed label (see entityLabel) — nothing to diff
  DAY_TITLE: [],
  // assignedToName is resolved to a display name by the caller — an id would
  // be meaningless in the feed.
  CHECKLIST_ITEM: [
    { key: "text", label: "Text" },
    { key: "dueDate", label: "Due date", format: (v) => dateFormat(v) },
    { key: "assignedToName", label: "Assigned to" },
  ],
  // about, likewise, is what the Reminder is about by name (a Stop's name,
  // an Item's title or a leg's label), resolved by the caller (spec F8).
  REMINDER: [
    { key: "title", label: "Reminder" },
    { key: "date", label: "Date", format: (v) => dateFormat(v) },
    { key: "notes", label: "Notes" },
    { key: "about", label: "About" },
  ],
  // VOTE is always a { summary } line — nothing to diff
  VOTE: [],
};

// ---------------------------------------------------------------------------
// describeChanges
// ---------------------------------------------------------------------------

/**
 * For each diffable field of the given entity type, emit an ActivityChange
 * when before[key] !== after[key] (treating null / undefined / "" as empty).
 * Returns [] when nothing changed or the entity type has no diffable fields.
 */
export function describeChanges(
  entityType: ActivityEntityType,
  beforeRow: object,
  afterRow: object,
): ActivityChange[] {
  const before = beforeRow as Record<string, unknown>;
  const after = afterRow as Record<string, unknown>;
  const specs = FIELD_SPECS[entityType];
  const changes: ActivityChange[] = [];

  for (const spec of specs) {
    const bVal = before[spec.key];
    const aVal = after[spec.key];

    const bEmpty = isEmpty(bVal);
    const aEmpty = isEmpty(aVal);

    // Both empty → no change
    if (bEmpty && aEmpty) continue;

    // Both non-empty and equal → no change (normalise Dates to ISO strings
    // first, or the field's own `same`, e.g. a Try list ignores ticks)
    if (!bEmpty && !aEmpty && (spec.same ? spec.same(bVal, aVal) : normaliseForComparison(bVal) === normaliseForComparison(aVal))) continue;

    // Determine which row to use as "context" for format (e.g. currency lookup).
    // For COST money fields we want to prefer the after row's currency if available.
    const formatRow = { ...before, ...after };

    const fmt = spec.format ?? ((v) => defaultFormat(v));
    changes.push({
      field: spec.key,
      label: spec.label,
      from: fmt(bVal, formatRow),
      to: fmt(aVal, formatRow),
    });
  }

  return changes;
}

// ---------------------------------------------------------------------------
// entityLabel
// ---------------------------------------------------------------------------

/**
 * Return a snapshot display label for the given entity row.
 *
 *   STOP / ACCOMMODATION / CHAPTER → name
 *   ITEM                          → title
 *   TRANSPORT                     → reference ?? depPlace ?? "transport"
 *   COST                          → label ?? "cost"
 *   NOTE                          → "note"
 */
export function entityLabel(
  entityType: ActivityEntityType,
  entityRow: object,
): string {
  const row = entityRow as Record<string, unknown>;
  const str = (v: unknown): string =>
    typeof v === "string" && v.length > 0 ? v : "";

  switch (entityType) {
    case "STOP":
    case "ACCOMMODATION":
    case "CHAPTER":
      return str(row.name) || entityType.toLowerCase();

    case "ITEM":
      return str(row.title) || "item";

    case "TRANSPORT":
      return (
        str(row.reference) ||
        str(row.depPlace) ||
        "transport"
      );

    case "COST":
      return str(row.label) || "cost";

    case "NOTE":
      return "note";

    case "FORK":
      return str(row.name) || "what-if plan";

    case "ATTACHMENT":
      return str(row.filename) || "a file";

    case "DAY_TITLE":
      // Rows written before 2026-10-11 snapshot no title; they keep "Day title".
      return str(row.title) || "Day title";

    case "CHECKLIST_ITEM":
      return str(row.text) || "checklist item";

    case "REMINDER":
      return str(row.title) || "reminder";

    case "VOTE":
      return str(row.title) || "an idea";
  }
}

// ---------------------------------------------------------------------------
// headline
// ---------------------------------------------------------------------------

const VERB_WORD: Record<ActivityVerb, string> = {
  CREATED: "added",
  UPDATED: "updated",
  DELETED: "removed",
  NOTED: "left a note",
  PROMOTED: "promoted",
};

const ENTITY_NOUN: Record<ActivityEntityType, string> = {
  STOP: "stop",
  ITEM: "item",
  TRANSPORT: "transport",
  ACCOMMODATION: "accommodation",
  CHAPTER: "chapter",
  COST: "cost",
  NOTE: "note",
  FORK: "what-if plan",
  ATTACHMENT: "file",
  DAY_TITLE: "day title",
  CHECKLIST_ITEM: "checklist item",
  REMINDER: "reminder",
  VOTE: "vote",
};

/**
 * Build a human-readable headline for an activity record.
 *
 * Examples:
 *   { verb: "CREATED", entityType: "STOP",      entityLabel: "Rome"  } → "added the Rome stop"
 *   { verb: "UPDATED", entityType: "TRANSPORT",  entityLabel: "BA2490"} → "updated the BA2490 transport"
 *   { verb: "DELETED", entityType: "ACCOMMODATION", entityLabel: "Hotel X"} → "removed the Hotel X accommodation"
 *   { verb: "NOTED",   entityType: "NOTE",       entityLabel: "note"  } → "left a note"
 */
export function headline(a: {
  verb: ActivityVerb;
  entityType: ActivityEntityType;
  entityLabel: string;
}): string {
  if (a.verb === "NOTED") {
    return `left a note`;
  }

  // entityLabel is the fixed string "Day title" (see entityLabel above), so
  // the generic "{verb} the {label} {noun}" template would double up as
  // "updated the Day title day title".
  if (a.entityType === "DAY_TITLE") {
    return `${VERB_WORD[a.verb]} a day title`;
  }

  // A vote line normally carries a summary ("voted must-do on Sintra"); this
  // is only the fallback, and "{verb} the Sintra vote" would misread.
  if (a.entityType === "VOTE") {
    return `voted on ${a.entityLabel}`;
  }

  // Promote reads as "Make this the real plan" on screen (CONTEXT.md
  // **Promote**); the feed line says the same thing in the past tense
  // rather than the generic "{verb} the {label} {noun}" template, which
  // would otherwise read "promoted the ... fork".
  if (a.verb === "PROMOTED") {
    return `made the ${a.entityLabel} what-if plan the real plan`;
  }

  const verbWord = VERB_WORD[a.verb];
  const noun = ENTITY_NOUN[a.entityType];
  return `${verbWord} the ${a.entityLabel} ${noun}`;
}

// ---------------------------------------------------------------------------
// Summary builders — TC-07 (ADR 0012 amendment 2026-10-11)
// ---------------------------------------------------------------------------

const CHECKLIST_LIST_NAME: Record<string, string> = {
  PRETRIP: "the pre-trip checklist",
  PACKING: "the packing list",
  SHOPPING: "the shopping list",
};

export function checklistListName(kind: string): string {
  return CHECKLIST_LIST_NAME[kind] ?? "a checklist";
}

export function checklistItemSummary(
  verb: "CREATED" | "DELETED",
  text: string,
  kind: string,
): ActivitySummary {
  const list = checklistListName(kind);
  return { summary: verb === "CREATED" ? `added ${text} to ${list}` : `removed ${text} from ${list}` };
}

/** Only Pre-trip ticks are recorded — the caller decides; this just words it. */
export function checklistTickSummary(text: string, done: boolean): ActivitySummary {
  return { summary: done ? `ticked off ${text}` : `un-ticked ${text}` };
}

export function templateAppliedSummary(count: number, templateName: string): ActivitySummary {
  const items = count === 1 ? "1 item" : `${count} items`;
  return { summary: `added ${items} from the ${templateName} template to the packing list` };
}

/**
 * addChecklistItems (e.g. AI packing "Add all") — one line for the whole
 * batch, same shape as templateAppliedSummary but without a template name.
 */
export function checklistItemsAddedSummary(count: number, kind: string): ActivitySummary {
  const items = count === 1 ? "1 item" : `${count} items`;
  return { summary: `added ${items} to ${checklistListName(kind)}` };
}

const VOTE_LEVEL_WORD: Record<VoteLevel, string> = {
  MUST: "must-do",
  KEEN: "keen",
  MEH: "meh",
};

export function voteSummary(title: string, from: VoteLevel | null, to: VoteLevel): ActivitySummary {
  if (from === null) return { summary: `voted ${VOTE_LEVEL_WORD[to]} on ${title}` };
  return { summary: `changed their vote on ${title} from ${VOTE_LEVEL_WORD[from]} to ${VOTE_LEVEL_WORD[to]}` };
}

/** "Fri 11 Dec in Lisbon" — the day and Stop as they were when the title changed. */
export function dayTitleSummary(input: {
  date: string;
  stopName: string;
  before: string | null;
  after: string | null;
}): ActivitySummary {
  const where = `${formatDayLabel(input.date)} in ${input.stopName}`;
  if (input.before === null) return { summary: `titled ${where} “${input.after ?? ""}”` };
  if (input.after === null) return { summary: `removed the “${input.before}” title from ${where}` };
  return { summary: `renamed ${where} from “${input.before}” to “${input.after}”` };
}

/**
 * Surprise (CONTEXT.md): "made Paris a surprise for Sam and Alex", and the one
 * line a reveal leaves: "revealed the surprise in Paris" for a Stop,
 * "revealed the surprise: Dinner" for an Item.
 */
export function surpriseSummary(input: {
  kind: "set" | "reveal";
  kindOf: "STOP" | "ITEM";
  label: string;
  forNames?: string[];
}): ActivitySummary {
  if (input.kind === "reveal") {
    return { summary: input.kindOf === "STOP" ? `revealed the surprise in ${input.label}` : `revealed the surprise: ${input.label}` };
  }
  const names = input.forNames ?? [];
  const who = names.length <= 1 ? names[0] ?? "no one" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return { summary: `made ${input.label} a surprise for ${who}` };
}

/**
 * A Home timezone change (ADR 0030 amendment 2026-10-16): one trip-level
 * line. `keptLocalTimes` when at least one Home-end time was re-filed so it
 * keeps the local time it showed.
 */
export function homeTimezoneSummary(to: string | null, keptLocalTimes: boolean): ActivitySummary {
  const head = to === null ? "cleared the Home timezone" : `changed the Home timezone to ${to}`;
  return { summary: keptLocalTimes ? `${head}; Home-end times kept as local times` : head };
}

// ---------------------------------------------------------------------------
// activityLine — the one sentence every surface shows
// ---------------------------------------------------------------------------

/**
 * The line after the actor's name: a `{ summary }` payload when the row has
 * one (ADR 0012 §3b), otherwise the generic headline. The feed, the bell and
 * the MCP `get_activity` read all go through this so they say the same thing.
 */
export function activityLine(a: {
  verb: ActivityVerb;
  entityType: ActivityEntityType;
  entityLabel: string;
  changes: unknown;
}): string {
  const c = a.changes;
  if (c !== null && typeof c === "object" && !Array.isArray(c) && typeof (c as { summary?: unknown }).summary === "string") {
    return (c as ActivitySummary).summary;
  }
  return headline(a);
}

// ---------------------------------------------------------------------------
// viaLabel
// ---------------------------------------------------------------------------

/** Spec 2026-10-09: Activity done through a Claude connection reads "via Claude". */
export function viaLabel(source: string | null | undefined): string | null {
  return source === "CLAUDE" ? "via Claude" : null;
}
