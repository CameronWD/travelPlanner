import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import type { BookingState } from "@/lib/enum-values";
import { BOOKING_STATE_LABELS, bookByLabel } from "@/lib/booking-state-copy";

/**
 * "To book" on a card, a leg, a stay or a Timeline row (CONTEXT.md "Booking
 * state", spec 2026-10-17 R2), with its book-by date. Nothing for Booked or
 * No booking needed: those need no attention. `compact` (pills and dense
 * rows) folds the two into one badge. Server Component (no hooks).
 *
 * `hidden`: pass `true` when the caller already speaks this text through its
 * own accessible name (e.g. LegPill's `aria-label`, which overrides
 * name-from-content) so the badge isn't announced twice.
 */
export function BookingStateBadge({
  state,
  bookBy,
  compact = false,
  className,
  hidden = false,
}: {
  state?: BookingState | null;
  bookBy?: string | null;
  compact?: boolean;
  className?: string;
  hidden?: boolean;
}) {
  if (state !== "TO_BOOK") return null;
  if (compact) {
    return (
      <Badge variant="warning" aria-hidden={hidden || undefined} className={cn("shrink-0", className)}>
        {bookBy ? bookByLabel(bookBy) : BOOKING_STATE_LABELS.TO_BOOK}
      </Badge>
    );
  }
  return (
    <span aria-hidden={hidden || undefined} className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <Badge variant="warning">{BOOKING_STATE_LABELS.TO_BOOK}</Badge>
      {bookBy ? <Badge variant="muted">{bookByLabel(bookBy)}</Badge> : null}
    </span>
  );
}
