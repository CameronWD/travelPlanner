"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { CHAPTER_COLOURS, type ChapterColour } from "@/lib/chapter-colours";
import { FormError } from "@/components/ui/form-error";
import { createChapter, updateChapter } from "@/server/actions/chapters";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormErrors {
  name?: string[];
  colour?: string[];
  startDate?: string[];
  endDate?: string[];
  _form?: string[];
}

export interface ChapterFormDialogChapter {
  id: string;
  name: string;
  colour: string;
  startDate: string | null; // null for rough (date-less) chapters
  endDate: string | null;   // null for rough (date-less) chapters
}

export interface ChapterFormDialogProps {
  tripId: string;
  /** When provided, the form is in "edit" mode for this chapter. */
  chapter?: ChapterFormDialogChapter | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save. */
  onSaved?: () => void;
  /** Default start date for a new chapter (e.g. from "Start a chapter here"). */
  defaultStart?: string;
  /** Default end date for a new chapter (e.g. from "Start a chapter here"). */
  defaultEnd?: string;
  /** When creating from a stop, the originating stop's id — linked to the new chapter if rough. */
  originStopId?: string;
}

/**
 * Dialog with a form for creating or editing a Chapter.
 *
 * Uses a `key` on the inner form to reset all controlled state whenever the
 * dialog opens or the target chapter changes — avoids setState-in-effect lint errors.
 */
export function ChapterFormDialog({
  tripId,
  chapter,
  open,
  onOpenChange,
  onSaved,
  defaultStart,
  defaultEnd,
  originStopId,
}: ChapterFormDialogProps) {
  // The key causes React to remount the form component whenever the dialog
  // opens or the chapter changes, giving us fresh initial state for free.
  const formKey = open ? `${chapter?.id ?? "new"}-${String(open)}` : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {chapter ? `Edit ${chapter.name}` : "Add a chapter"}
          </DialogTitle>
        </DialogHeader>
        <ChapterForm
          key={formKey}
          tripId={tripId}
          chapter={chapter}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
          defaultStart={defaultStart}
          defaultEnd={defaultEnd}
          originStopId={originStopId}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form (remounts on key change — state initialised from props once)
// ---------------------------------------------------------------------------

interface ChapterFormProps {
  tripId: string;
  chapter?: ChapterFormDialogChapter | null;
  onClose: () => void;
  onSaved?: () => void;
  defaultStart?: string;
  defaultEnd?: string;
  originStopId?: string;
}

function ChapterForm({
  tripId,
  chapter,
  onClose,
  onSaved,
  defaultStart,
  defaultEnd,
  originStopId,
}: ChapterFormProps) {
  const isEdit = Boolean(chapter);

  // State is initialised once from props when the component mounts.
  // The parent uses `key` to force a remount when the dialog re-opens.
  const [name, setName] = React.useState(chapter?.name ?? "");
  const [colour, setColour] = React.useState<ChapterColour>(
    (chapter?.colour as ChapterColour) ?? CHAPTER_COLOURS[0].value,
  );
  const [startDate, setStartDate] = React.useState(
    chapter?.startDate ?? defaultStart ?? "",
  );
  const [endDate, setEndDate] = React.useState(
    chapter?.endDate ?? defaultEnd ?? "",
  );
  // "Set dates now": OFF for a new chapter; ON when editing one that has dates.
  const [setDatesNow, setSetDatesNow] = React.useState(
    isEdit ? chapter?.startDate != null : false,
  );
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const input = setDatesNow
      ? { name, colour, startDate, endDate }
      : { name, colour };

    startTransition(async () => {
      const result =
        isEdit && chapter
          ? await updateChapter(chapter.id, input)
          : await createChapter(tripId, input, originStopId);

      if (!result.success) {
        setErrors(result.errors as FormErrors);
        return;
      }

      onClose();
      onSaved?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Name */}
      <Field label="Chapter name" required error={errors.name?.[0]}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. France"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Colour */}
      <Field label="Colour" required error={errors.colour?.[0]}>
        <div className="flex flex-wrap gap-2">
          {CHAPTER_COLOURS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              aria-label={c.label}
              aria-pressed={colour === c.value}
              disabled={isPending}
              onClick={() => setColour(c.value)}
              className={cn(
                "size-7 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                colour === c.value
                  ? "ring-2 ring-ring ring-offset-2"
                  : "opacity-70 hover:opacity-100",
              )}
              style={{ backgroundColor: c.swatch }}
            />
          ))}
        </div>
      </Field>

      {/* Set dates now toggle */}
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={setDatesNow}
          disabled={isPending}
          onChange={(e) => setSetDatesNow(e.target.checked)}
        />
        Set dates now
      </label>

      {/* Date row — only when dates are being set */}
      {setDatesNow && (
        <div className="grid grid-cols-2 gap-3">
          <DateField
            label="Start date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate || undefined}
            error={errors.startDate?.[0]}
            disabled={isPending}
          />
          <DateField
            label="End date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || undefined}
            error={errors.endDate?.[0]}
            disabled={isPending}
          />
        </div>
      )}

      {/* Form-level error */}
      <FormError>{errors._form?.[0]}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          {isEdit ? "Save changes" : "Add chapter"}
        </Button>
      </DialogFooter>
    </form>
  );
}
