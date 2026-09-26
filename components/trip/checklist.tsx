"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Check,
  Plus,
  ChevronUp,
  ChevronDown,
  CalendarClock,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { todayISO, todayLocalISO } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, cardVariants } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RowActions } from "@/components/ui/row-actions";
import {
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  reorderChecklistItem,
} from "@/server/actions/checklists";
import type { ChecklistKind } from "@/lib/enums";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useDeleteWithConfirm } from "@/components/ui/use-delete-with-confirm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecklistMember {
  id: string;
  name?: string | null;
  image?: string | null;
}

export interface ChecklistItemRow {
  id: string;
  kind: ChecklistKind;
  text: string;
  done: boolean;
  dueDate?: string | null;
  sortOrder: number;
  assignedTo?: ChecklistMember | null;
}

interface ChecklistProps {
  tripId: string;
  kind: ChecklistKind;
  items: ChecklistItemRow[];
  members?: ChecklistMember[];
  /** Show due-date column (default: true for PRETRIP) */
  showDueDate?: boolean;
  /** Show assignee column (default: true for PRETRIP) */
  showAssignee?: boolean;
}

// ---------------------------------------------------------------------------
// "Today" — SSR-safe client-local calendar day.
//
// Mirrors the CalendarViews view-toggle pattern (components/trip/calendar-views.tsx):
// useSyncExternalStore gives the server (and pre-hydration client) a stable
// snapshot — the UTC day — so both sides agree and hydration never mismatches.
// After hydration the device-local day (todayLocalISO) takes over. No
// setState-in-an-effect involved.
// ---------------------------------------------------------------------------

function subscribeToday(): () => void {
  // The device-local day doesn't need live updates within a mounted session
  // (a day boundary crossing mid-session re-resolves on the next render
  // anyway) — a no-op subscribe is the correct shape here, same as any
  // useSyncExternalStore source that only needs to resolve once on the client.
  return () => {};
}

function getTodaySnapshot(): string {
  return todayLocalISO();
}

