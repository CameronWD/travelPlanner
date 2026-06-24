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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { TIMEZONES, guessTimezoneForCountry } from "@/lib/tz";
import { createStop, updateStop } from "@/server/actions/stops";
import type { StopInput } from "@/lib/validations/stop";
import type { StopCardStop } from "./stop-card";

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
}

/**
 * Dialog with a form for creating or editing a Stop.
 *
 * Supports two modes: "rough" (place + nights estimate + optional chapter, no
 * dates) and "scheduled" (the full date/timezone form). New stops default to
 * rough; editing defaults to the stop's current mode.
 *
 * Uses a `key` on the inner form to reset all controlled state whenever the
 * dialog opens or the target stop changes — avoids setState-in-effect lint errors.
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
}: StopFormDialogProps) {
  // The key causes React to remount the form component whenever the dialog
  // opens or the stop changes, giving us fresh initial state for free.
  const formKey = open ? `${stop?.id ?? "new"}-${String(open)}` : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {stop ? `Edit ${stop.name}` : "Add a stop"}
          </DialogTitle>
        </DialogHeader>
        <StopForm
          key={formKey}
          tripId={tripId}
          stop={stop}
          chapters={chapters}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          defaultArriveDate={defaultArriveDate}
          defaultDepartDate={defaultDepartDate}
        />
      </DialogContent>
    </Dialog>
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
}: StopFormProps) {
  const isEdit = Boolean(stop);

  // Default mode: editing keeps the stop's current mode; adding starts rough.
  const initialMode: Mode = stop ? (stop.arriveDate ? "scheduled" : "rough") : "rough";
  const [mode, setMode] = React.useState<Mode>(initialMode);

  // State is initialised once from props when the component mounts.
  // The parent uses `key` to force a remount when the dialog re-opens.
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
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isPending, startTransition] = React.useTransition();

  // Auto-guess timezone when the user types a country
  function handleCountryChange(value: string) {
    setCountry(value);
    const guessed = guessTimezoneForCountry(value);
    if (guessed !== "UTC") {
      setTimezone(guessed);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

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

    startTransition(async () => {
      const result =
        isEdit && stop
          ? await updateStop(stop.id, input)
          : await createStop(tripId, input);

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
      <Field label="Place name" required error={errors.name?.[0]}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. London"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Country */}
      <Field label="Country" error={errors.country?.[0]}>
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
          <Field label="Nights (rough)" error={errors.nights?.[0]}>
            <Input
              type="number"
              min={0}
              value={nights}
              onChange={(e) => setNights(e.target.value)}
              disabled={isPending}
            />
          </Field>

          {/* Chapter */}
          <Field label="Chapter" error={errors.chapterId?.[0]}>
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
          <Field label="Timezone" required error={errors.timezone?.[0]}>
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
              error={errors.arriveDate?.[0]}
              disabled={isPending}
            />
            <DateField
              label="Depart"
              required
              value={departDate}
              onChange={(e) => setDepartDate(e.target.value)}
              min={arriveDate || tripStartDate}
              max={tripEndDate}
              error={errors.departDate?.[0]}
              disabled={isPending}
            />
          </div>
        </>
      )}

      {/* Notes */}
      <Field label="Notes" error={errors.notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this stop…"
          disabled={isPending}
        />
      </Field>

      {/* Form-level error */}
      {errors._form && (
        <p className="text-sm font-medium text-destructive">
          {errors._form[0]}
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          {isEdit ? "Save changes" : "Add stop"}
        </Button>
      </DialogFooter>
    </form>
  );
}
