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
    { key: "depAt", label: "Departure time" },
    { key: "arrAt", label: "Arrival time" },
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

    // Both non-empty and equal → no change
    if (!bEmpty && !aEmpty && bVal === aVal) continue;

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
