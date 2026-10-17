"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { DialogFooter, DialogClose } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { formError } from "@/components/ui/action-failure";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { addReminder } from "@/server/actions/reminders";
import { checkReminderInput } from "@/lib/reminder-input";
import type { ReminderAbout } from "@/lib/reminder-about";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


export interface AddReminderDialogProps {
  /** The trip this reminder belongs to. */
  tripId: string;
  /**
   * What this Reminder is about — the Stop, thing to do or Transport leg whose
   * card opened the dialog (spec F8). Fixed and hidden, never a picker: the
   * Reminders card's add form is where a Traveller picks.
   */
  about: ReminderAbout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

/**
 * "Add a reminder", opened from a Stop card's overflow menu or an Item's or
 * Transport leg's edit dialog. A thin
 * FormDialog wrapper, matching the shape of every other entity dialog
 * (AccommodationFormDialog, TransportFormDialog, ItemFormDialog).
 */
export function AddReminderDialog({
  tripId,
  about,
  open,
  onOpenChange,
  onSaved,
}: AddReminderDialogProps) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add a Reminder">
      <AddReminderForm
        tripId={tripId}
        about={about}
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
  about,
  onClose,
  onSaved,
}: {
  tripId: string;
  about: ReminderAbout;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: async () => {
      // Client-side gate before the round trip: an empty date is caught here
      // rather than by addReminder, which is the "does not call the action"
      // half of the contract (the field error text is the same either way —
      // checkReminderInput mirrors reminderSchema's rules and messages
      // (lib/reminder-input.test.ts)).
      //
      // `about` is the fixed value this dialog was opened with (the Stop's,
      // thing to do's or leg's own id), never user input, so it isn't
      // re-validated here — it's merged straight into the call. Blank notes
      // are left out rather than sent empty.
      const checked = checkReminderInput({ title, date, ...(notes.trim() ? { notes } : {}) });
      if (!checked.success) return checked;
      return addReminder(tripId, { ...checked.data, ...about });
    },
    onClose,
    onSaved,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Reminder title" required error={errors.title?.[0]}>
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
        error={errors.date?.[0]}
        disabled={isPending}
      />

      <Field label="Notes" error={errors.notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to remember with it (optional)"
          disabled={isPending}
        />
      </Field>

      <FormError>{formError(errors)}</FormError>

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
