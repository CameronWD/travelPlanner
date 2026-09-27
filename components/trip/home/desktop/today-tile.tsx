import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Bed, CalendarDays, Plane } from "lucide-react";
import { formatDayLabel } from "@/lib/dates";
import { Card } from "@/components/ui/card";

export interface TodayTileProps {
  /** The full day view for today. */
  dayHref: string;
  /** Today (YYYY-MM-DD). */
  dateISO: string;
  /** Today's Day title (CONTEXT.md "Day title"), if any. */
  dayTitle?: string | null;
  /** Today's plan (the Phase's Timeline) — null when nothing is planned. */
  plan: ReactNode | null;
  /** The next departure from today on. */
  nextTransport: { label: string; depTimeLabel?: string | null; depZone?: string | null } | null;
  /** Tonight's stay. */
  tonight: { name: string; address: string | null } | null;
}

const SECTION_HEADING = "text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground";

/**
 * Desktop Travelling Home "Today" tile (spec D, row 2): today's plan, the next
 * Transport and tonight's stay in one white card, headed by the day label and
 * today's Day title. Links on to the full day view.
 */
export function TodayTile({ dayHref, dateISO, dayTitle, plan, nextTransport, tonight }: TodayTileProps) {
  const leaves = nextTransport?.depTimeLabel
    ? `Leaves ${nextTransport.depTimeLabel}${nextTransport.depZone ? ` ${nextTransport.depZone}` : ""}`
    : null;

  return (
    <Card radius="xl" shadow={3} className="flex h-full min-h-0 flex-col p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-display text-[26px] font-extrabold leading-none tracking-[-0.03em]">Today</h2>
          <span className="text-sm font-bold text-muted-foreground">{formatDayLabel(dateISO)}</span>
        </div>
        <Link
          href={dayHref}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-bold underline-offset-2 hover:underline"
        >
          Full day view
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {dayTitle ? <p className="mt-1 text-sm font-bold text-muted-foreground">{dayTitle}</p> : null}

      <section className="mt-4 min-h-0 flex-1">
        <h3 className={SECTION_HEADING}>Today&apos;s plan</h3>
        <div className="mt-2">
          {plan ?? (
            <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden="true" />
              Nothing planned
            </p>
          )}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t-2 border-border pt-4">
        <section className="min-w-0">
          <h3 className={SECTION_HEADING}>Next transport</h3>
          {nextTransport ? (
            <div className="mt-1.5 flex items-start gap-2">
              <Plane className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-snug">{nextTransport.label}</p>
                {leaves ? <p className="text-[13px] font-semibold text-muted-foreground">{leaves}</p> : null}
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-sm font-semibold text-muted-foreground">No more legs booked</p>
          )}
        </section>
        <section className="min-w-0">
          <h3 className={SECTION_HEADING}>Tonight&apos;s stay</h3>
          {tonight ? (
            <div className="mt-1.5 flex items-start gap-2">
              <Bed className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-snug">{tonight.name}</p>
                {tonight.address ? (
                  <p className="truncate text-[13px] font-semibold text-muted-foreground">{tonight.address}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-sm font-semibold text-muted-foreground">No stay booked</p>
          )}
        </section>
      </div>
    </Card>
  );
}
