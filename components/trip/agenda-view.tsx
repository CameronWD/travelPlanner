import Link from "next/link";
import { MapPin } from "lucide-react";
import { formatLongDate } from "@/lib/dates";
import type { DayPlan } from "@/lib/itinerary";
import { Badge } from "@/components/ui/badge";
import { cardVariants } from "@/components/ui/card";
import { Timeline } from "@/components/trip/timeline";
import { cn } from "@/lib/cn";

export interface AgendaViewProps {
  tripId: string;
  days: DayPlan[];
  /** Trip-reference-timezone "today" (YYYY-MM-DD), computed by the caller. */
  todayISO: string;
}

/**
 * The calendar's list view: one kit day card per day (Days.jsx day card —
 * sticker chips over the top edge, h4 date, the kit Days rows), centred at
 * the Day page's reading width. Today's card is lifted.
 */
export function AgendaView({ tripId, days, todayISO: today }: AgendaViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-2">
      {days.map((day) => {
        const isTravelDay = day.transportEntries.length > 0;
        const isToday = day.dateISO === today;
        const dayHref = `/trips/${tripId}/day/${day.dateISO}`;
        const hasSticker = isToday || isTravelDay;

        return (
          <section
            key={day.dateISO}
            aria-current={isToday ? "date" : undefined}
            className={cn(
              cardVariants({ shadow: isToday ? 3 : 2 }),
              "p-4",
              hasSticker && "pt-5",
              isToday && "-translate-x-0.5 -translate-y-0.5",
            )}
          >
            {hasSticker && (
              <span className="absolute -top-3 left-3.5 flex gap-1.5">
                {isToday && (
                  <Badge variant="ink" caps>
                    Today
                  </Badge>
                )}
                {isTravelDay && (
                  <Badge variant="coral" caps>
                    Travel day
                  </Badge>
                )}
              </span>
            )}

            <h2 className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em]">
              <Link href={dayHref} className="rounded-sm text-foreground transition-colors hover:text-coral-text">
                {formatLongDate(day.dateISO)}
              </Link>
            </h2>
            {day.stop && (
              <p className="mt-0.5 flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {day.stop.name}
                {day.stop.country ? `, ${day.stop.country}` : ""}
              </p>
            )}

            <div className="mt-3">
              <Timeline day={day} variant="agenda" />
            </div>
          </section>
        );
      })}
    </div>
  );
}
