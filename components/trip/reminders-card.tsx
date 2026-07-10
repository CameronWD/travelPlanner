"use client";

import { useState, useTransition } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnableNotifications } from "@/components/trip/enable-notifications";
import { addReminder, deleteReminder } from "@/server/actions/reminders";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReminderItem {
  id: string;
  title: string;
  fireAt: Date;
  sent: boolean;
}

interface RemindersCardProps {
  tripId: string;
  reminders: ReminderItem[];
}

// ---------------------------------------------------------------------------
// Relative + absolute label
// ---------------------------------------------------------------------------

function formatWhen(fireAt: Date): { relative: string; absolute: string } {
  const now = new Date();
  const diffMs = fireAt.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  const diffHr = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);

  let relative: string;
  if (diffMs < 0) {
    relative = "overdue";
  } else if (diffMin < 60) {
    relative = `in ${diffMin}m`;
  } else if (diffHr < 24) {
    relative = `in ${diffHr}h`;
  } else if (diffDay === 1) {
    relative = "tomorrow";
  } else {
    relative = `in ${diffDay}d`;
  }

  const absolute = fireAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return { relative, absolute };
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
  const [fireAt, setFireAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setFireAt("");
    setError(null);
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await addReminder(tripId, { title, fireAt });
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
        type="datetime-local"
        value={fireAt}
        onChange={(e) => setFireAt(e.target.value)}
        required
        aria-label="Reminder date and time"
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

function ReminderRow({ reminder }: { reminder: ReminderItem }) {
  const [isPending, startTransition] = useTransition();
  const { relative, absolute } = formatWhen(reminder.fireAt);

  function handleDelete() {
    startTransition(async () => {
      await deleteReminder(reminder.id);
    });
  }

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${reminder.sent ? "text-muted-foreground line-through" : "text-foreground"}`}
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
 * RemindersCard — shows upcoming reminders for a trip with add/delete and the
 * enable-notifications control. Renders as a "use client" component; server
 * data is passed in via props from the page.
 */
export function RemindersCard({ tripId, reminders }: RemindersCardProps) {
  // Sort: unsent first (ascending fireAt), then sent
  const sorted = [...reminders].sort((a, b) => {
    if (a.sent !== b.sent) return a.sent ? 1 : -1;
    return a.fireAt.getTime() - b.fireAt.getTime();
  });

  const upcoming = sorted.filter((r) => !r.sent);
  const past = sorted.filter((r) => r.sent);

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <Bell className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="font-display font-semibold text-foreground">
          Reminders
        </h3>
      </div>

      {/* Enable notifications control */}
      <div className="mb-4">
        <EnableNotifications />
      </div>

      {/* Upcoming reminders */}
      {upcoming.length > 0 ? (
        <ul className="divide-y divide-border" aria-label="Upcoming reminders">
          {upcoming.map((r) => (
            <ReminderRow key={r.id} reminder={r} />
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

      {/* Sent reminders (collapsed) */}
      {past.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {past.length} sent reminder{past.length !== 1 ? "s" : ""}
          </summary>
          <ul
            className="mt-2 divide-y divide-border"
            aria-label="Sent reminders"
          >
            {past.map((r) => (
              <ReminderRow key={r.id} reminder={r} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
