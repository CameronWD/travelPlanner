"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { CHAPTER_COLOURS, type ChapterColour } from "@/lib/chapter-colours";
import { FormError } from "@/components/ui/form-error";
import { createChapter, updateChapter } from "@/server/actions/chapters";
import { cn } from "@/lib/cn";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";

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
  /** Fork to create the chapter in (null = real plan). */
  forkId?: string | null;
}

/**
 * Dialog with a form for creating or editing a Chapter.
 *
 * Uses `FormDialog` which keys the inner form to reset all controlled state
 * whenever the dialog opens or the target chapter changes — avoids
 * setState-in-effect lint errors.
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
  forkId,
}: ChapterFormDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={chapter ? `Edit ${chapter.name}` : "Add a chapter"}
      recordId={chapter?.id ?? null}
    >
      <ChapterForm
        tripId={tripId}
        chapter={chapter}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
        originStopId={originStopId}
        forkId={forkId}
      />
    </FormDialog>
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
  forkId?: string | null;
}

function ChapterForm({
  tripId,
  chapter,
  onClose,
  onSaved,
  defaultStart,
  defaultEnd,
  originStopId,
  forkId,
}: ChapterFormProps) {
  const isEdit = Boolean(chapter);

  // State is initialised once from props when the component mounts.
  // The parent uses FormDialog which keys the inner form to force a remount
  // when the dialog re-opens.
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

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: () => {
      const input = setDatesNow
        ? { name, colour, startDate, endDate }
        : { name, colour };

      return isEdit && chapter
        ? updateChapter(chapter.id, input)
        : createChapter(tripId, input, originStopId, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Name */}
      <Field label="Chapter name" required error={(errors as FormErrors).name?.[0]}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. France"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Colour */}
      <Field label="Colour" required error={(errors as FormErrors).colour?.[0]}>
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
            error={(errors as FormErrors).startDate?.[0]}
            disabled={isPending}
          />
          <DateField
            label="End date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || undefined}
            error={(errors as FormErrors).endDate?.[0]}
            disabled={isPending}
          />
        </div>
      )}

      {/* Form-level error */}
      <FormError>{(errors as FormErrors)._form?.[0]}</FormError>

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
