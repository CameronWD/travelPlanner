import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { HUE_CLASSES } from "@/lib/hues";
import { stopDotClass, stopHue } from "@/lib/stop-colours";
import { formatDateRangeCompact, formatDayLabel, formatNights } from "@/lib/dates";
import type { StopStatus } from "@/lib/share-view";
import { MODE_ICONS, ShareRow, type ShareRowModel } from "./share-rows";
import { DayByDayProvider, StopBlock, StopIndex, StopPicker } from "./day-by-day-client";

export interface DayByDayDay {
  dateISO: string;
  isToday: boolean;
  /** null when includeDailyPlans is off or the day has no title. */
  title: string | null;
  rows: ShareRowModel[];
}

export interface DayByDayStop {
  id: string;
  name: string;
  number: number;
  sortOrder: number;
  arriveDate: string;
  departDate: string;
  nights: number;
  status: StopStatus;
  days: DayByDayDay[];
  /** Transport from this stop to the next; null when includeTransport is off or none. */
  legAfter: { mode: string; label: string; line: string } | null;
}

/**
 * SHARE.md §7 — Day by day. Server-rendered; only the fold / picker state is
 * client-side, and the client pieces receive view models, never rows.
 * `initialOpenId` is computed on the server (current stop during, first
 * before, none after) so the first client render matches.
 */
export function DayByDay({ stops, initialOpenId }: { stops: DayByDayStop[]; initialOpenId: string | null }) {
  return (
    <section data-share-section-inner="days" aria-labelledby="days-heading">
      <DayByDayProvider initialOpenId={initialOpenId}>
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className="lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="days-heading"
                className="font-display text-2xl font-extrabold tracking-[-0.03em] lg:text-[28px]"
              >
                Day by day
              </h2>
              <StopPicker className="lg:hidden" stops={stops.map((s) => ({ id: s.id, name: s.name }))} />
            </div>
            <StopIndex
              className="mt-3 hidden lg:flex"
              stops={stops.map((s) => ({
                id: s.id,
                name: s.name,
                dotClass: stopDotClass(s.sortOrder),
                dates: formatDateRangeCompact(s.arriveDate, s.departDate),
              }))}
            />
          </div>
          <ol className="mt-3 flex flex-col gap-3 lg:mt-0">
            {stops.map((s) => (
              <li key={s.id} id={`share-stop-${s.id}`} data-share-stop={s.id} className="scroll-mt-6">
                <StopBlock
                  stopId={s.id}
                  name={s.name}
                  dashed={s.status === "past"}
                  folded={<FoldedStop s={s} />}
                  open={<OpenStop s={s} />}
                />
                {s.legAfter && <LegLine leg={s.legAfter} />}
              </li>
            ))}
          </ol>
        </div>
      </DayByDayProvider>
    </section>
  );
}

function FoldedStop({ s }: { s: DayByDayStop }) {
  const n = s.days.length;
  return (
    <>
      <span aria-hidden className={cn("size-3.5 shrink-0 rounded-full border-2 border-border", stopDotClass(s.sortOrder))} />
      <span className="min-w-0 flex-1 truncate font-display text-[17px] font-extrabold">
        {`${s.name} · ${n} ${n === 1 ? "day" : "days"}`}
      </span>
      {s.status === "past" ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-teal-text">
          <Check aria-hidden className="size-3.5" />
          Done
        </span>
      ) : (
        <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums">
          {formatDateRangeCompact(s.arriveDate, s.departDate)}
        </span>
      )}
    </>
  );
}

function OpenStop({ s }: { s: DayByDayStop }) {
  return (
    <>
      {/* pr-28 keeps the range clear of StopBlock's absolutely placed Hide button. */}
      <div
        className={cn(
          "flex items-center gap-3 border-b-2 border-border px-4 py-3 pr-28",
          HUE_CLASSES[stopHue(s.sortOrder)].fill,
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-xs font-extrabold">
          {s.number}
        </span>
        <h3 className="min-w-0 flex-1 truncate font-display text-[22px] font-extrabold">{s.name}</h3>
        <span className="hidden shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums sm:inline">
          {formatDayLabel(s.arriveDate)} – {formatDayLabel(s.departDate)} · {formatNights(s.nights)}
        </span>
      </div>
      <ol>
        {s.days.map((d) => (
          <li
            key={d.dateISO}
            data-testid="share-day"
            aria-current={d.isToday ? "date" : undefined}
            className={cn(
              "grid gap-1 border-b-2 border-muted px-4 py-3 last:border-b-0 lg:grid-cols-[110px_minmax(0,1fr)] lg:gap-4",
              d.isToday && "bg-sun/15",
            )}
          >
            <div>
              <p className="text-base font-extrabold">{formatDayLabel(d.dateISO)}</p>
              {d.isToday && (
                <span className="mt-1 inline-flex shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-coral px-2 py-px text-[10px] font-extrabold uppercase tracking-[0.08em] text-on-accent">
                  Today
                </span>
              )}
            </div>
            <div>
              {d.title && <p className="font-display text-[17px] font-extrabold">{d.title}</p>}
              {d.rows.length ? (
                d.rows.map((r) => <ShareRow key={r.key} row={r} />)
              ) : (
                <p className="text-sm font-medium text-muted-foreground">Free day</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

/** The leg to the next stop — label and times only, never the booking reference. */
function LegLine({ leg }: { leg: NonNullable<DayByDayStop["legAfter"]> }) {
  const Icon = MODE_ICONS[leg.mode] ?? ArrowRight;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm">
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="font-bold">{leg.label}</span>
      <span className="text-[13px] font-medium tabular-nums text-muted-foreground">{leg.line}</span>
    </div>
  );
}
