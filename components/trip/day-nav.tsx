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
 * Kit IconButton shape (secondary, 44px): 2px outline, hard shadow that lifts on
 * hover and collapses on press. Written out here because DayNav is a Server
 * Component and `buttonVariants` lives in a client module.
 */
const NAV_BUTTON =
  "pressable inline-grid size-11 shrink-0 place-items-center rounded-md border-2 border-border bg-card text-foreground shadow-hard-1 hover:shadow-hard-2";

/** Boundary placeholder: same footprint, no shadow, faded — not a control. */
const NAV_BUTTON_OFF =
  "inline-grid size-11 shrink-0 place-items-center rounded-md border-2 border-border-soft text-muted-foreground opacity-45 select-none";

/**
 * Previous / next day navigation for the Day view.
 * Shows faded placeholders at the trip boundaries and a "Days" (back to calendar) link.
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
          className={cn(NAV_BUTTON, "min-h-11 min-w-11")}
          aria-label={`Go to ${prevDate}`}
        >
          <ChevronLeft className="size-5" strokeWidth={2.5} aria-hidden="true" />
        </Link>
      ) : (
        <span className={NAV_BUTTON_OFF} aria-hidden="true">
          <ChevronLeft className="size-5" strokeWidth={2.5} />
        </span>
      )}

      {/* Centre: day count (kit Today label) + back to calendar */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        <span aria-current="date" className="text-label text-muted-foreground">
          Day {dayNumber} of {totalDays}
        </span>
        <Link
          href={calendarHref}
          className="relative rounded-sm text-xs font-extrabold text-foreground underline decoration-2 underline-offset-4 hover:decoration-coral pointer-coarse:after:absolute pointer-coarse:after:-inset-x-3 pointer-coarse:after:-inset-y-3.5 pointer-coarse:after:content-['']"
        >
          Days
        </Link>
      </div>

      {/* Next */}
      {nextDate ? (
        <Link
          href={`${base}/day/${nextDate}`}
          className={cn(NAV_BUTTON, "min-h-11 min-w-11")}
          aria-label={`Go to ${nextDate}`}
        >
          <ChevronRight className="size-5" strokeWidth={2.5} aria-hidden="true" />
        </Link>
      ) : (
        <span className={NAV_BUTTON_OFF} aria-hidden="true">
          <ChevronRight className="size-5" strokeWidth={2.5} />
        </span>
      )}
    </nav>
  );
}
