"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { scheduleItem } from "@/server/actions/items";

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
  open,
  onOpenChange,
  onSaved,
}: ScheduleItemDialogProps) {
  const formKey = open ? `schedule-${itemId}-${String(open)}` : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule idea</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pick a date for{" "}
          <span className="font-medium text-foreground">{itemTitle}</span>.
        </p>
        <ScheduleForm
          key={formKey}
          itemId={itemId}
          defaultDate={defaultDate}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

interface ScheduleFormProps {
  itemId: string;
  defaultDate?: string;
  onClose: () => void;
  onSaved?: () => void;
}

function ScheduleForm({
  itemId,
  defaultDate,
  onClose,
  onSaved,
}: ScheduleFormProps) {
  const [date, setDate] = React.useState(defaultDate ?? "");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isPending, startTransition] = React.useTransition();

  const timesDisabled = !date;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    if (!date) {
      setErrors({ date: ["Please pick a date"] });
      return;
    }

    startTransition(async () => {
      const result = await scheduleItem(itemId, {
        date,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
      });

      if (!result.success) {
        setErrors(result.errors as FormErrors);
        return;
      }
      onClose();
      onSaved?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        error={errors.date?.[0]}
        disabled={isPending}
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Start time"
          error={errors.startTime?.[0]}
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
          error={errors.endTime?.[0]}
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

      <FormError>{errors._form?.[0]}</FormError>

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
