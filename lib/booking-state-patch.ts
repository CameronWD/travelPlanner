/**
 * Booking state on write, as a PATCH (CONTEXT.md "Booking state", spec
 * 2026-10-17 R2; ADR 0075). The rule itself is S's lib/booking-state.ts
 * (`bookingStateWrite`, `activeBookBy`); this is only the layer the create and
 * update actions call, adding the book-by date to it:
 *
 *  - `bookingState` undefined keeps the Traveller's choice (or keeps
 *    deriving from the reference AFTER the write), null clears the choice,
 *    a state is the Traveller's choice;
 *  - `bookBy` undefined keeps, null clears; it only rides with To book. Sent
 *    with anything else it is refused on the field, and a stored one is
 *    dropped when the state leaves To book (a Traveller choosing Booked, an
 *    un-chosen leg gaining a reference).
 *
 * Pure and zod-free.
 */
import type { ActionFailure } from "@/lib/action-result";
import {
  activeBookBy,
  bookingStateWrite,
  defaultBookingState,
  type BookingStateRow,
  type BookingSubject,
} from "@/lib/booking-state";
import type { BookingState } from "@/lib/enum-values";
import { patched } from "@/lib/patch";

export interface BookingFields {
  bookingState: BookingState;
  bookingStateSet: boolean;
  bookBy: string | null;
}

export interface BookingPatch {
  bookingState?: BookingState | null;
  bookBy?: string | null;
}

/** The row before the write; a Prisma row's `bookingState` is a plain string. */
export type BookingCurrent = BookingStateRow & { bookBy?: string | null };

export const BOOK_BY_NEEDS_TO_BOOK = "A book-by date is only for something still to book.";

/** The three columns to write, or the refusal of a book-by date on something not To book. */
export function resolveBookingWrite(
  subject: BookingSubject,
  current: BookingCurrent | null,
  patch: BookingPatch,
  reference: string | null | undefined,
): BookingFields | ActionFailure {
  const columns = bookingStateWrite(subject, current, patch.bookingState, reference);
  if (columns.bookingState !== "TO_BOOK" && patch.bookBy) {
    return { success: false, errors: { bookBy: [BOOK_BY_NEEDS_TO_BOOK] } };
  }
  return { ...columns, bookBy: activeBookBy(columns.bookingState, patched(patch.bookBy, current?.bookBy)) };
}

/** A new row with nothing chosen and no reference (Wishlist from a Marker, Duplicate trip). */
export function defaultBookingFields(subject: BookingSubject): BookingFields {
  return { bookingState: defaultBookingState(subject), bookingStateSet: false, bookBy: null };
}

/**
 * A placed copy of a Wishlist idea (ADR 0019): the idea's chosen state (and
 * its book-by date while To book) carries over; an un-chosen idea's copy
 * re-derives, and the reference is never copied, so it needs no booking.
 */
export function copiedBookingFields(source: BookingCurrent): BookingFields {
  const columns = bookingStateWrite("ITEM", source, undefined, null);
  return { ...columns, bookBy: activeBookBy(columns.bookingState, source.bookBy) };
}
