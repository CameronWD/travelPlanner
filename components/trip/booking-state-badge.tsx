import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import type { BookingState } from "@/lib/enum-values";
import { BOOKING_STATE_LABELS, bookByLabel } from "@/lib/booking-state-copy";

/**
 * "To book" on a card, a leg, a stay or a Timeline row (CONTEXT.md "Booking
 * state", spec 2026-10-17 R2), with its book-by date. Nothing for Booked or
 * No booking needed: those need no attention. `compact` (pills and dense
 * rows) folds the two into one badge. Server Component (no hooks).
 */
export function BookingStateBadge({
  state,
  bookBy,
  compact = false,
  className,
}: {
  state?: BookingState | null;
  bookBy?: string | null;
  compact?: boolean;
  className?: string;
}) {
  if (state !== "TO_BOOK") return null;
  if (compact) {
    return (
      <Badge variant="warning" data-booking-state className={cn("shrink-0", className)}>
        {bookBy ? bookByLabel(bookBy) : BOOKING_STATE_LABELS.TO_BOOK}
      </Badge>
    );
  }
  return (
    <span data-booking-state className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <Badge variant="warning">{BOOKING_STATE_LABELS.TO_BOOK}</Badge>
      {bookBy ? <Badge variant="muted">{bookByLabel(bookBy)}</Badge> : null}
    </span>
  );
}
