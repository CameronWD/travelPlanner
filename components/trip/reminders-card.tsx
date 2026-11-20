"use client";

import { startTransition, useOptimistic, useState, useTransition } from "react";
import { Bell, ChevronRight, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { daysBetween, formatDayLabel } from "@/lib/dates";
import {
  addReminder,
  updateReminder,
  type ReminderItem,
} from "@/server/actions/reminders";
import { aboutFromPick, aboutPickValue, reminderAboutLabel, type ReminderAboutOptions } from "@/lib/reminder-about";
import { AddReminderDialog } from "@/components/trip/add-reminder-dialog";
import { ReminderNotes } from "@/components/trip/reminder-notes";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { failureMessage } from "@/components/ui/failure-message";
import { useUndoableAction } from "@/components/ui/use-undoable-action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemindersCardProps {
  tripId: string;
  reminders: ReminderItem[];
  /**
   * The trip's "today" as a YYYY-MM-DD string, computed on the server from the
   * trip's current timezone. The card never reads the machine clock: a
   * `new Date()` here would label a note by the *viewing device's* day, which
   * is the timezone bug class this codebase pins its tests against.
   */
  today: string;
  /**
   * What a new Reminder can be about (spec F8): the real plan's Stops, things
   * to do and Transport legs the viewer can see (readReminderAboutOptions).
   * Omitted hides the picker — a Reminder created here is then about the Trip
   * as a whole (Home's card).
   */
  about?: ReminderAboutOptions;
  /** The Trip's dismissed Reminders, each with Bring back (the Checklists card only); omitted shows none. */
  dismissed?: ReminderItem[];
}

// ---------------------------------------------------------------------------
// Relative + absolute label
// ---------------------------------------------------------------------------

/**
 * A Reminder carries a date and never a time (CONTEXT.md "Reminder"), so the
 * label is whole days only — no "in 3h", which would imply a firing moment
 * TEEPEE cannot honour.
 *
 * `relative` is null when the stored date cannot be read as a calendar date.
 * `Reminder.date` is a plain String column and `parseISODate` throws a
 * RangeError on anything that isn't YYYY-MM-DD; because this card now renders
 * on every phase of Home, one malformed legacy row would blank the entire
 * front door rather than a single section. Falling back to the raw stored
 * value keeps the note readable and the page standing.
 */
function formatWhen(
  date: string,
  today: string,
): { relative: string | null; absolute: string } {
  let days: number;
  try {
    days = daysBetween(today, date);
  } catch {
    return { relative: null, absolute: date };
  }

  // A Reminder already gone by (listed under "Earlier") gets no relative
  // label: "31 days ago" would be prose invented for a state nobody has
  // tested against reality. A null relative label falls back to just the
  // absolute date, which is always correct, rather than risking "in -31 days".
  if (days < 0) {
    return { relative: null, absolute: formatDayLabel(date) };
  }

  let relative: string;
  if (days === 0) {
    relative = "today";
  } else if (days === 1) {
    relative = "tomorrow";
  } else {
    relative = `in ${days} days`;
  }

  return { relative, absolute: formatDayLabel(date) };
}

// ---------------------------------------------------------------------------
// Add form (inline)
// ---------------------------------------------------------------------------

function hasAbout(a: ReminderAboutOptions | undefined): a is ReminderAboutOptions {
  return !!a && a.stops.length + a.items.length + a.transports.length > 0;
}

