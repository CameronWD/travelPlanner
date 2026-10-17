/**
 * Booking state in words (CONTEXT.md "Booking state"): the three names (S's
 * one copy, lib/booking-state.ts) and the book-by date as cards and Home say
 * it. Zod-free and React-free, so client components import it
 * (lib/client-zod.guard.test.ts).
 */
import { formatDayMonth } from "@/lib/dates";

export { BOOKING_STATE_LABELS } from "@/lib/booking-state";

/** "Book by 20 Nov". */
export function bookByLabel(bookBy: string): string {
  return `Book by ${formatDayMonth(bookBy)}`;
}
