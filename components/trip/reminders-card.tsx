"use client";

import { useState, useTransition } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { daysBetween, formatDayLabel } from "@/lib/dates";
import {
  addReminder,
  deleteReminder,
  type ReminderItem,
} from "@/server/actions/reminders";

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

  // `listRemindersForTrip` queries `date >= today` and the card is given the
  // trip's own today, so a Reminder already gone by is unreachable here in
  // practice. But "unreachable in practice" isn't "impossible" — a stale prop
  // or a clock skew could still hand this a past date — and this card has no
  // copy for that: "31 days ago" would be prose invented for a state nobody
  // has seen and nobody can test against reality. A null relative label is
  // the safe shape instead: the row falls back to showing just the absolute
  // date, which is always correct, rather than risking "in -31 days".
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

function AddReminderForm({
  tripId,
  onAdded,
}: {
  tripId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setDate("");
    setError(null);
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await addReminder(tripId, { title, date });
      if (result.success) {
        reset();
        onAdded();
      } else {
        const msg = Object.values(result.errors).flat()[0];
        setError(msg ?? "Something went wrong.");
      }
    });
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label="Add Reminder"
        className="gap-2 self-start text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add Reminder
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
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
}: {
  reminder: ReminderItem;
  today: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { relative, absolute } = formatWhen(reminder.date, today);

  function handleDelete() {
    startTransition(async () => {
      await deleteReminder(reminder.id);
    });
  }

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-foreground">
          {reminder.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {relative && (
            <>
              <span className="font-medium">{relative}</span>
              <span className="mx-1 opacity-50">·</span>
            </>
          )}
          <span>{absolute}</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-destructive hover:bg-destructive/10"
        aria-label={`Delete reminder: ${reminder.title}`}
        onClick={handleDelete}
        loading={isPending}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

/**
 * RemindersCard — a Trip's dated notes, with add/delete. Rendered on the trip
 * Home in *every* Phase (it used to sit behind the Travelling gate, which is
 * why nobody could write one on a trip that had not started yet).
 *
 * The Digest opt-in is not here — that lives on the Trip's Settings page.
 * Server data (including `today`) is passed in via props from the page.
 */
export function RemindersCard({ tripId, reminders, today }: RemindersCardProps) {
  // No "passed" drawer, deliberately: a Reminder is said once, on its day, and
  // is not something you complete (CONTEXT.md "Reminder"). A drawer of missed
  // notes would quietly turn Reminders into tasks and duplicate what a
  // Checklist item already does properly — that is where a thing that must
  // survive being missed belongs.
  const upcoming = [...reminders].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card radius="xl" className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bell className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="font-display font-semibold text-foreground">
          Reminders
        </h3>
      </div>

      {/* Upcoming reminders */}
      {upcoming.length > 0 ? (
        <ul className="divide-y divide-border" aria-label="Upcoming reminders">
          {upcoming.map((r) => (
            <ReminderRow key={r.id} reminder={r} today={today} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No upcoming reminders.
        </p>
      )}

      {/* Add form */}
      <AddReminderForm tripId={tripId} onAdded={() => {}} />
    </Card>
  );
}
