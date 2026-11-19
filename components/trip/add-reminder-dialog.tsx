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
import { useDeleteWithConfirm } from "@/components/ui/use-delete-with-confirm";
import { addReminder, deleteReminder, updateReminder } from "@/server/actions/reminders";
import { checkReminderInput } from "@/lib/reminder-input";
import type { ReminderAbout } from "@/lib/reminder-about";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


interface DialogBase {
  defaultDate?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export type EditableReminder = { id: string; title: string; date: string; notes: string | null };

export type AddReminderDialogProps = DialogBase &
  (
    | {
        /** The trip this reminder belongs to. */
        tripId: string;
        /**
         * What this Reminder is about — the Stop, thing to do or Transport leg whose
         * card opened the dialog (spec F8). Fixed and hidden, never a picker: the
         * Reminders card's add form is where a Traveller picks.
         */
        about: ReminderAbout;
        reminder?: undefined;
      }
    | {
        /** Edit mode: title, date and notes are changed; what it is about stays as it is. */
        reminder: EditableReminder;
        tripId?: undefined;
        about?: undefined;
      }
  );

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
  reminder,
  defaultDate,
  open,
  onOpenChange,
  onSaved,
}: AddReminderDialogProps) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={reminder ? "Edit reminder" : "Add a Reminder"}>
      <AddReminderForm
        tripId={tripId}
        about={about}
        reminder={reminder}
        defaultDate={defaultDate}
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
  reminder,
  defaultDate,
  onClose,
  onSaved,
}: {
  tripId?: string;
  about?: ReminderAbout;
  reminder?: EditableReminder;
  defaultDate?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [title, setTitle] = React.useState(reminder?.title ?? "");
  const [date, setDate] = React.useState(reminder?.date ?? defaultDate ?? "");
  const [notes, setNotes] = React.useState(reminder?.notes ?? "");

  const { requestDelete, isPending: isDeleting, dialog: deleteDialog } = useDeleteWithConfirm({
    action: (...[id]: [string, string]) => deleteReminder(id),
    buildConfirm: (_id, title) => ({
      title: "Delete this reminder?",
      description: `"${title}" will be removed.`,
      confirmLabel: "Delete",
      destructive: true,
    }),
    onDeleted: onClose,
  });

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
      if (reminder) return updateReminder(reminder.id, { ...checked.data, notes: checked.data.notes ?? null });
      return addReminder(tripId!, { ...checked.data, ...about! });
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
        {reminder && (
          <Button
            variant="outline"
            type="button"
            className="text-destructive hover:bg-destructive/10 sm:mr-auto"
            disabled={isPending || isDeleting}
            onClick={() => requestDelete(reminder.id, reminder.title)}
          >
            Delete
          </Button>
        )}
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending} disabled={isDeleting}>
          {reminder ? "Save Reminder" : "Add Reminder"}
        </Button>
      </DialogFooter>
      {deleteDialog}
    </form>
  );
}
