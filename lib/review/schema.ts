/**
 * The zod side of a Finding's suggested fix (spec 2026-10-17 R8), kept apart
 * from lib/review/types.ts so client code never pulls in zod
 * (lib/client-zod.guard.test.ts). Strict: an unknown kind or key is no fix,
 * and a Finding with no fix can only be Dismissed.
 */
import { z } from "zod";
import { BOOKING_STATES } from "@/lib/enum-values";
import { hhmm, isoDate } from "@/lib/validations/primitives";
import { openingHoursSchema } from "@/lib/validations/opening-hours";
import { BOOK_BY_NEEDS_TO_BOOK } from "@/lib/booking-state-patch";
import type { SuggestedFix } from "@/lib/review/types";

/** The longest text an `item.note` fix may add to an Item's notes. */
export const MAX_NOTE_APPEND = 500;

const rowId = z.string().trim().min(1).max(64);

// lib/enums.ts's bookingStateSchema, built here: lib/enums is off limits to lib/** outside
// validations and MCP (eslint.config.mjs, spec 2026-10-06 §R).
const bookingStateSchema = z.enum(BOOKING_STATES);

const bookingFix = <K extends string>(kind: K) =>
  z.strictObject({ kind: z.literal(kind), id: rowId, bookingState: bookingStateSchema, bookBy: isoDate.nullable().optional() });

export const suggestedFixSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("item.times"),
      itemId: rowId,
      startTime: hhmm.nullable().optional(),
      endTime: hhmm.nullable().optional(),
      date: isoDate.optional(),
    }),
    bookingFix("item.bookingState"),
    bookingFix("transport.bookingState"),
    bookingFix("accommodation.bookingState"),
    z.strictObject({ kind: z.literal("item.openingHours"), itemId: rowId, hours: openingHoursSchema }),
    z.strictObject({ kind: z.literal("item.note"), itemId: rowId, append: z.string().trim().min(1).max(MAX_NOTE_APPEND) }),
  ])
  .superRefine((fix, ctx) => {
    if (fix.kind === "item.times" && fix.startTime === undefined && fix.endTime === undefined && fix.date === undefined) {
      ctx.addIssue({ code: "custom", message: "A times fix changes the start, the end or the day." });
    }
    if (
      (fix.kind === "item.bookingState" || fix.kind === "transport.bookingState" || fix.kind === "accommodation.bookingState") &&
      fix.bookBy &&
      fix.bookingState !== "TO_BOOK"
    ) {
      ctx.addIssue({ code: "custom", path: ["bookBy"], message: BOOK_BY_NEEDS_TO_BOOK });
    }
  });

/** The stored text as a fix, or null when it is absent, unreadable or not a valid fix. */
export function parseSuggestedFix(raw: string | null | undefined): SuggestedFix | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = suggestedFixSchema.safeParse(json);
  return parsed.success ? (parsed.data satisfies SuggestedFix) : null;
}

/** The text to store: the validated (trimmed) fix, or null for no fix or an invalid one. */
export function serializeSuggestedFix(fix: SuggestedFix | undefined): string | null {
  if (!fix) return null;
  const parsed = suggestedFixSchema.safeParse(fix);
  return parsed.success ? JSON.stringify(parsed.data) : null;
}
