"use client";

import { useState, useTransition } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export type { ReminderItem };

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
 */
export function formatWhen(
  date: string,
  today: string,
): { relative: string; absolute: string } {
  const days = daysBetween(today, date);

  let relative: string;
  if (days < 0) {
    relative = "passed";
  } else if (days === 0) {
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
  const isPast = reminder.date < today;

  function handleDelete() {
    startTransition(async () => {
      await deleteReminder(reminder.id);
    });
  }

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${isPast ? "text-muted-foreground" : "text-foreground"}`}
        >
          {reminder.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium">{relative}</span>
          <span className="mx-1 opacity-50">·</span>
          <span>{absolute}</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-destructive hover:bg-destructive/10"
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
  const sorted = [...reminders].sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = sorted.filter((r) => r.date >= today);
  const past = sorted.filter((r) => r.date < today);

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
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
        <p className="mb-2 text-sm text-muted-foreground italic">
          No upcoming reminders.
        </p>
      )}

      {/* Add form */}
      <div className="mt-3">
        <AddReminderForm tripId={tripId} onAdded={() => {}} />
      </div>

      {/* Passed reminders (collapsed) */}
      {past.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Passed ({past.length})
          </summary>
          <ul
            className="mt-2 divide-y divide-border"
            aria-label="Passed reminders"
          >
            {past.map((r) => (
              <ReminderRow key={r.id} reminder={r} today={today} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
