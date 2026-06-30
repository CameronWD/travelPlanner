"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { accommodationDateWarnings } from "@/lib/validations/accommodation";
import {
  createAccommodation,
  updateAccommodation,
} from "@/server/actions/accommodation";
import type { AccommodationCardAccommodation } from "./accommodation-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormErrors {
  stopId?: string[];
  name?: string[];
  address?: string[];
  checkIn?: string[];
  checkOut?: string[];
  confirmation?: string[];
  notes?: string[];
  _form?: string[];
}

export interface AccommodationFormDialogProps {
  /** The stop this accommodation belongs to. */
  stopId: string;
  /** Stop date range for defaulting and warning display. */
  stopDateRange: { arriveDate: string; departDate: string };
  /** When provided, form is in edit mode. */
  accommodation?: AccommodationCardAccommodation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

export function AccommodationFormDialog({
  stopId,
  stopDateRange,
  accommodation,
  open,
  onOpenChange,
  onSaved,
}: AccommodationFormDialogProps) {
  const formKey = open
    ? `${accommodation?.id ?? "new"}-${String(open)}`
    : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {accommodation ? `Edit ${accommodation.name}` : "Add accommodation"}
          </DialogTitle>
        </DialogHeader>
        <AccommodationForm
          key={formKey}
          stopId={stopId}
          stopDateRange={stopDateRange}
          accommodation={accommodation}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Trigger buttons
// ---------------------------------------------------------------------------

export function AddAccommodationButton({
  stopId,
  stopDateRange,
}: {
  stopId: string;
  stopDateRange: { arriveDate: string; departDate: string };
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Add accommodation
      </Button>
      <AccommodationFormDialog
        stopId={stopId}
        stopDateRange={stopDateRange}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function EditAccommodationButton({
  stopId,
  stopDateRange,
  accommodation,
}: {
  stopId: string;
  stopDateRange: { arriveDate: string; departDate: string };
  accommodation: AccommodationCardAccommodation;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${accommodation.name}`}
        title="Edit accommodation"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Button>
      <AccommodationFormDialog
        stopId={stopId}
        stopDateRange={stopDateRange}
        accommodation={accommodation}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

interface AccommodationFormProps {
  stopId: string;
  stopDateRange: { arriveDate: string; departDate: string };
  accommodation?: AccommodationCardAccommodation | null;
  onClose: () => void;
  onSaved?: () => void;
}

function AccommodationForm({
  stopId,
  stopDateRange,
  accommodation,
  onClose,
  onSaved,
}: AccommodationFormProps) {
  const isEdit = Boolean(accommodation);

  const [name, setName] = React.useState(accommodation?.name ?? "");
  const [address, setAddress] = React.useState(accommodation?.address ?? "");
  const [checkIn, setCheckIn] = React.useState(
    accommodation?.checkIn ?? stopDateRange.arriveDate,
  );
  const [checkOut, setCheckOut] = React.useState(
    accommodation?.checkOut ?? stopDateRange.departDate,
  );
  const [confirmation, setConfirmation] = React.useState(
    accommodation?.confirmation ?? "",
  );
  const [notes, setNotes] = React.useState(accommodation?.notes ?? "");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isPending, startTransition] = React.useTransition();

  // Soft warnings (reactive, non-blocking)
  const dateWarnings: string[] = [];
  if (checkIn && checkOut) {
    if (checkOut <= checkIn) {
      dateWarnings.push(
        "Check-out is on or before check-in — double-check these dates.",
      );
    } else {
      dateWarnings.push(
        ...accommodationDateWarnings({ checkIn, checkOut }, stopDateRange),
      );
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const input = {
      stopId,
      name,
      address: address.trim() || undefined,
      checkIn,
      checkOut,
      confirmation: confirmation.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      const result =
        isEdit && accommodation
          ? await updateAccommodation(accommodation.id, input)
          : await createAccommodation(input);

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
      <Field label="Accommodation name" required error={errors.name?.[0]}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Hilton Garden Inn"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Address */}
      <Field label="Address" error={errors.address?.[0]}>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 123 Main Street"
          disabled={isPending}
        />
      </Field>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <DateField
          label="Check-in"
          required
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          error={errors.checkIn?.[0]}
          disabled={isPending}
        />
        <DateField
          label="Check-out"
          required
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          min={checkIn}
          error={errors.checkOut?.[0]}
          disabled={isPending}
        />
      </div>

      {/* Soft date warnings */}
      {dateWarnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {dateWarnings.map((w) => (
            <Badge
              key={w}
              role="status"
              variant="warning"
              className="flex w-fit items-center gap-1 text-xs"
            >
              {w}
            </Badge>
          ))}
        </div>
      )}

      {/* Confirmation */}
      <Field label="Booking confirmation" error={errors.confirmation?.[0]}>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="e.g. BOOKING-ABC123"
          disabled={isPending}
        />
      </Field>

      {/* Notes */}
      <Field label="Notes" error={errors.notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this stay…"
          disabled={isPending}
        />
      </Field>

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
          {isEdit ? "Save changes" : "Add accommodation"}
        </Button>
      </DialogFooter>
    </form>
  );
}
