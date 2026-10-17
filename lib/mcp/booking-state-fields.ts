/**
 * Booking state on the Claude connection's write tools (spec 2026-10-17 R2,
 * R13): the same field on add_/update_thing_to_do, add_/update_transport and
 * add_/update_accommodation, and set_booking_state's. The action's rule
 * (lib/booking-state-patch.ts over lib/booking-state.ts) does the rest: a
 * book-by date sent with anything but TO_BOOK is refused on `bookBy`.
 */
import { z } from "zod";
import { BOOKING_STATES } from "@/lib/enum-values";
import { bookingStateSchema } from "@/lib/enums";
import { isoDate } from "@/lib/validations/primitives";
import { BOOKING_STATE_MEANING, describeValues } from "./vocab";

const BOOKING_STATE_INTRO =
  "Whether it still has to be booked. Omit it and a booking reference makes it BOOKED; without one a Transport leg or Accommodation is TO_BOOK and a thing to do NONE. A state you set stays when the reference changes.";

export const describedBookingState = bookingStateSchema.describe(
  describeValues(BOOKING_STATE_INTRO, BOOKING_STATE_MEANING, BOOKING_STATES),
);

export const bookByField = isoDate.describe("YYYY-MM-DD: the day it should be booked by. Only with TO_BOOK.");

export const bookingCreateShape = {
  bookingState: describedBookingState.optional(),
  bookBy: bookByField.optional(),
};

export const bookingPatchShape = {
  // null is the PATCH clear (ADR 0075): the Traveller's choice goes, and the state is worked out from the reference again.
  bookingState: bookingStateSchema
    .nullable()
    .optional()
    .describe(
      describeValues(
        `${BOOKING_STATE_INTRO} Pass null to hand it back to automatic (worked out from the reference again).`,
        BOOKING_STATE_MEANING,
        BOOKING_STATES,
      ),
    ),
  bookBy: z
    .union([isoDate, z.literal("")])
    .nullable()
    .optional()
    .describe('YYYY-MM-DD: the day it should be booked by, only while TO_BOOK. null clears it ("" does too).'),
};

/** An update tool's `bookBy: null` is the PATCH clear (ADR 0075); `""` is an alias for it. */
export function bookingPatchFrom<T extends { bookBy?: string | null }>(patch: T): Omit<T, "bookBy"> & { bookBy?: string | null } {
  if (patch.bookBy !== "") return patch;
  return { ...patch, bookBy: null };
}
