"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
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
  open,
  onOpenChange,
  onSaved,
}: ScheduleItemDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule item"
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
  onClose: () => void;
  onSaved?: () => void;
}

function ScheduleForm({
  itemId,
  defaultDate,
  forkId,
  onClose,
  onSaved,
}: ScheduleFormProps) {
  const [date, setDate] = React.useState(defaultDate ?? "");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");

  const timesDisabled = !date;

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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DateField
        label="Date"
        required
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          if (!e.target.value) {
            setStartTime("");
            setEndTime("");
          }
        }}
        error={(errors as FormErrors).date?.[0]}
        disabled={isPending}
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Start time"
          error={(errors as FormErrors).startTime?.[0]}
          description={timesDisabled ? "Set a date first" : undefined}
        >
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={isPending || timesDisabled}
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
            disabled={isPending || timesDisabled || !startTime}
          />
        </Field>
      </div>

      <FormError>{(errors as FormErrors)._form?.[0]}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
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