function getTodayServerSnapshot(): string {
  return todayISO();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/**
 * Format a YYYY-MM-DD string as a short human-readable date (e.g. "1 Jul").
 * Parses as UTC midnight to match how dueDateStatus compares dates.
 */
function formatShortDueDate(dueDate: string): string {
  return new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Returns a due-date status hint for display. Returns null if no dueDate.
 * `today` is the caller-resolved "today" (see subscribeToday/getTodaySnapshot
 * above) — SSR-safe (UTC day) until hydration, device-local day after.
 */
function dueDateStatus(
  dueDate: string | null | undefined,
  done: boolean,
  today: string,
): { label: string; variant: "overdue" | "soon" | "normal" } | null {
  if (!dueDate || done) return null;
  const formatted = formatShortDueDate(dueDate);
  if (dueDate < today)
    return { label: `Overdue · ${formatted}`, variant: "overdue" };
  // "due soon" = within 7 days
  const diff =
    (new Date(`${dueDate}T00:00:00Z`).getTime() -
      new Date(`${today}T00:00:00Z`).getTime()) /
    86_400_000;
  if (diff <= 7) return { label: `Due soon · ${formatted}`, variant: "soon" };
  return { label: `Due · ${formatted}`, variant: "normal" };
}

// ---------------------------------------------------------------------------
// AddItemForm — inline form at the bottom of the list
// ---------------------------------------------------------------------------

function AddItemForm({
  tripId,
  kind,
  members,
  showDueDate,
  showAssignee,
}: {
  tripId: string;
  kind: ChecklistKind;
  members?: ChecklistMember[];
  showDueDate?: boolean;
  showAssignee?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [assignedToId, setAssignedToId] = React.useState("");
  const [error, setError] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Text is required");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await addChecklistItem(tripId, {
        kind,
        text: text.trim(),
        dueDate: dueDate || undefined,
        assignedToId: assignedToId || undefined,
      });
      if (result.success) {
        setText("");
        setDueDate("");
        setAssignedToId("");
      } else {
        const firstError = Object.values(result.errors)[0]?.[0];
        setError(firstError ?? "Something went wrong");
      }
    });
  }

  return (
    // `@container`: this form now also renders inside a Checklists grid card
    // (LA-017), which is always narrower than the ~700px this row layout
    // needs, regardless of viewport — a viewport-based `sm:` broke
    // (input/date/assignee/button overlapped) whenever the form's own
    // rendered width, not the viewport, was the narrow one. Querying the
    // form's own box from this wrapper side-steps that (a container can't
    // query itself, so the `@min-[700px]:` variants below live one level
    // down): it stays stacked in a grid card at any desktop width, and still
    // rows up in the full-width tab panel once there's actually room.
    <div className="@container">
      <form
        onSubmit={handleSubmit}
        aria-label={kind === "PRETRIP" ? "Add a pre-trip task" : "Add a packing item"}
        className={cn(
          cardVariants({ dashed: true }),
          "flex flex-col gap-3 p-3.5 @min-[700px]:flex-row @min-[700px]:items-end @min-[700px]:p-[18px]",
        )}
      >
        <div className="flex-1 min-w-0">
          <Field label="New item" error={error}>
            <Input
              placeholder={
                kind === "PRETRIP" ? "e.g. Book airport taxi" : "e.g. Sunscreen"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>

        {showDueDate && (
          <div className="w-full @min-[700px]:w-40 shrink-0">
            <Field label="Due date (optional)">
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={pending}
              />
            </Field>
          </div>
        )}

        {showAssignee && members && members.length > 0 && (
          <div className="w-full @min-[700px]:w-44 shrink-0">
            <Field label="Assignee (optional)">
              <Select
                value={assignedToId}
                onValueChange={setAssignedToId}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Anyone</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name ?? "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          loading={pending}
          className="shrink-0 self-end @min-[700px]:self-auto"
        >
          <Plus aria-hidden="true" />
          Add item
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditItemDialog
// ---------------------------------------------------------------------------

/**
 * Inner form — mounted fresh each time the dialog opens (via `key` in the
 * outer shell), so state is always in sync with `item` without a useEffect reset.
 */
function EditItemForm({
  item,
  members,
  showDueDate,
  showAssignee,
  onClose,
}: {
  item: ChecklistItemRow;
  members?: ChecklistMember[];
  showDueDate?: boolean;
  showAssignee?: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = React.useState(item.text);
  const [dueDate, setDueDate] = React.useState(item.dueDate ?? "");
  const [assignedToId, setAssignedToId] = React.useState(
    item.assignedTo?.id ?? "",
  );
  const [error, setError] = React.useState("");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Text is required");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await updateChecklistItem(item.id, {
        text: text.trim(),
        // Pass the raw value: "" is an explicit clear, the schema maps it to null.
        dueDate,
        assignedToId,
      });
      if (result.success) {
        onClose();
      } else {
        const firstError = Object.values(result.errors)[0]?.[0];
        setError(firstError ?? "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <Field label="Text" required error={error}>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          autoFocus
        />
      </Field>

      {showDueDate && (
        <Field label="Due date (optional)">
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={pending}
          />
        </Field>
      )}

      {showAssignee && members && members.length > 0 && (
        <Field label="Assignee (optional)">
          <Select
            value={assignedToId}
            onValueChange={setAssignedToId}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Anyone</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name ?? "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Dialog shell — uses a `key` on the inner form to remount it when opened,
 * ensuring form state is always fresh without needing a useEffect reset.
 */
function EditItemDialog({
  item,
  members,
  showDueDate,
  showAssignee,
  open,
  onOpenChange,
}: {
  item: ChecklistItemRow;
  members?: ChecklistMember[];
  showDueDate?: boolean;
  showAssignee?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
        </DialogHeader>
        {/* key forces remount on every open → state always fresh */}
        <EditItemForm
          key={open ? item.id : `${item.id}-closed`}
          item={item}
          members={members}
          showDueDate={showDueDate}
          showAssignee={showAssignee}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ChecklistItemRow — single row
// ---------------------------------------------------------------------------

function ChecklistRow({
  item,
  isFirst,
  isLast,
  members,
  showDueDate,
  showAssignee,
  today,
}: {
  item: ChecklistItemRow;
  isFirst: boolean;
  isLast: boolean;
  members?: ChecklistMember[];
  showDueDate?: boolean;
  showAssignee?: boolean;
  today: string;
}) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = React.useState(false);
  const { requestDelete, isPending: deleteIsPending, dialog: confirmDialog } = useDeleteWithConfirm({
    action: deleteChecklistItem,
    buildConfirm: () => ({
      title: `Delete "${item.text}"?`,
      description: "This item will be permanently removed from the checklist.",
      confirmLabel: "Delete",
      destructive: true,
    }),
  });

  const status = dueDateStatus(item.dueDate, item.done, today);

  function toggle() {
    startTransition(async () => {
      await toggleChecklistItem(item.id, !item.done);
    });
  }

  function move(direction: "up" | "down") {
    startTransition(async () => {
      await reorderChecklistItem(item.id, direction);
    });
  }

  return (
    <>
      {confirmDialog}
      <EditItemDialog
        item={item}
        members={members}
        showDueDate={showDueDate}
        showAssignee={showAssignee}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AnimatedItem
        as="li"
        className={cn(
          "group relative flex flex-wrap items-center gap-x-2 border-t border-border-soft first:border-t-0",
          (pending || deleteIsPending) && "opacity-60",
        )}
      >
        {/* Checkbox primitive: native input, named by the item text; the
            whole ≥44px label row toggles. */}
        <Checkbox
          checked={item.done}
          onChange={toggle}
          disabled={pending}
          className="min-w-0 flex-1 py-1 text-sm font-semibold leading-snug"
          label={
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="break-words">{item.text}</span>
              {/* Due date hint (never shown on a done item) */}
              {showDueDate && status && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-semibold",
                    status.variant === "overdue" && "text-destructive",
                    status.variant === "soon" && "text-sun-text",
                    status.variant === "normal" && "text-muted-foreground",
                  )}
                >
                  {status.variant === "overdue" ? (
                    <AlertTriangle className="size-3" aria-hidden="true" />
                  ) : status.variant === "soon" ? (
                    <Clock3 className="size-3" aria-hidden="true" />
                  ) : (
                    <CalendarClock className="size-3" aria-hidden="true" />
                  )}
                  {status.label}
                </span>
              )}
            </span>
          }
        />

        {/* Assignee avatar (kit: 24px) */}
        {showAssignee && item.assignedTo && (
          <Avatar
            className="size-6 shrink-0"
            title={item.assignedTo.name ?? "Assigned member"}
          >
            {item.assignedTo.image ? (
              <AvatarImage
                src={item.assignedTo.image}
                alt={item.assignedTo.name ?? "Member"}
              />
            ) : null}
            <AvatarFallback className="text-[9px]">
              {initials(item.assignedTo.name)}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Actions (ours; not in the kit). Mouse: overlaid on the row's right
            edge on hover/focus, so the label keeps the full width. Touch (no
            hover): always visible; on phones they drop to their own line so
            the item text isn't squeezed. */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-1",
            "pointer-fine:absolute pointer-fine:inset-y-0 pointer-fine:right-0 pointer-fine:bg-card pointer-fine:pl-2",
            "pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100",
            "pointer-coarse:max-sm:-mt-1 pointer-coarse:max-sm:mb-1 pointer-coarse:max-sm:basis-full pointer-coarse:max-sm:justify-end",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ROW_ICON_BUTTON}
            onClick={() => move("up")}
            disabled={pending || isFirst}
            aria-label="Move up"
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ROW_ICON_BUTTON}
            onClick={() => move("down")}
            disabled={pending || isLast}
            aria-label="Move down"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
          <RowActions
            onEdit={() => setEditOpen(true)}
            onDelete={() => requestDelete(item.id)}
            editLabel="Edit Item"
            deleteLabel="Delete Item"
            disabled={pending || deleteIsPending}
          />
        </div>
      </AnimatedItem>
    </>
  );
}

/** 32px ghost icon button with a 44px touch hit area — same shape as RowActions. */
const ROW_ICON_BUTTON =
  "relative size-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']";

// ---------------------------------------------------------------------------
// Progress — kit "N of M done" + teal ProgressBar
// ---------------------------------------------------------------------------

function ChecklistProgress({ done, total }: { done: number; total: number }) {
  const label = `${done} of ${total} done`;
  return (
    <div className="flex flex-col gap-2">
      <p className="self-end text-xs font-semibold text-muted-foreground">{label}</p>
      <ProgressBar value={total === 0 ? 0 : (done / total) * 100} label={label} fill="bg-teal" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checklist — main component
// ---------------------------------------------------------------------------

export function Checklist({
  tripId,
  kind,
  items,
  members,
  showDueDate = true,
  showAssignee = true,
}: ChecklistProps) {
  const doneCount = items.filter((i) => i.done).length;

  // Resolved once here (not per-row) and threaded down to ChecklistRow —
  // SSR-safe via useSyncExternalStore, see subscribeToday/getTodaySnapshot above.
  const today = React.useSyncExternalStore(
    subscribeToday,
    getTodaySnapshot,
    getTodayServerSnapshot,
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={Check}
          tone="teal"
          title={kind === "PRETRIP" ? "No pre-trip tasks yet" : "No packing items yet"}
          description={
            kind === "PRETRIP"
              ? "Add tasks like booking confirmations, paperwork, and anything to sort before you leave."
              : "Add what you need to pack — or apply a saved template to get started quickly."
          }
        />
        <AddItemForm
          tripId={tripId}
          kind={kind}
          members={members}
          showDueDate={showDueDate}
          showAssignee={showAssignee}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <ChecklistProgress done={doneCount} total={items.length} />

      {/* Items — one kit Card (the kit groups items into several cards;
          we have no groups, see the phase-3 gaps log). */}
      <Card data-slot="checklist-card" className="p-3.5 sm:p-[18px]">
      <AnimatedList as="ul" className="flex flex-col">
        {items.map((item, idx) => (
          <ChecklistRow
            key={item.id}
            item={item}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            members={members}
            showDueDate={showDueDate}
            showAssignee={showAssignee}
            today={today}
          />
        ))}
      </AnimatedList>
      </Card>

      {/* Add form */}
      <AddItemForm
        tripId={tripId}
        kind={kind}
        members={members}
        showDueDate={showDueDate}
        showAssignee={showAssignee}
      />
    </div>
  );
}

