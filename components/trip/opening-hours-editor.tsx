"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { cn } from "@/lib/cn";
import { MONDAY_FIRST, WEEKDAY_LONG, openingHoursSummary } from "@/lib/opening-hours-display";
import type { HoursSpan, OpeningHours, OpeningSeason, Weekday, WeekHours } from "@/lib/opening-hours";

const FIRST_SPAN: HoursSpan = ["09:00", "17:00"];
const SECOND_SPAN: HoursSpan = ["18:00", "21:00"];

/** A day's three states (CONTEXT.md "Opening hours"): absent = not known, [] = closed, spans = open. */
type DayState = "unset" | "closed" | "open";
function dayState(spans: HoursSpan[] | undefined): DayState {
  return spans === undefined ? "unset" : spans.length === 0 ? "closed" : "open";
}

/** Every day 09:00–17:00: a starting point to edit, not a guess at the place. */
export function defaultWeekly(): WeekHours {
  return Object.fromEntries(MONDAY_FIRST.map((d) => [d, [[...FIRST_SPAN]]])) as unknown as WeekHours;
}

function WeeklyGrid({
  week,
  onChange,
  label,
  disabled,
}: {
  week: WeekHours;
  onChange(next: WeekHours): void;
  label: string;
  disabled?: boolean;
}) {
  // Fix round 1 (controller ruling): three states, not two. An absent day
  // ("not known") must round-trip through an edit of another day, through
  // "Same as Monday", and must be reachable again after being set.
  const setDay = (d: Weekday, spans: HoursSpan[] | undefined) => {
    if (spans === undefined) {
      const next = { ...week };
      delete next[d];
      onChange(next);
    } else {
      onChange({ ...week, [d]: spans });
    }
  };
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      {MONDAY_FIRST.map((d) => {
        const name = WEEKDAY_LONG[d];
        const spans = week[d];
        const state = dayState(spans);
        const setSpan = (i: number, part: 0 | 1, time: string) =>
          setDay(
            d,
            (spans ?? []).map((s, j) => (j === i ? ((part === 0 ? [time, s[1]] : [s[0], time]) as HoursSpan) : s)),
          );
        return (
          <div key={d} data-testid={`hours-row-${d}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-9 text-[13px] font-bold">{name.slice(0, 3)}</span>
            <select
              aria-label={name}
              value={state}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value as DayState;
                setDay(d, v === "unset" ? undefined : v === "closed" ? [] : [[...FIRST_SPAN]]);
              }}
              className={cn(
                "h-9 rounded-md border-2 border-input bg-card px-2 text-[13px] font-semibold text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-45",
              )}
            >
              <option value="unset">Not set</option>
              <option value="closed">Closed</option>
              <option value="open">Open</option>
            </select>
            {state === "open" &&
              (spans ?? []).map((span, i) => (
                <span key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    className="w-[7.25rem]"
                    aria-label={`${name} ${i === 0 ? "opens" : "opens again"}`}
                    value={span[0]}
                    disabled={disabled}
                    onChange={(e) => setSpan(i, 0, e.target.value)}
                  />
                  <span aria-hidden="true">–</span>
                  {/* Text, not type="time": a close time may be "24:00" (midnight), which a native time input can't hold. */}
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:MM"
                    className="w-[7.25rem]"
                    aria-label={`${name} ${i === 0 ? "closes" : "closes again"}`}
                    value={span[1]}
                    disabled={disabled}
                    onChange={(e) => setSpan(i, 1, e.target.value)}
                  />
                  {i === 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove the second opening on ${name}`}
                      disabled={disabled}
                      onClick={() => setDay(d, [spans![0]!])}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </span>
              ))}
            {state === "open" && spans!.length === 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Add a second opening on ${name}`}
                disabled={disabled}
                onClick={() => setDay(d, [spans![0]!, [...SECOND_SPAN]])}
              >
                <Plus aria-hidden="true" /> Second opening
              </Button>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={() => {
          // Copies Monday's state verbatim — including "not known" (fix
          // round 1): an absent Monday makes every day absent, not closed.
          const monday = week.mon;
          const next: WeekHours = {};
          if (monday !== undefined) {
            for (const d of MONDAY_FIRST) next[d] = monday.map((s) => [...s] as HoursSpan);
          }
          onChange(next);
        }}
      >
        Same as Monday every day
      </Button>
    </div>
  );
}

/** "2027-12-25" or a recurring "12-25" (every year) — both are stored, so the editor must show either back. */
const CLOSED_DATE_HINT_ID = "opening-hours-closed-date-hint";

/**
 * CONTEXT.md "Opening hours" in the Item dialog: collapsed to a one-line
 * summary, opening to the usual week (each day not set, closed, or one or
 * two openings), seasons that replace it for a recurring MM-DD..MM-DD range,
 * and closed dates. Read in the Item's Stop's local time. Controlled: `value`
 * null = none.
 */
export function OpeningHoursEditor({
  value,
  onChange,
  disabled,
  error,
}: {
  value: OpeningHours | null;
  onChange(next: OpeningHours | null): void;
  disabled?: boolean;
  error?: string;
}) {
  // Fix round 1 (controller ruling): `open` is a controlled boolean, not
  // re-derived from `error` on every render — otherwise clearing the error
  // (a successful save) would force the <details> shut again even though
  // the Traveller had it open. Once open (by the Traveller, or because an
  // error arrived), it stays open. Adjusted during render (React's
  // recommended alternative to an effect for "respond to a prop change"),
  // not in a useEffect, so a fresh error never causes a cascading extra render.
  const [open, setOpen] = React.useState(Boolean(error));
  const [seenError, setSeenError] = React.useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error && !open) setOpen(true);
  }

  return (
    <details
      className="rounded-xl border-2 border-border-soft px-3 py-2"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="tap-target flex cursor-pointer flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold">Opening hours</span>
        <span className="text-xs font-semibold text-muted-foreground">{value ? openingHoursSummary(value) : "Not set"}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {value === null ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => onChange({ week: defaultWeekly(), seasons: [], closed: [] })}
          >
            Add opening hours
          </Button>
        ) : (
          <>
            <WeeklyGrid label="Usual hours" week={value.week} disabled={disabled} onChange={(week) => onChange({ ...value, week })} />

            <section className="flex flex-col gap-2">
              <h4 className="text-[13px] font-bold">Seasons</h4>
              <p className="text-xs text-muted-foreground">
                Dates with different hours, such as winter. They repeat every year (month and day only) and replace the usual hours.
              </p>
              {value.seasons.map((season, i) => {
                const setSeason = (next: OpeningSeason) =>
                  onChange({ ...value, seasons: value.seasons.map((s, j) => (j === i ? next : s)) });
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border-2 border-border-soft p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="MM-DD"
                        aria-label={`Season ${i + 1} from`}
                        value={season.from}
                        disabled={disabled}
                        onChange={(e) => setSeason({ ...season, from: e.target.value })}
                        className="w-20"
                      />
                      <span aria-hidden="true">to</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="MM-DD"
                        aria-label={`Season ${i + 1} to`}
                        value={season.to}
                        disabled={disabled}
                        onChange={(e) => setSeason({ ...season, to: e.target.value })}
                        className="w-20"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove season ${i + 1}`}
                        disabled={disabled}
                        onClick={() => onChange({ ...value, seasons: value.seasons.filter((_, j) => j !== i) })}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                    <WeeklyGrid
                      label={`Season ${i + 1} hours`}
                      week={season.week}
                      disabled={disabled}
                      onChange={(week) => setSeason({ ...season, week })}
                    />
                  </div>
                );
              })}
              <Button
                type="button"
                variant="dashed"
                size="sm"
                className="self-start"
                disabled={disabled}
                onClick={() => onChange({ ...value, seasons: [...value.seasons, { from: "", to: "", week: value.week }] })}
              >
                <Plus aria-hidden="true" /> Add a season
              </Button>
            </section>

            <section className="flex flex-col gap-2">
              <h4 className="text-[13px] font-bold">Closed dates</h4>
              {value.closed.length > 0 && (
                <p id={CLOSED_DATE_HINT_ID} className="text-xs text-muted-foreground">
                  2027-12-25 for one date, or 12-25 for every year.
                </p>
              )}
              {value.closed.map((date, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="2027-12-25 or 12-25"
                    aria-label={`Closed date ${i + 1}`}
                    aria-describedby={CLOSED_DATE_HINT_ID}
                    value={date}
                    disabled={disabled}
                    className="w-auto"
                    onChange={(e) => onChange({ ...value, closed: value.closed.map((d, j) => (j === i ? e.target.value : d)) })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove closed date ${i + 1}`}
                    disabled={disabled}
                    onClick={() => onChange({ ...value, closed: value.closed.filter((_, j) => j !== i) })}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="dashed"
                size="sm"
                className="self-start"
                disabled={disabled}
                onClick={() => onChange({ ...value, closed: [...value.closed, ""] })}
              >
                <Plus aria-hidden="true" /> Add a closed date
              </Button>
            </section>

            {value.source && <p className="text-xs text-muted-foreground">From {value.source}</p>}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-destructive"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              Remove opening hours
            </Button>
          </>
        )}
        {error && <FormError>{error}</FormError>}
      </div>
    </details>
  );
}
