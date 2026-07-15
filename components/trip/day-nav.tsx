import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, daysBetween } from "@/lib/dates";

export interface DayNavProps {
  tripId: string;
  currentDate: string; // YYYY-MM-DD
  startDate: string; // Trip start
  endDate: string; // Trip end
}

/**
 * Previous / next day navigation for the Day view.
 * Shows disabled-looking links at the trip boundaries and a "Back to calendar" link.
 */
export function DayNav({
  tripId,
  currentDate,
  startDate,
  endDate,
}: DayNavProps) {
  const base = `/trips/${tripId}`;
  const calendarHref = `${base}/calendar`;

  const isFirst = currentDate <= startDate;
  const isLast = currentDate >= endDate;

  const prevDate = !isFirst ? addDays(currentDate, -1) : null;
  const nextDate = !isLast ? addDays(currentDate, 1) : null;

  // Day number (1-indexed)
  const dayNumber = daysBetween(startDate, currentDate) + 1;
  const totalDays = daysBetween(startDate, endDate) + 1;

  return (
    <nav
      aria-label="Day navigation"
      className="flex items-center justify-between gap-2"
    >
      {/* Prev */}
      {prevDate ? (
        <Link
          href={`${base}/day/${prevDate}`}
          className={cn(
            "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`Go to ${prevDate}`}
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : (
        <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground/40 cursor-not-allowed select-none">
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
        </span>
      )}

      {/* Centre: day count + back to calendar */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
          Day {dayNumber} of {totalDays}
        </span>
        <Link
          href={calendarHref}
          className={cn(
            "text-xs text-muted-foreground hover:underline transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
          )}
        >
          Calendar
        </Link>
      </div>

      {/* Next */}
      {nextDate ? (
        <Link
          href={`${base}/day/${nextDate}`}
          className={cn(
            "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`Go to ${nextDate}`}
        >
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : (
        <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground/40 cursor-not-allowed select-none">
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
