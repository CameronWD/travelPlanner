"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { scheduleItem } from "@/server/actions/items";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import type { ActionResult } from "@/lib/action-result";
import { formatDayLabel, formatDayRange } from "@/lib/dates";
import { dayChipLabel, type ScheduleDayOptions } from "@/lib/schedule-day-options";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormErrors {
  date?: string[];
  startTime?: string[];
  endTime?: string[];
  _form?: string[];
}

export interface ScheduleItemDialogProps {
  itemId: string;
  itemTitle: string;
  /** Default date to pre-fill — typically trip start or first stop date. */
  defaultDate?: string;
  /** When set, the scheduled copy is placed into this fork plan rather than the real plan. */
  forkId?: string | null;
  /**
   * Wishlist only (spec 2026-10-05 §E): the days to offer as chips, from
   * `lib/schedule-day-options`. Absent (the Calendar) — or with no stays and
   * no rough Stop — the dialog is the plain date field.
   */
  dayOptions?: ScheduleDayOptions;
  /** Wishlist only: "Add to {Stop}'s things to do" when the nearest Stop is rough (ADR 0022). */
  onAddToThingsToDo?: (stopId: string) => Promise<ActionResult>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function ScheduleItemDialog({
  itemId,
  itemTitle,
  defaultDate,
  forkId,
  dayOptions,
  onAddToThingsToDo,
  open,
  onOpenChange,
  onSaved,
}: ScheduleItemDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule Item"
      recordId={itemId}
    >
      <p className="text-sm text-muted-foreground">
        Pick a date for{" "}
        <span className="font-medium text-foreground">{itemTitle}</span>.
      </p>
      <ScheduleForm
        itemId={itemId}
        defaultDate={defaultDate}
        forkId={forkId}
        dayOptions={dayOptions}
        onAddToThingsToDo={onAddToThingsToDo}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

interface ScheduleFormProps {
  itemId: string;
  defaultDate?: string;
  forkId?: string | null;
  dayOptions?: ScheduleDayOptions;
  onAddToThingsToDo?: (stopId: string) => Promise<ActionResult>;
  onClose: () => void;
  onSaved?: () => void;
}

const LINK_CLASS = "tap-target self-start text-[13px] font-bold text-coral-text";

function ScheduleForm({
  itemId,
  defaultDate,
  forkId,
  dayOptions,
  onAddToThingsToDo,
  onClose,
  onSaved,
}: ScheduleFormProps) {
  const roughStop = dayOptions?.roughStop ?? null;
  const offersDays = Boolean(dayOptions && (dayOptions.stays.length > 0 || roughStop));
  const [mode, setMode] = React.useState<"days" | "date">(offersDays ? "days" : "date");
  // Chips start unpicked: a pre-filled default that isn't one of the offered
  // days would read as a choice the Traveller never made.
  const [date, setDate] = React.useState(offersDays ? "" : (defaultDate ?? ""));
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [isAdding, startAdding] = React.useTransition();

  const timesDisabled = !date;

  function changeDate(next: string) {
    setDate(next);
    if (!next) {
      setStartTime("");
      setEndTime("");
    }
  }

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: () => {
      if (!date) {
        return Promise.resolve({ success: false as const, errors: { date: ["Please pick a date"] } });
      }
      return scheduleItem(
        itemId,
        {
          date,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
        },
        forkId ?? undefined,
      );
    },
    onClose,
    onSaved,
  });

  function addToThingsToDo(stopId: string) {
    if (!onAddToThingsToDo) return;
    setAddError(null);
    startAdding(async () => {
      const result = await onAddToThingsToDo(stopId);
      if (result.success) {
        onSaved?.();
        onClose();
        return;
      }
      setAddError(Object.values(result.errors)[0]?.[0] ?? "Couldn't add it — try again.");
    });
  }

  const busy = isPending || isAdding;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "days" && dayOptions ? (
        <div className="flex flex-col gap-3">
          {roughStop && onAddToThingsToDo ? (
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-sm text-muted-foreground">{roughStop.name} has no dates yet.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={isAdding}
                disabled={busy}
                onClick={() => addToThingsToDo(roughStop.id)}
              >
                Add to {roughStop.name}{"'s"} things to do
              </Button>
            </div>
          ) : null}

          {!dayOptions.near && !roughStop && dayOptions.stays.length > 0 ? (
            <p className="text-sm text-muted-foreground">Not near any Stop — pick any day</p>
          ) : null}

          {dayOptions.stays.map((stay) => (
            <div
              key={stay.stopId}
              role="group"
              aria-label={`${stay.stopName}, ${formatDayRange(stay.days[0], stay.days[stay.days.length - 1])}`}
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="mr-1 text-[13px] font-extrabold text-foreground">{stay.stopName}</span>
              {stay.days.map((d) => (
                <Chip
                  key={d}
                  size="l"
                  tone={date === d ? "coral" : "white"}
                  selected={date === d}
                  aria-label={formatDayLabel(d)}
                  disabled={busy}
                  onClick={() => changeDate(d)}
                  className="tap-target"
                >
                  {dayChipLabel(d)}
                </Chip>
              ))}
            </div>
          ))}

          <FormError>{(errors as FormErrors).date?.[0]}</FormError>
          <FormError>{addError}</FormError>

          <button type="button" className={LINK_CLASS} onClick={() => setMode("date")}>
            Pick another date
          </button>
        </div>
      ) : (
        <>
          <DateField
            label="Date"
            required
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            error={(errors as FormErrors).date?.[0]}
            disabled={busy}
            autoFocus={!offersDays}
          />
          {offersDays && dayOptions ? (
            <button type="button" className={LINK_CLASS} onClick={() => setMode("days")}>
              {dayOptions.near ? "Back to the nearby days" : "Back to the trip days"}
            </button>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Start time"
          error={(errors as FormErrors).startTime?.[0]}
          description={timesDisabled ? "Set a date first" : undefined}
        >
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={busy || timesDisabled}
          />
        </Field>
        <Field
          label="End time"
          error={(errors as FormErrors).endTime?.[0]}
          description={timesDisabled ? "Set a date first" : !startTime ? "Set a start time first" : undefined}
        >
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={busy || timesDisabled || !startTime}
          />
        </Field>
      </div>

      <FormError>{(errors as FormErrors)._form?.[0]}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={busy}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          Schedule
        </Button>
      </DialogFooter>
    </form>
  );
}
