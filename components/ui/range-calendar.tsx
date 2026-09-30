"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { daysBetween, formatLongDate, formatMonthYear, todayLocalISO } from "@/lib/dates";
import { addMonthKey, dayState, isDayDisabled, monthCells, nextRange, shiftDay, type DateRange, type DayState } from "@/lib/calendar-grid";
import { cn } from "@/lib/cn";

export interface RangeCalendarProps {
  start?: string;
  end?: string;
  onChange: (r: DateRange) => void;
  /** 2 = two months side by side from md; phones always see one. */
  months?: 1 | 2;
  /** Days strictly before this are disabled. */
  disableBefore?: string;
  /** Days strictly after this are disabled. */
  disableAfter?: string;
  className?: string;
}

const WEEKDAYS = [["M", "Monday"], ["T", "Tuesday"], ["W", "Wednesday"], ["T", "Thursday"], ["F", "Friday"], ["S", "Saturday"], ["S", "Sunday"]] as const;

// Where the band sits inside a cell: from the middle out on the ends, full width between.
const BAND: Record<DayState, string> = {
  none: "hidden",
  single: "hidden",
  start: "left-1/2 right-0",
  end: "left-0 right-1/2",
  in: "inset-x-0",
  preview: "inset-x-0",
};
const ENDPOINT = new Set<DayState>(["start", "end", "single"]);

function openingMonth(p: Pick<RangeCalendarProps, "start" | "disableBefore" | "disableAfter">, months: number): string {
  if (p.start) return p.start.slice(0, 7);
  if (p.disableAfter) return addMonthKey(p.disableAfter.slice(0, 7), -(months - 1));
  if (p.disableBefore) return p.disableBefore.slice(0, 7);
  return todayLocalISO().slice(0, 7);
}

export function RangeCalendar({ start, end, onChange, months = 1, disableBefore, disableAfter, className }: RangeCalendarProps) {
  const [first, setFirst] = React.useState(() => openingMonth({ start, disableBefore, disableAfter }, months));
  const [hover, setHover] = React.useState<string>();
  const [focusDay, setFocusDay] = React.useState<string | undefined>(start);
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Set only by a click, so a range that was already there on mount doesn't animate (MOTION N8).
  const [fill, setFill] = React.useState<{ key: number; start: string } | null>(null);
  const [pop, setPop] = React.useState<{ key: number; day: string } | null>(null);

  const visible = months === 2 ? [first, addMonthKey(first, 1)] : [first];
  const last = visible[visible.length - 1];
  const canPrev = !disableBefore || addMonthKey(first, -1) >= disableBefore.slice(0, 7);
  const canNext = !disableAfter || addMonthKey(last, 1) <= disableAfter.slice(0, 7);
  const enabledVisible = visible.flatMap(monthCells).filter((d): d is string => d !== null && !isDayDisabled(d, disableBefore, disableAfter));
  const tabDay = focusDay && enabledVisible.includes(focusDay) ? focusDay : enabledVisible[0];
  const range = { start, end };

  function pick(day: string) {
    if (isDayDisabled(day, disableBefore, disableAfter)) return;
    setFocusDay(day);
    setHover(undefined);
    const next = nextRange(range, day);
    setPop((p) => ({ key: (p?.key ?? 0) + 1, day }));
    if (next.start && next.end && next.end !== next.start) setFill((f) => ({ key: (f?.key ?? 0) + 1, start: next.start! }));
    else setFill(null);
    onChange(next);
  }

  function onDayKeyDown(e: React.KeyboardEvent, day: string) {
    const next = shiftDay(day, e.key);
    if (!next) return;
    e.preventDefault();
    if (isDayDisabled(next, disableBefore, disableAfter)) return;
    const m = next.slice(0, 7);
    if (m < first) setFirst(m);
    else if (m > last) setFirst(addMonthKey(m, -(months - 1)));
    setFocusDay(next);
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
  }

  return (
    <div ref={rootRef} className={cn("grid gap-4", months === 2 && "md:grid-cols-2", className)} onMouseLeave={() => setHover(undefined)}>
      {visible.map((ym, idx) => {
        const cells = monthCells(ym);
        const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
        const titleId = `rc-${ym}`;
        return (
          <div key={ym} data-month={ym} className={cn("rounded-[20px] border-2 border-border bg-card p-4 shadow-hard-2", idx === 1 && "hidden md:block")}>
            <div className="flex items-center gap-1">
              {idx === 0 ? (
                <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setFirst(addMonthKey(first, -1))} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </button>
              ) : null}
              <h3 id={titleId} className="flex-1 px-1 font-display text-lg font-extrabold">{formatMonthYear(`${ym}-01`)}</h3>
              {idx === visible.length - 1 ? (
                <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setFirst(addMonthKey(first, 1))} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <ChevronRight aria-hidden="true" className="size-5" />
                </button>
              ) : null}
            </div>
            <table role="grid" aria-labelledby={titleId} className="mt-2 w-full table-fixed border-collapse">
              <thead>
                <tr>
                  {WEEKDAYS.map(([initial, full], i) => (
                    <th key={i} scope="col" abbr={full} className="pb-1 text-[13px] font-bold text-muted-foreground">{initial}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, w) => (
                  <tr key={w}>
                    {week.map((d, i) => {
                      if (!d) return <td key={i} className="p-0" />;
                      const state = dayState(d, range, end ? undefined : hover);
                      const disabled = isDayDisabled(d, disableBefore, disableAfter);
                      const filling = fill && end && (state === "in" || state === "start" || state === "end");
                      const popping = pop?.day === d && ENDPOINT.has(state);
                      return (
                        <td key={d} className="p-0 py-0.5">
                          <button
                            type="button"
                            data-day={d}
                            data-state={state}
                            aria-label={formatLongDate(d)}
                            aria-pressed={state !== "none" && state !== "preview"}
                            disabled={disabled}
                            tabIndex={d === tabDay ? 0 : -1}
                            onClick={() => pick(d)}
                            onMouseEnter={() => start && !end && setHover(d)}
                            onKeyDown={(e) => onDayKeyDown(e, d)}
                            className={cn(
                              "relative grid h-9 w-full place-items-center text-[15px] font-bold tabular-nums md:h-[38px]",
                              "focus-visible:z-20 focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring",
                              disabled ? "cursor-not-allowed text-muted-foreground/50" : "cursor-pointer",
                            )}
                          >
                            <span
                              key={filling ? `band-${fill.key}` : "band"}
                              aria-hidden="true"
                              className={cn("absolute inset-y-0", BAND[state], end ? "bg-range" : "bg-range/60", filling && "tp-band-fill origin-left")}
                              // Day by day from the start, 12ms apart, capped at 240ms (MOTION N8).
                              style={filling ? { animationDelay: `${Math.min(daysBetween(fill.start, d) * 12, 240)}ms` } : undefined}
                            />
                            <span
                              key={popping ? `pop-${pop.key}` : "day"}
                              className={cn("relative z-10 grid size-9 place-items-center rounded-full md:size-[38px]", ENDPOINT.has(state) && "bg-foreground text-background", popping && "tp-pop")}
                            >
                              {Number(d.slice(8))}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
