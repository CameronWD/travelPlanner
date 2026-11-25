import { Check, House } from "lucide-react";
import { cn } from "@/lib/cn";
import { HUE_CLASSES } from "@/lib/hues";
import { stopDotClass, stopHue } from "@/lib/stop-colours";
import { formatDateRangeCompact, formatDayLabel, formatNights } from "@/lib/dates";
import type { StopStatus } from "@/lib/share/view";
import { ShareRows, type ShareRowModel } from "./share-rows";
import type { ShareLeg } from "./share-leg";
import { ShareTravelRow } from "./share-travel-row";
import { DayByDayProvider, StopBlock, StopIndex, StopPicker } from "./day-by-day-client";

interface DayByDayDay {
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
  country?: string | null;
  /** The closed card's line under the name, built on the server from this link's switches. */
  summary: string | null;
  status: StopStatus;
  days: DayByDayDay[];
  /** Transport from this stop to the next; null when includeTransport is off or none. */
  legAfter: ShareLeg | null;
}

/** A Stop with no dates yet: listed at the end, plain, with nothing to open. */
export interface RoughStop {
  id: string;
  name: string;
  country: string | null;
  nights: number | null;
}

/**
 * SHARE.md §7 — The route. Server-rendered; only the fold / picker state is
 * client-side, and the client pieces receive view models, never rows.
 * `initialOpenId` is computed on the server (current stop during, first
 * before, none after) so the first client render matches.
 */
export function DayByDay({
  stops,
  initialOpenId,
  homeOut = null,
  homeBack = null,
  homeName = null,
  roughStops = [],
}: {
  stops: DayByDayStop[];
  initialOpenId: string | null;
  homeOut?: ShareLeg | null;
  homeBack?: ShareLeg | null;
  /** The Home base's name, only when the page already shows it on the map; no name, no Home card. */
  homeName?: string | null;
  roughStops?: RoughStop[];
}) {
  return (
    <section data-share-section-inner="days" aria-labelledby="route-heading">
      <DayByDayProvider initialOpenId={initialOpenId}>
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className="lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="route-heading"
                className="font-display text-2xl font-extrabold tracking-[-0.03em] lg:text-[28px]"
              >
                The route
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
          <ol className="mt-3 flex flex-col lg:mt-0">
            {homeOut && (
              <>
                {homeName && (
                  <li>
                    <HomeCard name={homeName} />
                  </li>
                )}
                <li>
                  <ShareTravelRow {...homeOut} />
                </li>
              </>
            )}
            {stops.map((s, i) => (
              <li
                key={s.id}
                id={`share-stop-${s.id}`}
                data-share-stop={s.id}
                // The gap between Stops lives here, not on the list, so a leg's connector runs unbroken from card to card.
                className={cn("relative scroll-mt-6", !s.legAfter && i < stops.length - 1 && "mb-3")}
              >
                <StopBlock
                  stopId={s.id}
                  name={s.name}
                  dashed={s.status === "past"}
                  folded={<FoldedStop s={s} />}
                  open={<OpenStop s={s} />}
                />
                {s.legAfter && <ShareTravelRow {...s.legAfter} />}
              </li>
            ))}
            {homeBack && (
              <>
                <li>
                  <ShareTravelRow {...homeBack} />
                </li>
                {homeName && (
                  <li>
                    <HomeCard name={homeName} />
                  </li>
                )}
              </>
            )}
            {roughStops.map((r) => (
              <li key={r.id} data-share-rough={r.id} className="mt-3">
                <RoughCard stop={r} />
              </li>
            ))}
          </ol>
        </div>
      </DayByDayProvider>
    </section>
  );
}

// The leg's connector (centre x=32) meets this card's edge: the house sits on the same axis,
// 2px border + 22px padding puts its 16px box at 24..40.
function HomeCard({ name }: { name: string }) {
  return (
    <div data-share-home className="flex h-11 items-center gap-2.5 rounded-[14px] border-2 border-dashed border-border bg-background pl-[22px] pr-3.5">
      <House aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate text-sm font-bold">{name}</span>
      <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">Home</span>
    </div>
  );
}

function RoughCard({ stop }: { stop: RoughStop }) {
  const sub = [stop.country, stop.nights != null ? formatNights(stop.nights) : null].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[18px] border-2 border-border bg-card px-4 py-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <p className="break-words font-display text-[17px] font-extrabold leading-tight">{stop.name}</p>
        {sub && <p className="text-[13px] font-semibold text-muted-foreground">{sub}</p>}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[13px] font-bold">Dates to come</span>
    </div>
  );
}

// Below sm the StopBlock grid is [circle][name][Show] over a summary row and a dates-and-chip row
// that start under the name; from sm up the same children sit in one flex row.
function FoldedStop({ s }: { s: DayByDayStop }) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border text-xs font-extrabold text-on-accent",
          HUE_CLASSES[stopHue(s.sortOrder)].fill,
        )}
      >
        {s.number}
      </span>
      <span className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
        <span className="min-w-0 overflow-hidden text-ellipsis font-display text-[17px] font-extrabold leading-tight">{s.name}</span>
        {s.summary && (
          <span data-stop-summary className="col-span-2 col-start-2 line-clamp-2 min-w-0 text-[13px] font-semibold text-muted-foreground sm:col-auto sm:truncate">
            {s.summary}
          </span>
        )}
      </span>
      <span className="col-span-2 col-start-2 flex items-center gap-2 sm:col-auto sm:shrink-0">
        {s.status === "past" ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold text-teal-text">
            <Check aria-hidden className="size-3.5" />
            Done
          </span>
        ) : (
          <span className="whitespace-nowrap text-[13px] font-bold tabular-nums">{formatDateRangeCompact(s.arriveDate, s.departDate)}</span>
        )}
        {s.nights > 0 && (
          <span
            className={cn(
              "whitespace-nowrap rounded-full border-2 border-border px-2 text-xs font-extrabold tabular-nums text-on-accent",
              HUE_CLASSES[stopHue(s.sortOrder)].fill,
            )}
          >
            {`${s.nights}n`}
          </span>
        )}
      </span>
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
        <div className="flex min-w-0 flex-1 flex-col sm:contents">
          <h3 className="break-words font-display text-[22px] font-extrabold sm:min-w-0 sm:flex-1 sm:truncate">{s.name}</h3>
          <span className="text-[13px] font-semibold tabular-nums text-muted-foreground sm:shrink-0 sm:whitespace-nowrap sm:font-bold sm:text-foreground">
            {formatDayLabel(s.arriveDate)} – {formatDayLabel(s.departDate)} · {formatNights(s.nights)}
            {s.country ? ` · ${s.country}` : ""}
          </span>
        </div>
      </div>
      <ol>
        {s.days.map((d) => (
          <li
            key={d.dateISO}
            data-testid="share-day"
            aria-current={d.isToday ? "date" : undefined}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)] gap-1 border-b-2 border-muted px-4 py-3 last:border-b-0 lg:grid-cols-[110px_minmax(0,1fr)] lg:gap-4",
              d.isToday && "bg-sun/15",
            )}
          >
            <div className="min-w-0">
              <p className="break-words text-base font-extrabold">{formatDayLabel(d.dateISO)}</p>
              {d.isToday && (
                <span className="mt-1 inline-flex shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-coral px-2 py-px text-[10px] font-extrabold uppercase tracking-[0.08em] text-on-accent">
                  Today
                </span>
              )}
            </div>
            <div className="min-w-0">
              {d.title && <p className="break-words font-display text-[17px] font-extrabold">{d.title}</p>}
              {d.rows.length ? (
                <ShareRows rows={d.rows} />
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
