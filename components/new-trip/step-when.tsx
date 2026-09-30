"use client";

import * as React from "react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { RangeCalendar } from "@/components/ui/range-calendar";
import { addDays, formatMonthYear } from "@/lib/dates";
import { roughMonthChip, roughMonthOptions } from "@/lib/rough-month";
import { whenLine, type DateMode } from "@/lib/new-trip/draft";
import { StepActions, ContinueButton } from "./step-actions";
import { CountdownStrip } from "./trip-preview";
import type { StepProps } from "./step-props";
import { cn } from "@/lib/cn";

const MODE_ITEM = "h-10 px-4 text-[15px] font-bold";

export function StepWhen({ draft, dispatch, errors, attempt, formRef, onNext, onBack, today, pending }: StepProps) {
  const headingId = React.useId();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const exact = draft.past || draft.dateMode === "exact";
  const complete = exact && draft.startDate && draft.endDate ? { start: draft.startDate, end: draft.endDate } : null;

  return (
    <form ref={formRef} aria-labelledby={headingId} noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col">
      <fieldset disabled={pending} className="contents">
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-display text-[44px] font-extrabold leading-[.95] tracking-[-0.04em] outline-none md:text-[64px]">
          {draft.past ? "When did you go?" : "When are you going?"}
        </h2>

        {draft.past ? null : (
          <Segmented
            type="single"
            tone="ink"
            aria-label="When"
            value={draft.dateMode}
            onValueChange={(v) => v && dispatch({ type: "set-mode", mode: v as DateMode })}
            className="mt-6 grid w-full grid-cols-3 border-border md:inline-flex md:w-auto md:self-start"
          >
            <SegmentedItem value="exact" aria-label="Exact dates" className={MODE_ITEM}>
              <span className="md:hidden">Dates</span>
              <span className="hidden md:inline">Exact dates</span>
            </SegmentedItem>
            <SegmentedItem value="rough" aria-label="Roughly" className={MODE_ITEM}>Roughly</SegmentedItem>
            <SegmentedItem value="none" aria-label="Not sure yet" className={MODE_ITEM}>
              <span className="md:hidden">Not sure</span>
              <span className="hidden md:inline">Not sure yet</span>
            </SegmentedItem>
          </Segmented>
        )}

        <div className="mt-6">
          {exact ? (
            <>
              <RangeCalendar
                months={2}
                start={draft.startDate}
                end={draft.endDate}
                onChange={(r) => dispatch({ type: "set-range", start: r.start, end: r.end })}
                {...(draft.past ? { disableAfter: today } : { disableBefore: addDays(today, 1) })}
              />
              {complete && !draft.past ? <CountdownStrip startDate={complete.start} endDate={complete.end} today={today} /> : null}
            </>
          ) : draft.dateMode === "rough" ? (
            <ul aria-label="Months" className="grid grid-cols-3 gap-2.5 md:grid-cols-4">
              {roughMonthOptions(today).map((ym) => {
                const on = draft.roughMonth === ym;
                return (
                  <li key={ym}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={formatMonthYear(`${ym}-01`)}
                      onClick={() => dispatch({ type: "set-rough-month", ym: on ? undefined : ym })}
                      className={cn("pressable h-12 w-full whitespace-nowrap rounded-full border-2 border-border text-[15px] font-bold", on ? "bg-foreground text-background" : "bg-card text-foreground")}
                    >
                      {roughMonthChip(ym, today)}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[17px] font-semibold text-foreground/80">No problem. Add dates when you&apos;ve picked your stops.</p>
          )}
          {errors.dates ? <p key={attempt} role="alert" className="mt-3 text-[15px] font-bold text-coral-text">{errors.dates}</p> : null}
        </div>

        <StepActions showBack onBack={onBack} primary={<ContinueButton />} hint={complete ? whenLine(draft, today) : null} />
      </fieldset>
    </form>
  );
}
