"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import {
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { TIMEZONES, guessTimezoneForCountry } from "@/lib/tz";
import { FormError } from "@/components/ui/form-error";
import { createStop, updateStop } from "@/server/actions/stops";
import type { StopInput } from "@/lib/validations/stop";
import type { StopCardStop } from "./stop-card";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";

const NO_CHAPTER = "__none__";

interface FormErrors {
  name?: string[];
  country?: string[];
  timezone?: string[];
  nights?: string[];
  chapterId?: string[];
  arriveDate?: string[];
  departDate?: string[];
  notes?: string[];
  _form?: string[];
}

export interface StopFormDialogProps {
  tripId: string;
  /** When provided, the form is in "edit" mode for this stop. */
  stop?: StopCardStop | null;
  /** Chapters available to assign a rough stop to. */
  chapters?: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save. */
  onSaved?: () => void;
  /** Trip date window — constrains the date pickers so they open in-range. */
  tripStartDate?: string;
  tripEndDate?: string;
  /** Default dates for a NEW stop (ignored in edit mode). */
  defaultArriveDate?: string;
  defaultDepartDate?: string;
  /** Fork to create the stop in (null = real plan). */
  forkId?: string | null;
  /** Existing attachments for this stop (edit mode only). */
  attachments?: AttachmentView[];
}

/**
 * Dialog with a form for creating or editing a Stop.
 *
 * Supports two modes: "rough" (place + nights estimate + optional chapter, no
 * dates) and "scheduled" (the full date/timezone form). New stops default to
 * rough; editing defaults to the stop's current mode.
 *
 * Uses `FormDialog` which keys the inner form to reset all controlled state
 * whenever the dialog opens or the target stop changes — avoids setState-in-effect
 * lint errors.
 */
