import { BOOKING_STATES, type BookingState } from "@/lib/enum-values";

/**
 * CONTEXT.md "Booking state" (spec 2026-10-17 R2) — the one rule, zod-free so
 * cards and badges can share it.
 *
 * Columns: `bookingState` is always the EFFECTIVE state, `bookingStateSet`
 * says the Traveller chose it. Unset, a booking reference (Item `booking`,
 * Transport `reference`, Accommodation `confirmation`) means Booked, and its
 * absence means the subject's default. Every writer stores
 * `bookingStateWrite`'s result, so readers filter the column directly.
 */
export type BookingSubject = "ITEM" | "TRANSPORT" | "ACCOMMODATION";

export const BOOKING_STATE_LABELS: Record<BookingState, string> = {
  NONE: "No booking needed",
  TO_BOOK: "To book",
  BOOKED: "Booked",
};

export function isBookingState(v: unknown): v is BookingState {
  return typeof v === "string" && (BOOKING_STATES as readonly string[]).includes(v);
}

/** An Item needs no booking unless the Traveller says so; Transport and Accommodation are To book. */
export function defaultBookingState(subject: BookingSubject): BookingState {
  return subject === "ITEM" ? "NONE" : "TO_BOOK";
}

/** A reference that is blank or whitespace is no reference. */
export function hasBookingReference(reference: string | null | undefined): boolean {
  return reference != null && reference.trim() !== "";
}

export function derivedBookingState(subject: BookingSubject, reference: string | null | undefined): BookingState {
  return hasBookingReference(reference) ? "BOOKED" : defaultBookingState(subject);
}

export interface BookingStateRow {
  bookingState?: string | null;
  bookingStateSet?: boolean | null;
}

export interface BookingStateColumns {
  bookingState: BookingState;
  bookingStateSet: boolean;
}

/** The state a row is in: the Traveller's choice when set, else derived from its reference. */
export function effectiveBookingState(
  subject: BookingSubject,
  row: BookingStateRow,
  reference: string | null | undefined,
): BookingState {
  if (row.bookingStateSet === true && isBookingState(row.bookingState)) return row.bookingState;
  return derivedBookingState(subject, reference);
}

/**
 * The two columns a write stores. `current` is the row before the write (null
 * on create); `reference` is the reference AFTER the write. `change` follows
 * the PATCH convention (lib/patch.ts):
 *  - undefined: keep the Traveller's choice if there is one, else re-derive
 *    from the (possibly new) reference;
 *  - null: hand the choice back to automatic;
 *  - a state: the Traveller's explicit choice.
 */
export function bookingStateWrite(
  subject: BookingSubject,
  current: BookingStateRow | null,
  change: BookingState | null | undefined,
  reference: string | null | undefined,
): BookingStateColumns {
  if (change === null) return { bookingState: derivedBookingState(subject, reference), bookingStateSet: false };
  if (change !== undefined) return { bookingState: change, bookingStateSet: true };
  if (current?.bookingStateSet === true && isBookingState(current.bookingState)) {
    return { bookingState: current.bookingState, bookingStateSet: true };
  }
  return { bookingState: derivedBookingState(subject, reference), bookingStateSet: false };
}

/**
 * The book-by date that counts: a date only makes sense while To book, so
 * callers (`resolveBookingWrite`, `copiedBookingFields`) store this result,
 * not the raw patch value — a date is dropped from the row the moment the
 * state leaves To book, not merely hidden from readers while it stays there.
 */
export function activeBookBy(state: string | null | undefined, bookBy: string | null | undefined): string | null {
  return state === "TO_BOOK" && bookBy ? bookBy : null;
}
