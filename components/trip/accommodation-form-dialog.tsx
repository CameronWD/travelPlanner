"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import {
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form-error";
import { accommodationDateWarnings } from "@/lib/validations/accommodation";
import {
  createAccommodation,
  updateAccommodation,
} from "@/server/actions/accommodation";
import { formatMinor, parseAmountToMinor } from "@/lib/money";
import type { AccommodationCardAccommodation } from "./accommodation-card";
import type { CostRow } from "@/server/actions/costs";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { InlineCostFields } from "@/components/trip/inline-cost-fields";

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
  estimatedMinor?: string[];
  currency?: string[];
  actualMinor?: string[];
  paidAt?: string[];
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
  /** Fork to create the accommodation in (null = real plan). */
  forkId?: string | null;
  /** Trip's home currency — used as default for the cost currency picker. */
  homeCurrency?: string;
  /**
   * Existing costs on the accommodation (edit mode only).
   * When exactly one cost is present, the cost fields are pre-filled from it.
   * When >1 costs are present, the cost fields are hidden (CostEditor is authoritative).
   */
  costs?: CostRow[];
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
  forkId,
  homeCurrency,
  costs,
}: AccommodationFormDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={accommodation ? `Edit ${accommodation.name}` : "Add accommodation"}
      recordId={accommodation?.id ?? null}
    >
      <AccommodationForm
        stopId={stopId}
        stopDateRange={stopDateRange}
        accommodation={accommodation}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
        forkId={forkId}
        homeCurrency={homeCurrency}
        costs={costs}
      />
    </FormDialog>
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
  forkId?: string | null;
  homeCurrency?: string;
  costs?: CostRow[];
}

function AccommodationForm({
  stopId,
  stopDateRange,
  accommodation,
  onClose,
  onSaved,
  forkId,
  homeCurrency,
  costs,
}: AccommodationFormProps) {
  const isEdit = Boolean(accommodation);

  // Determine the single existing cost (if any) for prefill.
  // When >1 costs exist the CostEditor is authoritative — hide the inline fields.
  const singleCost = costs?.length === 1 ? costs[0] : null;
  const hasMultipleCosts = (costs?.length ?? 0) > 1;

  const defaultCurrency = homeCurrency ?? "AUD";

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

  // Inline cost fields
  const [estimatedAmount, setEstimatedAmount] = React.useState(
    singleCost ? formatMinor(singleCost.estimatedMinor, singleCost.currency) : "",
  );
  const [currency, setCurrency] = React.useState(
    singleCost?.currency ?? defaultCurrency,
  );
  const [actualAmount, setActualAmount] = React.useState(
    singleCost && singleCost.actualMinor !== null && singleCost.actualMinor !== undefined
      ? formatMinor(singleCost.actualMinor, singleCost.currency)
      : "",
  );
  const [paidAt, setPaidAt] = React.useState(
    singleCost?.paidAt ? new Date(singleCost.paidAt).toISOString().slice(0, 10) : "",
  );

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

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: () => {
      const estimatedMinor = estimatedAmount.trim()
        ? (parseAmountToMinor(estimatedAmount, currency) ?? undefined)
        : undefined;
      const actualMinor = actualAmount.trim()
        ? (parseAmountToMinor(actualAmount, currency) ?? undefined)
        : undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input: any = {
        stopId,
        name,
        address: address.trim() || undefined,
        checkIn,
        checkOut,
        confirmation: confirmation.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(estimatedMinor !== undefined && {
          estimatedMinor,
          currency,
          actualMinor: actualMinor ?? null,
          paidAt: paidAt || null,
        }),
      };

      return isEdit && accommodation
        ? updateAccommodation(accommodation.id, input)
        : createAccommodation(input, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Name */}
      <Field label="Accommodation name" required error={(errors as FormErrors).name?.[0]}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Hilton Garden Inn"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Address */}
      <Field label="Address" error={(errors as FormErrors).address?.[0]}>
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
          error={(errors as FormErrors).checkIn?.[0]}
          disabled={isPending}
        />
        <DateField
          label="Check-out"
          required
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          min={checkIn}
          error={(errors as FormErrors).checkOut?.[0]}
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
      <Field label="Booking confirmation" error={(errors as FormErrors).confirmation?.[0]}>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="e.g. BOOKING-ABC123"
          disabled={isPending}
        />
      </Field>

      {/* Notes */}
      <Field label="Notes" error={(errors as FormErrors).notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this stay…"
          disabled={isPending}
        />
      </Field>

      {/* Inline cost — hidden when >1 costs exist (CostEditor is authoritative) */}
      <InlineCostFields
        hasMultipleCosts={hasMultipleCosts}
        estimatedAmount={estimatedAmount}
        onEstimatedChange={setEstimatedAmount}
        currency={currency}
        onCurrencyChange={setCurrency}
        actualAmount={actualAmount}
        onActualChange={setActualAmount}
        paidAt={paidAt}
        onPaidAtChange={setPaidAt}
        errors={errors}
        disabled={isPending}
      />

      <FormError>{(errors as FormErrors)._form?.[0]}</FormError>

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