export function StopFormDialog({
  tripId,
  stop,
  chapters = [],
  open,
  onOpenChange,
  onSaved,
  tripStartDate,
  tripEndDate,
  defaultArriveDate,
  defaultDepartDate,
  forkId,
  attachments,
}: StopFormDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={stop ? `Edit ${stop.name}` : "Add Stop"}
      recordId={stop?.id ?? null}
    >
      <StopForm
        tripId={tripId}
        stop={stop}
        chapters={chapters}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        defaultArriveDate={defaultArriveDate}
        defaultDepartDate={defaultDepartDate}
        forkId={forkId}
        attachments={attachments}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form (remounts on key change — state initialised from props once)
// ---------------------------------------------------------------------------

type Mode = "rough" | "scheduled";

interface StopFormProps {
  tripId: string;
  stop?: StopCardStop | null;
  chapters: { id: string; name: string }[];
  onClose: () => void;
  onSaved?: () => void;
  tripStartDate?: string;
  tripEndDate?: string;
  defaultArriveDate?: string;
  defaultDepartDate?: string;
  forkId?: string | null;
  attachments?: AttachmentView[];
}

function StopForm({
  tripId,
  stop,
  chapters,
  onClose,
  onSaved,
  tripStartDate,
  tripEndDate,
  defaultArriveDate,
  defaultDepartDate,
  forkId,
  attachments,
}: StopFormProps) {
  const isEdit = Boolean(stop);

  // Default mode: editing keeps the stop's current mode; adding starts rough.
  const initialMode: Mode = stop ? (stop.arriveDate ? "scheduled" : "rough") : "rough";
  const [mode, setMode] = React.useState<Mode>(initialMode);

  // State is initialised once from props when the component mounts.
  // The parent uses FormDialog which keys the inner form to force a remount
  // when the dialog re-opens.
  const [name, setName] = React.useState(stop?.name ?? "");
  const [country, setCountry] = React.useState(stop?.country ?? "");
  const [timezone, setTimezone] = React.useState(
    stop?.timezone ?? guessTimezoneForCountry(stop?.country) ?? "UTC",
  );
  const [nights, setNights] = React.useState<string>(
    stop?.nights != null ? String(stop.nights) : "2",
  );
  const [chapterId, setChapterId] = React.useState<string>(
    stop?.chapterId ?? NO_CHAPTER,
  );
  // New stops default into the trip window (so the picker opens in the right
  // month); editing keeps the stop's own dates.
  const [arriveDate, setArriveDate] = React.useState(
    stop?.arriveDate ?? defaultArriveDate ?? "",
  );
  const [departDate, setDepartDate] = React.useState(
    stop?.departDate ?? defaultDepartDate ?? "",
  );
  const [notes, setNotes] = React.useState(stop?.notes ?? "");

  const { errors, isPending, onSubmit } = useEntityForm<Record<never, never>>({
    submit: () => {
      let input: StopInput;
      if (mode === "rough") {
        const parsedNights = Number.parseInt(nights, 10);
        input = {
          mode: "rough",
          name,
          country: country.trim() || undefined,
          nights: Number.isFinite(parsedNights) ? parsedNights : 0,
          notes: notes.trim() || undefined,
          ...(chapterId !== NO_CHAPTER ? { chapterId } : {}),
        };
      } else {
        input = {
          mode: "scheduled",
          name,
          country: country.trim() || undefined,
          timezone,
          arriveDate,
          departDate,
          notes: notes.trim() || undefined,
        };
      }
      return isEdit && stop
        ? updateStop(stop.id, input)
        : createStop(tripId, input, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  // Auto-guess timezone when the user types a country
  function handleCountryChange(value: string) {
    setCountry(value);
    const guessed = guessTimezoneForCountry(value);
    if (guessed !== "UTC") {
      setTimezone(guessed);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Mode toggle */}
      <Segmented
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (v) setMode(v as Mode);
        }}
        aria-label="Stop type"
        disabled={isPending}
      >
        <SegmentedItem value="rough">Rough</SegmentedItem>
        <SegmentedItem value="scheduled">Scheduled</SegmentedItem>
      </Segmented>

      {/* Name */}
      <Field label="Place name" required error={(errors as FormErrors).name?.[0]}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. London"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Country */}
      <Field label="Country" error={(errors as FormErrors).country?.[0]}>
        <Input
          value={country}
          onChange={(e) => handleCountryChange(e.target.value)}
          placeholder="e.g. United Kingdom"
          disabled={isPending}
        />
      </Field>

      {mode === "rough" ? (
        <>
          {/* Nights */}
          <Field label="Nights (rough)" error={(errors as FormErrors).nights?.[0]}>
            <Input
              type="number"
              min={0}
              value={nights}
              onChange={(e) => setNights(e.target.value)}
              disabled={isPending}
            />
          </Field>

          {/* Chapter */}
          <Field label="Chapter" error={(errors as FormErrors).chapterId?.[0]}>
            <Select
              value={chapterId}
              onValueChange={setChapterId}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="No chapter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CHAPTER}>No chapter</SelectItem>
                {chapters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </>
      ) : (
        <>
          {/* Timezone */}
          <Field label="Timezone" required error={(errors as FormErrors).timezone?.[0]}>
            <Select
              value={timezone}
              onValueChange={setTimezone}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Date row */}
          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="Arrive"
              required
              value={arriveDate}
              onChange={(e) => setArriveDate(e.target.value)}
              min={tripStartDate}
              max={tripEndDate}
              error={(errors as FormErrors).arriveDate?.[0]}
              disabled={isPending}
            />
            <DateField
              label="Depart"
              required
              value={departDate}
              onChange={(e) => setDepartDate(e.target.value)}
              min={arriveDate || tripStartDate}
              max={tripEndDate}
              error={(errors as FormErrors).departDate?.[0]}
              disabled={isPending}
            />
          </div>
        </>
      )}

      {/* Notes */}
      <Field label="Notes" error={(errors as FormErrors).notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this stop…"
          disabled={isPending}
        />
      </Field>

      {/* Attachments */}
      <Field label="Attachments">
        {stop?.id ? (
          <AttachmentList
            tripId={tripId}
            targetType="STOP"
            targetId={stop.id}
            attachments={attachments ?? []}
            compact
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Save this stop first, then reopen it to attach files.
          </p>
        )}
      </Field>

      {/* Form-level error */}
      <FormError>{(errors as FormErrors)._form?.[0]}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          {isEdit ? "Save changes" : "Add Stop"}
        </Button>
      </DialogFooter>
    </form>
  );
}
