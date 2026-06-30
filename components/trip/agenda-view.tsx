import Link from "next/link";
import { MapPin } from "lucide-react";
import { formatLongDate, todayISO } from "@/lib/dates";
import type { DayPlan } from "@/lib/itinerary";
import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/trip/timeline";
import { cn } from "@/lib/cn";

export interface AgendaViewProps {
  tripId: string;
  days: DayPlan[];
}

export function AgendaView({ tripId, days }: AgendaViewProps) {
  const today = todayISO();

  return (
    <div className="flex flex-col gap-0 divide-y divide-border/50">
      {days.map((day) => {
        const isTravelDay = day.transportEntries.length > 0;
        const isToday = day.dateISO === today;
        const dayHref = `/trips/${tripId}/day/${day.dateISO}`;

        return (
          <section
            key={day.dateISO}
            className={cn("py-5 first:pt-0", isToday && "bg-primary/5 -mx-4 px-4 rounded-lg")}
            aria-current={isToday ? "date" : undefined}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <Link
                  href={dayHref}
                  className="group flex items-center gap-2 font-display text-base font-semibold text-foreground hover:text-primary transition-colors"
                >
                  {formatLongDate(day.dateISO)}
                  {isToday && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0 font-medium">
                      Today
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground group-hover:text-primary/70 transition-colors">
                    →
                  </span>
                </Link>
                {day.stop && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    {day.stop.name}
                    {day.stop.country ? `, ${day.stop.country}` : ""}
                  </p>
                )}
              </div>
              {isTravelDay && (
                <Badge variant="accent" className="text-xs shrink-0">
                  Travel day
                </Badge>
              )}
            </div>
            <div className="pl-1">
              <Timeline day={day} variant="agenda" />
            </div>
          </section>
        );
      })}
    </div>
  );
}
