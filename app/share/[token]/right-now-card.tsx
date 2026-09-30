import { Moon } from "lucide-react";
import { cn } from "@/lib/cn";
import { tzAbbrev, formatDayLabel, formatWeekday } from "@/lib/dates";
import { LocalClock } from "./local-clock";
import { MODE_LABELS, MODE_ICONS, ShareRows, type ShareRowModel } from "./share-rows";

// ---------------------------------------------------------------------------
// SHARE.md §4 — the Right now card: where the trip is this instant (a Stop
// or a Leg in progress), the local clock, today's plan (only when the link
// shares daily plans) and tonight's stay (name only — ADR 0051 floor, never
// an address). Server Component; the only client piece is the ticking clock.
// ---------------------------------------------------------------------------

export type RightNowPlace =
  | {
      kind: "stop";
      name: string;
      country: string | null;
      night: number;
      nights: number;
      dayTitle: string | null;
      next: { name: string; weekday: string } | null;
    }
  | { kind: "leg"; toName: string; mode: string; landsAt: string | null }
  | { kind: "none" };

export interface RightNowProps {
  timeZone: string;
  localDateISO: string;
  nowHHMM: string;
  place: RightNowPlace;
  /** null when includeDailyPlans is off (the list is skipped entirely). */
  rows: ShareRowModel[] | null;
  dayTitle: string | null;
  tonight: string | null;
}

const ROW_LIMIT = 5;

export function RightNowCard({ timeZone, localDateISO, nowHHMM, place, rows, dayTitle, tonight }: RightNowProps) {
  const LegIcon = place.kind === "leg" ? MODE_ICONS[place.mode] ?? MODE_ICONS.OTHER : null;

  return (
    <section
      data-slot="right-now"
      aria-labelledby="right-now-heading"
      className="rounded-3xl border-2 border-border bg-card p-5 shadow-hard-5 lg:rounded-[28px] lg:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">Right now</p>
        <p className="whitespace-nowrap text-[13px] font-bold tabular-nums">
          <span>{formatWeekday(localDateISO)}</span>
          <span className="hidden lg:inline">{` ${formatDayLabel(localDateISO).split(" ").slice(1).join(" ")}`}</span>
          {" · "}
          <LocalClock timeZone={timeZone} initial={nowHHMM} />
          {" "}
          {tzAbbrev(timeZone, localDateISO)}
        </p>
      </div>

      <h2
        id="right-now-heading"
        className="mt-2 font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] lg:text-[40px]"
      >
        {place.kind === "stop" && `In ${place.name}`}
        {place.kind === "leg" && `Travelling to ${place.toName}`}
        {place.kind === "none" && "On the move"}
      </h2>

      {place.kind === "stop" && (
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          <span className="hidden lg:block">
            {[
              place.country,
              `Night ${place.night} of ${place.nights}`,
              place.next ? `then ${place.next.name} on ${place.next.weekday}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="lg:hidden">
            {[`Night ${place.night} of ${place.nights}`, place.dayTitle].filter(Boolean).join(" · ")}
          </span>
        </p>
      )}

      {place.kind === "leg" && (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          {LegIcon && <LegIcon aria-hidden className="size-4 shrink-0" />}
          <span>
            {MODE_LABELS[place.mode] ?? place.mode}
            {place.landsAt ? ` · lands ${place.landsAt} local` : ""}
          </span>
        </p>
      )}

      {rows !== null && (
        <div className="mt-4 rounded-2xl border-2 border-border bg-background p-3">
          {rows.length === 0 ? (
            <p className="text-[13px] font-medium text-muted-foreground">Nothing planned today.</p>
          ) : (
            <>
              {dayTitle && <p className="font-display text-base font-extrabold">{dayTitle}</p>}
              <ShareRows rows={rows.slice(0, ROW_LIMIT)} dense />
              {rows.length > ROW_LIMIT && (
                <p className="text-[13px] font-bold text-muted-foreground">+{rows.length - ROW_LIMIT} more</p>
              )}
            </>
          )}
        </div>
      )}

      {tonight && (
        <div className="mt-3 flex items-center gap-2.5 rounded-[14px] border-2 border-border bg-sun px-3.5 py-2.5">
          <Moon aria-hidden className="size-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">Tonight</p>
            <p className="truncate text-sm font-extrabold">{tonight}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export function NextRow({
  next,
}: {
  next: { name: string; dotClass: string; right: { mode: string | null; label: string } };
}) {
  const Icon = next.right.mode ? MODE_ICONS[next.right.mode] ?? null : null;
  return (
    <div
      data-slot="share-next"
      className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-border bg-card px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.08em]">Next</span>
        <span aria-hidden className={cn("size-3 rounded-full border-2 border-border", next.dotClass)} />
        <span className="truncate font-display text-base font-extrabold">{next.name}</span>
      </div>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold tabular-nums">
        {Icon && <Icon aria-hidden className="size-3.5" />}
        {next.right.label}
      </span>
    </div>
  );
}
