import { z } from "zod";
import { categorySchema } from "@/lib/categories";
import { safeWebHref } from "@/lib/url";
import { CURRENCY_CODES } from "@/lib/currencies";

/** YYYY-MM-DD regex */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** HH:MM 24-hour regex */
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format (24h)");

/**
 * Zod schema for creating or updating an Item.
 *
 * Time-dropping rule: if times are provided but no date, the times are silently
 * dropped (transformed to undefined). Times are only meaningful when scheduled.
 *
 * Refinements:
 *  - If endTime is set, startTime must also be set.
 *  - endTime must be >= startTime (lexicographic comparison is valid for HH:MM).
 */
export const itemSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(140, "Title must be 140 characters or fewer"),
    category: categorySchema,
    // Empty string → undefined (no stop assigned)
    stopId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    // Empty string → undefined (unscheduled)
    date: z
      .union([isoDate, z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
    // Empty string → undefined
    startTime: z
      .union([hhmm, z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
    endTime: z
      .union([hhmm, z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
    address: z.string().trim().optional(),
    // Only accept links that resolve to a safe http(s) address. Rejects
    // javascript:/data: scheme links that would otherwise be a stored XSS
    // vector when rendered into an href for the other traveller.
    link: z
      .string()
      .trim()
      .optional()
      .refine((v) => v == null || v === "" || safeWebHref(v) !== null, {
        message: "Link must be a valid web address (http/https)",
      }),
    booking: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),

    // --- Inline cost fields (all optional) ---

    /** Estimated cost in minor units (e.g. cents). Integer. */
    estimatedMinor: z
      .number()
      .int("Estimated amount must be a whole number in minor units")
      .min(0, "Estimated amount must be 0 or greater")
      .max(2_147_483_647, "Amount is too large")
      .optional(),

    /** ISO 4217 currency code. Required when estimatedMinor is set. */
    currency: z
      .string()
      .length(3, "Currency must be a 3-letter ISO 4217 code")
      .toUpperCase()
      .refine((c) => CURRENCY_CODES.includes(c), {
        message: "Unsupported currency code",
      })
      .optional(),

    /** Actual cost in minor units. Optional. */
    actualMinor: z
      .number()
      .int("Actual amount must be a whole number in minor units")
      .min(0, "Actual amount must be 0 or greater")
      .max(2_147_483_647, "Amount is too large")
      .nullable()
      .optional(),

    /** ISO date string for when the cost was paid. Optional. */
    paidAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "paidAt must be YYYY-MM-DD")
      .nullable()
      .optional(),
  })
  // Drop times when no date is set
  .transform((data) => {
    if (!data.date) {
      return { ...data, startTime: undefined, endTime: undefined };
    }
    return data;
  })
  .refine(
    (data) => {
      // endTime without startTime is invalid
      if (data.endTime && !data.startTime) return false;
      return true;
    },
    {
      message: "Start time is required when an end time is set",
      path: ["startTime"],
    },
  )
  .refine(
    (data) => {
      // endTime must be >= startTime
      if (data.startTime && data.endTime && data.endTime < data.startTime) {
        return false;
      }
      return true;
    },
    {
      message: "End time must be on or after start time",
      path: ["endTime"],
    },
  );

/** The type callers pass in (pre-transform, all optional fields truly optional). */
export type ItemInput = z.input<typeof itemSchema>;

/** The type produced after parsing + transforms (internal use). */
export type ItemOutput = z.output<typeof itemSchema>;

/**
 * Returns true when an item is scheduled (has a date).
 * An item is UNSCHEDULED (wishlist) iff date == null/undefined.
 */
export function isScheduled(item: { date?: string | null }): boolean {
  return item.date != null && item.date !== "";
}
