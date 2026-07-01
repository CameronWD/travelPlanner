/**
 * Activity feed helpers — pure module, no Prisma / React / network.
 *
 * Provides:
 *   - Verb and entity-type vocabularies
 *   - Field-level diffing (describeChanges)
 *   - Snapshot display labels (entityLabel)
 *   - Human-readable headline strings (headline)
 */

import { formatMoney } from "@/lib/money";
import { formatLongDate } from "@/lib/dates";
import { categoryLabel, type Category } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Vocab
// ---------------------------------------------------------------------------

export const ACTIVITY_VERBS = [
  "CREATED",
  "UPDATED",
  "DELETED",
  "NOTED",
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
  ],
  ACCOMMODATION: [
    { key: "name", label: "Name" },
    { key: "address", label: "Address" },
    { key: "checkIn", label: "Check-in", format: (v) => dateFormat(v) },
    { key: "checkOut", label: "Check-out", format: (v) => dateFormat(v) },
    { key: "confirmation", label: "Confirmation" },
  ],
  CHAPTER: [
    { key: "name", label: "Name" },
    { key: "colour", label: "Colour" },
    { key: "startDate", label: "Start date", format: (v) => dateFormat(v) },
    { key: "endDate", label: "End date", format: (v) => dateFormat(v) },
  ],
  COST: [
    { key: "estimatedMinor", label: "Estimated", format: moneyFormat },
    { key: "actualMinor", label: "Actual", format: moneyFormat },
    { key: "currency", label: "Currency" },
    { key: "category", label: "Category", format: (v) => categoryFormat(v) },
  ],
  // NOTE carries an excerpt, not field diffs
  NOTE: [],
  // FORK has no diffable fields — it's a container entity
  FORK: [],
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
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ActivityChange[] {
  const specs = FIELD_SPECS[entityType];
  const changes: ActivityChange[] = [];

  for (const spec of specs) {
    const bVal = before[spec.key];
    const aVal = after[spec.key];

    const bEmpty = isEmpty(bVal);
    const aEmpty = isEmpty(aVal);

    // Both empty → no change
    if (bEmpty && aEmpty) continue;

    // Both non-empty and equal → no change (normalise Dates to ISO strings first)
    if (!bEmpty && !aEmpty && normaliseForComparison(bVal) === normaliseForComparison(aVal)) continue;

    // Determine which row to use as "context" for format (e.g. currency lookup).
    // For COST money fields we want to prefer the after row's currency if available.
    const formatRow = { ...before, ...after } as Record<string, unknown>;

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
  row: Record<string, unknown>,
): string {
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
      return str(row.name) || "fork";
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
};

const ENTITY_NOUN: Record<ActivityEntityType, string> = {
  STOP: "stop",
  ITEM: "item",
  TRANSPORT: "transport",
  ACCOMMODATION: "accommodation",
  CHAPTER: "chapter",
  COST: "cost",
  NOTE: "note",
  FORK: "fork",
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
  const verbWord = VERB_WORD[a.verb];
  const noun = ENTITY_NOUN[a.entityType];

  if (a.verb === "NOTED") {
    return `left a note`;
  }

  return `${verbWord} the ${a.entityLabel} ${noun}`;
}