function AddReminderForm({
  tripId,
  about,
  onAdded,
}: {
  tripId: string;
  about?: ReminderAboutOptions;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setDate("");
    setNotes("");
    setPick("");
    setError(null);
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const result = await addReminder(tripId, {
          title,
          date,
          ...(notes.trim() ? { notes } : {}),
          ...aboutFromPick(pick),
        });
        if (result.success) {
          reset();
          onAdded();
        } else {
          const msg = Object.values(result.errors).flat()[0];
          setError(msg ?? "Couldn't add that reminder. Try again.");
        }
      } catch {
        setError(failureMessage("Couldn't add that reminder. Try again."));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Add Reminder"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-extrabold text-foreground underline-offset-2 hover:underline"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add Reminder
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-2">
      <Input
        placeholder="Reminder title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        aria-label="Reminder title"
        autoFocus
      />
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        aria-label="Reminder date"
      />
      <Textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="Reminder notes"
        rows={2}
      />
      {hasAbout(about) && (
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
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
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isPending}>
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Reminder row
// ---------------------------------------------------------------------------

function ReminderRow({
  reminder,
  today,
  onGotIt,
}: {
  reminder: ReminderItem;
  today: string;
  onGotIt: (reminder: ReminderItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { relative, absolute } = formatWhen(reminder.date, today);
  const about = reminderAboutLabel(reminder);

  return (
    <li className={reminder.past ? "flex items-start justify-between gap-3 py-2 opacity-60" : "flex items-start justify-between gap-3 py-2"}>
      <div className="min-w-0 flex-1 [&_p]:max-w-prose">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="break-words text-sm font-medium text-foreground">
            {reminder.title}
          </p>
          {about && (
            <span className="inline-flex items-center rounded-full border-2 border-border bg-card px-2 py-0.5 text-[10px] font-extrabold text-muted-foreground">
              {about}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {relative && (
            <>
              <span className="font-medium">{relative}</span>
              <span className="mx-1 opacity-50">·</span>
            </>
          )}
          <span>{absolute}</span>
        </p>
        {reminder.notes && <ReminderNotes notes={reminder.notes} />}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={`Edit reminder: ${reminder.title}`}
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Button>
      {editing && <AddReminderDialog reminder={reminder} open onOpenChange={setEditing} />}
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 shrink-0 px-4"
        onClick={() => onGotIt(reminder)}
      >
        Got it
        <span className="sr-only">: {reminder.title}</span>
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

/**
 * RemindersCard — a Trip's dated notes, with add/edit/Got it (delete is inside Edit). Rendered on the trip
 * Home in *every* Phase (it used to sit behind the Travelling gate, which is
 * why nobody could write one on a trip that had not started yet).
 *
 * The Digest opt-in is not here — that lives on the Trip's Settings page.
 * Server data (including `today`) is passed in via props from the page.
 */
export function RemindersCard({ tripId, reminders, today, about, dismissed }: RemindersCardProps) {
  // Held here, not in the row: the row leaves at once, and its Undo comes
  // from the toast after the server's list no longer has it.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [seenReminders, setSeenReminders] = useState(reminders);
  if (seenReminders !== reminders) {
    setSeenReminders(reminders);
    setGone((prev) => {
      const ids = new Set(reminders.map((r) => r.id));
      const kept = [...prev].filter((id) => ids.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }
  const hideId = (id: string) => setGone((prev) => new Set(prev).add(id));
  const showId = (id: string) => setGone((prev) => new Set([...prev].filter((x) => x !== id)));
  const gotIt = useUndoableAction<ReminderItem>({
    apply: (r) => hideId(r.id),
    persist: (r) => updateReminder(r.id, { dismissed: true }),
    revert: (r) => showId(r.id),
    undo: (r) => updateReminder(r.id, { dismissed: false }),
    applyUndo: (r) => showId(r.id),
    revertUndo: (r) => hideId(r.id),
    done: (r) => ({ title: "Dismissed", description: r.title }),
    failure: "Couldn't dismiss that reminder.",
  });
  const [stillDismissed, bringBack] = useOptimistic(dismissed ?? [], (state, id: string) => state.filter((r) => r.id !== id));

  function onBringBack(id: string) {
    startTransition(async () => {
      bringBack(id);
      showId(id);
      try {
        const r = await updateReminder(id, { dismissed: false });
        if (!r.success) toastRefused(r.errors, "Couldn't bring that reminder back.");
      } catch {
        toastRejected("Couldn't bring that reminder back.");
      }
    });
  }

  const shown = reminders.filter((r) => !gone.has(r.id));

  const upcoming = shown.filter((r) => !r.past).sort((a, b) => a.date.localeCompare(b.date));
  const earlier = shown.filter((r) => r.past).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card radius="2xl" shadow={3} className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bell className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <h2 className="font-display text-lg font-extrabold">
          Reminders
        </h2>
      </div>

      {/* Upcoming reminders */}
      {upcoming.length > 0 ? (
        <ul className="divide-y-2 divide-muted" aria-label="Upcoming reminders">
          {upcoming.map((r) => (
            <ReminderRow key={r.id} reminder={r} today={today} onGotIt={(x) => void gotIt.run(x)} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No upcoming reminders.
        </p>
      )}

      {earlier.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-extrabold text-muted-foreground">Earlier</h3>
          <ul className="divide-y-2 divide-muted" aria-label="Earlier reminders">
            {earlier.map((r) => (
              <ReminderRow key={r.id} reminder={r} today={today} onGotIt={(x) => void gotIt.run(x)} />
            ))}
          </ul>
        </div>
      )}

      {stillDismissed.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-extrabold text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
            Dismissed ({stillDismissed.length})
          </summary>
          <ul className="divide-y-2 divide-muted" aria-label="Dismissed reminders">
            {stillDismissed.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <p className="min-w-0 max-w-prose flex-1 break-words text-sm text-muted-foreground">
                  {r.title}
                  <span className="mx-1 opacity-50">·</span>
                  <span className="text-xs">{formatWhen(r.date, today).absolute}</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 shrink-0 px-4"
                  aria-label={`Bring back reminder: ${r.title}`}
                  onClick={() => onBringBack(r.id)}
                >
                  Bring back
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Add form */}
      <AddReminderForm tripId={tripId} about={about} onAdded={() => {}} />
    </Card>
  );
}
