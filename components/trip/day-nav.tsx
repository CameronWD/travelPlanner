import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
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
      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-2.5"
    >
      {/* Prev */}
      {prevDate ? (
        <Link
          href={`${base}/day/${prevDate}`}
          className={cn(
            "flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
          )}
          aria-label={`Go to ${prevDate}`}
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : (
        <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 text-sm text-muted-foreground/40 cursor-not-allowed select-none">
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </span>
      )}

      {/* Centre: day count + back to calendar */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
        <span className="text-xs font-medium text-muted-foreground">
          Day {dayNumber} of {totalDays}
        </span>
        <Link
          href={calendarHref}
          className={cn(
            "flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
          )}
        >
          <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
          Calendar
        </Link>
      </div>

      {/* Next */}
      {nextDate ? (
        <Link
          href={`${base}/day/${nextDate}`}
          className={cn(
            "flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
          )}
          aria-label={`Go to ${nextDate}`}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : (
        <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 text-sm text-muted-foreground/40 cursor-not-allowed select-none">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
