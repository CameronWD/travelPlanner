"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea, submitOnEnter } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { DIALOG_DESTRUCTIVE_CLASS, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { formError } from "@/components/ui/action-failure";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { useDeleteWithConfirm } from "@/components/ui/use-delete-with-confirm";
import { addReminder, deleteReminder, updateReminder } from "@/server/actions/reminders";
import { checkReminderInput } from "@/lib/reminder-input";
import { aboutFromPick, aboutPickValue, type ReminderAbout, type ReminderAboutOptions } from "@/lib/reminder-about";
import { useFieldControl } from "@/components/ui/field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


interface DialogBase {
  defaultDate?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function hasAbout(a: ReminderAboutOptions | undefined): a is ReminderAboutOptions {
  return !!a && a.stops.length + a.items.length + a.transports.length > 0;
}

export function AboutSelect({
  about,
  value,
  onChange,
  disabled,
}: {
  about: ReminderAboutOptions;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="About"
      className="flex h-12 w-full rounded-md border-2 border-input bg-card px-4 text-base font-semibold text-foreground sm:text-[15px]"
    >
      <option value="">The whole trip</option>
      {about.stops.length > 0 && (
        <optgroup label="Stops">
          {about.stops.map((s) => <option key={s.id} value={aboutPickValue({ stopId: s.id })}>{s.name}</option>)}
        </optgroup>
      )}
      {about.items.length > 0 && (
        <optgroup label="Things to do">
          {about.items.map((i) => <option key={i.id} value={aboutPickValue({ itemId: i.id })}>{i.title}</option>)}
        </optgroup>
      )}
      {about.transports.length > 0 && (
        <optgroup label="Transport">
          {about.transports.map((t) => <option key={t.id} value={aboutPickValue({ transportId: t.id })}>{t.label}</option>)}
        </optgroup>
      )}
    </select>
  );
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
        about?: ReminderAbout;
        /** Set instead of `about` when opened from the Reminders card: the dialog shows the About picker. */
        aboutChoices?: ReminderAboutOptions;
        reminder?: undefined;
      }
    | {
        /** Edit mode: title, date and notes are changed; what it is about stays as it is. */
        reminder: EditableReminder;
        tripId?: undefined;
        about?: undefined;
        aboutChoices?: undefined;
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
  aboutChoices,
  reminder,
  defaultDate,
  open,
  onOpenChange,
  onSaved,
}: AddReminderDialogProps) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={reminder ? "Edit Reminder" : about ? "Add a Reminder" : "Add Reminder"}>
      <AddReminderForm
        tripId={tripId}
        about={about}
        aboutChoices={aboutChoices}
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
  aboutChoices,
  reminder,
  defaultDate,
  onClose,
  onSaved,
}: {
  tripId?: string;
  about?: ReminderAbout;
  aboutChoices?: ReminderAboutOptions;
  reminder?: EditableReminder;
  defaultDate?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [title, setTitle] = React.useState(reminder?.title ?? "");
  const [date, setDate] = React.useState(reminder?.date ?? defaultDate ?? "");
  const [notes, setNotes] = React.useState(reminder?.notes ?? "");
  const [pick, setPick] = React.useState("");

  const { requestDelete, isPending: isDeleting, dialog: deleteDialog } = useDeleteWithConfirm({
    action: (...[id]: [string, string]) => deleteReminder(id),
    buildConfirm: (_id, title) => ({
      title: "Delete this reminder?",
      description: `“${title}” will be removed.`,
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
      return addReminder(tripId!, { ...checked.data, ...(about ?? aboutFromPick(pick)) });
    },
    onClose,
    onSaved,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Reminder title" required error={errors.title?.[0]}>
        <Textarea
          autoGrow
          rows={1}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={submitOnEnter}
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

      {hasAbout(aboutChoices) && (
        <Field label="About">
          <AboutSelect about={aboutChoices} value={pick} onChange={setPick} disabled={isPending} />
        </Field>
      )}

      <FormError>{formError(errors)}</FormError>

      <DialogFooter>
        {reminder && (
          <Button
            variant="outline"
            type="button"
            className={DIALOG_DESTRUCTIVE_CLASS}
            disabled={isPending || isDeleting}
            onClick={() => requestDelete(reminder.id, reminder.title)}
          >
            <Trash2 aria-hidden="true" />
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
