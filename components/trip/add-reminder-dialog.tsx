"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { DialogFooter, DialogClose } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { addReminder } from "@/server/actions/reminders";
import { reminderSchema } from "@/lib/validations/reminder";
import { validationResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormErrors {
  title?: string[];
  date?: string[];
  stopId?: string[];
  _form?: string[];
}

export interface AddReminderDialogProps {
  /** The trip this reminder belongs to. */
  tripId: string;
  /**
   * The Stop this reminder is about. Opened from a Stop's own overflow menu
   * (Task 6/7), so the Stop is already known — carried through as a fixed,
   * hidden value rather than offered as a picker (that's the Home Reminders
   * card's job, for a Traveller who hasn't picked a Stop yet).
   */
  stopId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

/**
 * "Add a reminder", opened from a Stop card's overflow menu. A thin
 * FormDialog wrapper, matching the shape of every other entity dialog
 * (AccommodationFormDialog, TransportFormDialog, ItemFormDialog).
 */
export function AddReminderDialog({
  tripId,
  stopId,
  open,
  onOpenChange,
  onSaved,
}: AddReminderDialogProps) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add a Reminder">
      <AddReminderForm
        tripId={tripId}
        stopId={stopId}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

function AddReminderForm({
  tripId,
  stopId,
  onClose,
  onSaved,
}: {
  tripId: string;
  stopId: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState("");

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: async () => {
      // Client-side gate before the round trip: an empty date is caught here
      // rather than by addReminder, which is the "does not call the action"
      // half of the contract (the field error text is the same either way —
      // reminderSchema is the single source of truth for what's valid).
      //
      // `stopId` is deliberately left out of this parse: it's the fixed value
      // this dialog was opened with (the Stop's own id), never user input, so
      // it isn't re-validated here — it's merged straight into the call.
      const parsed = reminderSchema.omit({ stopId: true }).safeParse({ title, date });
      if (!parsed.success) {
        return validationResult(parsed.error);
      }
      return addReminder(tripId, { ...parsed.data, stopId });
    },
    onClose,
    onSaved,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Reminder title" required error={(errors as FormErrors).title?.[0]}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Reconfirm the tour"
          autoFocus
          disabled={isPending}
        />
      </Field>

      <DateField
        label="Date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        error={(errors as FormErrors).date?.[0]}
        disabled={isPending}
      />

      <FormError>{(errors as FormErrors)._form?.[0]}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          Add Reminder
        </Button>
      </DialogFooter>
    </form>
  );
}
