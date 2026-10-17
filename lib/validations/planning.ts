import { z } from "zod";
import { MAX_ARRIVE_BY_MINUTES } from "@/lib/slot-time";
import { hhmm, isoDateWith } from "@/lib/validations/primitives";

/**
 * Field schemas for the planning model (spec 2026-10-17 R2–R3), composed into
 * itemSchema / transportSchema / accommodationSchema by the tasks that wire
 * the fields in. Booking state itself is `bookingStateSchema` (lib/enums.ts).
 */

/** CONTEXT.md "Booking state": the day a To book thing should be booked by. */
export const bookBySchema = isoDateWith(
  "Book-by date must be in YYYY-MM-DD format",
  "Book-by date must be a real calendar date",
);

/** CONTEXT.md "Slot time": the ticket's time, Stop-local. */
export const slotTimeSchema = hhmm;

export const arriveByMinutesSchema = z
  .number()
  .int("Arrive-by must be whole minutes")
  .min(0, "Arrive-by can't be negative")
  .max(MAX_ARRIVE_BY_MINUTES, "Arrive-by can be at most 12 hours");

/** true = refundable, false = not; the caller's `.nullable()` carries "not known". */
export const refundableSchema = z.boolean();

/** superRefine callback: an arrive-by margin only means something against a slot time. */
export function checkSlotFields(
  data: { slotTime?: string | null; arriveByMinutes?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (data.arriveByMinutes != null && !data.slotTime) {
    ctx.addIssue({ code: "custom", message: "Set the slot time to use an arrive-by margin", path: ["arriveByMinutes"] });
  }
}
