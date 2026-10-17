"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { MONDAY_FIRST, WEEKDAY_LONG, openingHoursSummary } from "@/lib/opening-hours-display";
import type { HoursSpan, OpeningHours, OpeningSeason, Weekday, WeekHours } from "@/lib/opening-hours";

const FIRST_SPAN: HoursSpan = ["09:00", "17:00"];
const SECOND_SPAN: HoursSpan = ["18:00", "21:00"];

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
  const setDay = (d: Weekday, spans: HoursSpan[]) => onChange({ ...week, [d]: spans });
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      {MONDAY_FIRST.map((d) => {
        const name = WEEKDAY_LONG[d];
        const spans = week[d] ?? [];
        const closed = spans.length === 0;
        const setSpan = (i: number, part: 0 | 1, time: string) =>
          setDay(
            d,
            spans.map((s, j) => (j === i ? ((part === 0 ? [time, s[1]] : [s[0], time]) as HoursSpan) : s)),
          );
        return (
          <div key={d} data-testid={`hours-row-${d}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-9 text-[13px] font-bold">{name.slice(0, 3)}</span>
            <Checkbox
              label="Closed"
              strike={false}
              aria-label={`${name} closed`}
              checked={closed}
              disabled={disabled}
              onChange={(e) => setDay(d, e.target.checked ? [] : [[...FIRST_SPAN]])}
            />
            {!closed &&
              spans.map((span, i) => (
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
                  <Input
                    type="time"
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
                      onClick={() => setDay(d, [spans[0]!])}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </span>
              ))}
            {!closed && spans.length === 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Add a second opening on ${name}`}
                disabled={disabled}
                onClick={() => setDay(d, [spans[0]!, [...SECOND_SPAN]])}
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
        onClick={() =>
          onChange(
            Object.fromEntries(MONDAY_FIRST.map((d) => [d, (week.mon ?? []).map((s) => [...s] as HoursSpan)])) as unknown as WeekHours,
          )
        }
      >
        Same as Monday every day
      </Button>
    </div>
  );
}

/**
 * CONTEXT.md "Opening hours" in the Item dialog: collapsed to a one-line
 * summary, opening to the usual week (each day closed or one or two
 * openings), seasons that replace it for a recurring MM-DD..MM-DD range, and
 * closed dates. Read in the Item's Stop's local time. Controlled: `value`
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
  return (
    <details className="rounded-xl border-2 border-border-soft px-3 py-2" open={error ? true : undefined}>
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
              {value.closed.map((date, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="date"
                    aria-label={`Closed date ${i + 1}`}
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
