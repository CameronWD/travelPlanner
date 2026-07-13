import { z } from "zod";
import { TRANSPORT_MODES } from "@/lib/enums";
import { CURRENCY_CODES } from "@/lib/currencies";

/**
 * Accept a datetime-local string ("2026-07-01T08:00") or a full ISO string
 * and coerce it to a Date. Returns z.date() on success.
 *
 * We use z.preprocess so the form can pass the raw datetime-local string and
 * the action can pass a Date interchangeably.
 */
const isoDatetime = z.preprocess((val) => {
  if (val instanceof Date) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}, z.date().optional());

/**
 * Zod schema for creating or updating a Transport.
 *
 * All fields are intentionally lenient — a transport may be partially filled
 * while a trip is being planned.
 *
 * The optional cost fields (estimatedMinor, currency, actualMinor, paidAt)
 * let callers capture a single transport-owned Cost in one step, without
 * requiring a separate CostEditor interaction. All cost fields are optional —
 * a transport with no cost still validates.
 */
export const transportSchema = z.object({
  mode: z.enum(TRANSPORT_MODES),

  /** Stop this transport departs from (optional — may be a free-text place only). */
  fromStopId: z.string().trim().min(1).optional().or(z.literal("")),
  /** Stop this transport arrives at. */
  toStopId: z.string().trim().min(1).optional().or(z.literal("")),

  /** Whether this transport departs from the trip's Home base. */
  depIsHome: z.boolean().optional(),
  /** Whether this transport arrives at the trip's Home base. */
  arrIsHome: z.boolean().optional(),

  /** Free-text departure place name. */
  depPlace: z.string().trim().optional(),
  /** Free-text arrival place name. */
  arrPlace: z.string().trim().optional(),

  /** Departure instant (datetime-local or ISO string → stored as Date). */
  depAt: isoDatetime,
  /** Arrival instant. */
  arrAt: isoDatetime,

  /** Booking / ticket reference (flight number, train code, …). */
  reference: z.string().trim().optional(),
  /** Free-form notes. */
  notes: z.string().trim().optional(),

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
});

export type TransportInput = z.infer<typeof transportSchema>;
