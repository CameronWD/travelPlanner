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
import type { StopCardStop } from "./stop-card";

interface FormErrors {
  name?: string[];
  country?: string[];
  timezone?: string[];
  arriveDate?: string[];
  departDate?: string[];
  notes?: string[];
  _form?: string[];
}

export interface StopFormDialogProps {
  tripId: string;
  /** When provided, the form is in "edit" mode for this stop. */
  stop?: StopCardStop | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save. */
  onSaved?: () => void;
}

/**
 * Dialog with a form for creating or editing a Stop.
 *
 * Uses a `key` on the inner form to reset all controlled state whenever the
 * dialog opens or the target stop changes — avoids setState-in-effect lint errors.
 */
export function StopFormDialog({
  tripId,
  stop,
  open,
  onOpenChange,
  onSaved,
}: StopFormDialogProps) {
  // The key causes React to remount the form component whenever the dialog
  // opens or the stop changes, giving us fresh initial state for free.
  const formKey = open ? `${stop?.id ?? "new"}-${String(open)}` : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {stop ? `Edit ${stop.name}` : "Add a stop"}
          </DialogTitle>
        </DialogHeader>
        <StopForm
          key={formKey}
          tripId={tripId}
          stop={stop}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form (remounts on key change — state initialised from props once)
// ---------------------------------------------------------------------------

interface StopFormProps {
  tripId: string;
  stop?: StopCardStop | null;
  onClose: () => void;
  onSaved?: () => void;
}

function StopForm({ tripId, stop, onClose, onSaved }: StopFormProps) {
  const isEdit = Boolean(stop);

  // State is initialised once from props when the component mounts.
  // The parent uses `key` to force a remount when the dialog re-opens.
  const [name, setName] = React.useState(stop?.name ?? "");
  const [country, setCountry] = React.useState(stop?.country ?? "");
  const [timezone, setTimezone] = React.useState(
    stop?.timezone ?? guessTimezoneForCountry(stop?.country) ?? "UTC",
  );
  const [arriveDate, setArriveDate] = React.useState(stop?.arriveDate ?? "");
  const [departDate, setDepartDate] = React.useState(stop?.departDate ?? "");
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

    const input = {
      name,
      country: country.trim() || undefined,
      timezone,
      arriveDate,
      departDate,
      notes: notes.trim() || undefined,
    };

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
          error={errors.arriveDate?.[0]}
          disabled={isPending}
        />
        <DateField
          label="Depart"
          required
          value={departDate}
          onChange={(e) => setDepartDate(e.target.value)}
          min={arriveDate}
          error={errors.departDate?.[0]}
          disabled={isPending}
        />
      </div>

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
