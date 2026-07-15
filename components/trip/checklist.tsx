"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  CheckSquare,
  Square,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  CalendarClock,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { todayISO } from "@/lib/dates";
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
import {
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  reorderChecklistItem,
} from "@/server/actions/checklists";
import type { ChecklistKind } from "@/lib/enums";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { motion, useReducedMotion } from "motion/react";
import { SPRING_POP } from "@/lib/motion";
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
 */
function dueDateStatus(
  dueDate: string | null | undefined,
  done: boolean,
): { label: string; variant: "overdue" | "soon" | "normal" } | null {
  if (!dueDate || done) return null;
  const today = todayISO();
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
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/40 p-3 sm:flex-row sm:items-end"
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
        <div className="w-full sm:w-40 shrink-0">
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
        <div className="w-full sm:w-44 shrink-0">
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
        size="sm"
        shape="pill"
        loading={pending}
        className="shrink-0 self-end sm:self-auto"
      >
        Add
      </Button>
    </form>
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
}: {
  item: ChecklistItemRow;
  isFirst: boolean;
  isLast: boolean;
  members?: ChecklistMember[];
  showDueDate?: boolean;
  showAssignee?: boolean;
}) {
  const reduce = useReducedMotion();
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

  const status = dueDateStatus(item.dueDate, item.done);

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
          "group flex items-center gap-3 rounded-lg px-3.5 py-3 transition-colors",
          "hover:bg-muted/40",
          (pending || deleteIsPending) && "opacity-60",
        )}
      >
        {/* Checkbox */}
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-label={item.done ? "Mark incomplete" : "Mark complete"}
          className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
        >
          <motion.span
            key={item.done ? "done" : "todo"}
            initial={reduce ? false : { scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={reduce ? { duration: 0 } : SPRING_POP}
            className="inline-flex"
          >
            {item.done ? (
              <CheckSquare className="size-5 text-primary" aria-hidden="true" />
            ) : (
              <Square className="size-5" aria-hidden="true" />
            )}
          </motion.span>
        </button>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "text-sm leading-snug",
              item.done && "text-muted-foreground line-through",
            )}
          >
            {item.text}
          </span>

          {/* Due date hint */}
          {showDueDate && status && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-semibold",
                status.variant === "overdue" && "text-destructive",
                status.variant === "soon" && "text-amber-700 dark:text-amber-400",
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
        </div>

        {/* Assignee avatar */}
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
            <AvatarFallback className="text-[10px]">
              {initials(item.assignedTo.name)}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Actions: visible on hover or focus */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5",
            "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
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
            className="size-8"
            onClick={() => move("down")}
            disabled={pending || isLast}
            aria-label="Move down"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setEditOpen(true)}
            disabled={pending}
            aria-label="Edit Item"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:bg-destructive/10"
            onClick={() => requestDelete(item.id)}
            disabled={pending || deleteIsPending}
            aria-label="Delete Item"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </AnimatedItem>
    </>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${done} of ${total} done`}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
        {done} of {total} done
      </span>
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

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={CheckSquare}
          title={kind === "PRETRIP" ? "No pre-trip tasks yet." : "No packing items yet."}
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
      <ProgressBar done={doneCount} total={items.length} />

      {/* Items */}
      <AnimatedList as="ul" className="flex flex-col divide-y divide-border/50 rounded-2xl border border-border bg-card">
        {items.map((item, idx) => (
          <ChecklistRow
            key={item.id}
            item={item}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            members={members}
            showDueDate={showDueDate}
            showAssignee={showAssignee}
          />
        ))}
      </AnimatedList>

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

