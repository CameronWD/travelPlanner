import { z } from "zod";
import { TRANSPORT_MODES } from "@/lib/enums";

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
 */
export const transportSchema = z.object({
  mode: z.enum(TRANSPORT_MODES),

  /** Stop this transport departs from (optional — may be a free-text place only). */
  fromStopId: z.string().trim().min(1).optional().or(z.literal("")),
  /** Stop this transport arrives at. */
  toStopId: z.string().trim().min(1).optional().or(z.literal("")),

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
});

export type TransportInput = z.infer<typeof transportSchema>;
