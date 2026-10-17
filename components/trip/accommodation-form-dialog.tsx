"use client";

import * as React from "react";
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
import { formError } from "@/components/ui/action-failure";
import { accommodationDateWarnings } from "@/lib/accommodation-dates";
import {
  createAccommodation,
  updateAccommodation,
} from "@/server/actions/accommodation";
import type { AccommodationCardAccommodation } from "./accommodation-card";
import type { CostRow } from "@/server/actions/costs";
import { FormDialog, useFormDirty } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { InlineCostFields } from "@/components/money/cost-fields/inline-cost-fields";
import { useCostFields } from "@/components/money/cost-fields/use-cost-fields";
import { seedCostFormState } from "@/lib/money/cost-form-state";
import { fail, type ActionResult } from "@/lib/action-result";
import { toPatch } from "@/lib/patch";
import { BookingStateField, seedFromProposal, useBookingStateField } from "./booking-state-field";
import type { ProposedAccommodationInput } from "@/lib/booking-import/types";
import { useDraftReporter } from "@/components/ui/use-draft-reporter";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


export interface AccommodationFormDialogProps {
  /** The trip this accommodation belongs to (needed for AttachmentList). */
  tripId?: string;
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
  /** Existing attachments for this accommodation (edit mode only). */
  attachments?: AttachmentView[];
  /** Booking import (Proposal mode): seeds a NEW record's fields. Ignored when editing a saved one. */
  initialValues?: Partial<ProposedAccommodationInput>;
  /** Proposal mode: told the would-be input on every change (live preview). */
  onDraftChange?: (input: ProposedAccommodationInput) => void;
  /** Proposal mode: replaces the create call; the save button reads "Confirm". */
  onSubmitOverride?: (input: ProposedAccommodationInput) => Promise<ActionResult>;
  /** Proposal mode: a live preview card shown at the top of the form. */
  preview?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

export function AccommodationFormDialog({
  tripId,
  stopId,
  stopDateRange,
  accommodation,
  open,
  onOpenChange,
  onSaved,
  forkId,
  homeCurrency,
  costs,
  attachments,
  initialValues,
  onDraftChange,
  onSubmitOverride,
  preview,
}: AccommodationFormDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={accommodation ? `Edit ${accommodation.name}` : "Add Accommodation"}
      recordId={accommodation?.id ?? null}
      size="lg"
    >
      <AccommodationForm
        tripId={tripId}
        stopId={stopId}
        stopDateRange={stopDateRange}
        accommodation={accommodation}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
        forkId={forkId}
        homeCurrency={homeCurrency}
        costs={costs}
        attachments={attachments}
        initialValues={initialValues}
        onDraftChange={onDraftChange}
        onSubmitOverride={onSubmitOverride}
        preview={preview}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

interface AccommodationFormProps {
  tripId?: string;
  stopId: string;
  stopDateRange: { arriveDate: string; departDate: string };
  accommodation?: AccommodationCardAccommodation | null;
  onClose: () => void;
  onSaved?: () => void;
  forkId?: string | null;
  homeCurrency?: string;
  costs?: CostRow[];
  attachments?: AttachmentView[];
  initialValues?: Partial<ProposedAccommodationInput>;
  onDraftChange?: (input: ProposedAccommodationInput) => void;
  onSubmitOverride?: (input: ProposedAccommodationInput) => Promise<ActionResult>;
  preview?: React.ReactNode;
}

/** An edit's empty fields are clears (ADR 0075). The Cost's paid date: an un-ticked Paid. */
// `bookingState` is deliberately absent: a null would hand a choice back to automatic; an un-chosen state is simply not sent.
const ACCOMMODATION_CLEARABLE = ["address", "checkInTime", "checkOutTime", "confirmation", "notes", "paidAt", "bookBy"] as const;

function AccommodationForm({
  tripId,
  stopId,
  stopDateRange,
  accommodation,
  onClose,
  onSaved,
  forkId,
  homeCurrency,
  costs,
  attachments,
  initialValues,
  onDraftChange,
  onSubmitOverride,
  preview,
}: AccommodationFormProps) {
  const isEdit = Boolean(accommodation);
  // Booking import (Proposal mode) seeds a new stay only; a saved one always wins.
  const proposed = accommodation ? undefined : initialValues;

  // Determine the single existing cost (if any) for prefill.
  // When >1 costs exist the CostEditor is authoritative — hide the inline fields.
  const singleCost = costs?.length === 1 ? costs[0] : null;
  const hasMultipleCosts = (costs?.length ?? 0) > 1;

  const defaultCurrency = homeCurrency ?? "AUD";

  const [name, setName] = React.useState(accommodation?.name ?? proposed?.name ?? "");
  const [address, setAddress] = React.useState(accommodation?.address ?? proposed?.address ?? "");
  const [checkIn, setCheckIn] = React.useState(
    accommodation?.checkIn ?? proposed?.checkIn ?? stopDateRange.arriveDate,
  );
  const [checkOut, setCheckOut] = React.useState(
    accommodation?.checkOut ?? proposed?.checkOut ?? stopDateRange.departDate,
  );
  const [checkInTime, setCheckInTime] = React.useState(accommodation?.checkInTime ?? proposed?.checkInTime ?? "");
  const [checkOutTime, setCheckOutTime] = React.useState(accommodation?.checkOutTime ?? proposed?.checkOutTime ?? "");
  const [confirmation, setConfirmation] = React.useState(
    accommodation?.confirmation ?? proposed?.confirmation ?? "",
  );
  const bookingField = useBookingStateField("ACCOMMODATION", accommodation ?? seedFromProposal(proposed), confirmation);
  const [notes, setNotes] = React.useState(accommodation?.notes ?? proposed?.notes ?? "");

  // Inline cost fields: a saved single Cost, else a Proposal's Cost (Booking
  // import), else empty — the rules are lib/money/cost-form-state.ts's (card 2.I).
  const [costSeed] = React.useState(() => seedCostFormState(singleCost, proposed, defaultCurrency));
  const cost = useCostFields(costSeed);

  useFormDirty({ name, address, checkIn, checkOut, checkInTime, checkOutTime, confirmation, bookingState: bookingField.dirtyValues, notes, cost: cost.dirtyValues });

  // Soft warnings (reactive, non-blocking)
  const dateWarnings: string[] = [];
  if (checkIn && checkOut) {
    if (checkOut <= checkIn) {
      dateWarnings.push(
        "Check-out is on or before check-in. Double-check these dates.",
      );
    } else {
      dateWarnings.push(
        ...accommodationDateWarnings({ checkIn, checkOut }, stopDateRange),
      );
    }
  }

  // The would-be create/update input, exactly as typed.
  function buildInput() {
    const c = cost.payload();

    const input = {
      stopId,
      name,
      address: address.trim() || undefined,
      checkIn,
      checkOut,
      ...(checkInTime ? { checkInTime } : {}),
      ...(checkOutTime ? { checkOutTime } : {}),
      confirmation: confirmation.trim() || undefined,
      ...bookingField.payload(),
      notes: notes.trim() || undefined,
      // An invalid Cost is left out of the draft; submit refuses it first.
      ...(c.kind === "ok" && c.fields),
    };
    return input;
  }

  useDraftReporter(onDraftChange, buildInput);

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: async () => {
      const c = cost.payload();
      if (c.kind === "invalid") return fail(c.errors);
      const input = buildInput();
      if (onSubmitOverride) return onSubmitOverride(input);
      return isEdit && accommodation
        ? updateAccommodation(accommodation.id, toPatch(input, ACCOMMODATION_CLEARABLE))
        : createAccommodation(input, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-x-4">
      {preview && <div data-testid="proposal-preview" className="sm:col-span-2">{preview}</div>}
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

      {/* Address + Booking confirmation — own sub-grid so they always pair. */}
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <Field label="Address" error={errors.address?.[0]}>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 123 Main Street"
            disabled={isPending}
          />
        </Field>

        <Field label="Booking confirmation" error={errors.confirmation?.[0]}>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="e.g. BOOKING-ABC123"
            disabled={isPending}
          />
        </Field>
      </div>

      {/* Booking state (CONTEXT.md): a stay is To book; a confirmation implies Booked until the Traveller picks. */}
      <BookingStateField field={bookingField} errors={errors} disabled={isPending} className="sm:col-span-2" />

      {/* Dates — own sub-grid so they always pair. */}
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
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

      {/* Times — own sub-grid so they always pair. */}
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <Field label="Check-in time" error={errors.checkInTime?.[0]}>
          <Input
            type="time"
            value={checkInTime}
            onChange={(e) => setCheckInTime(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field label="Check-out time" error={errors.checkOutTime?.[0]}>
          <Input
            type="time"
            value={checkOutTime}
            onChange={(e) => setCheckOutTime(e.target.value)}
            disabled={isPending}
          />
        </Field>
      </div>

      {/* Soft date warnings */}
      {dateWarnings.length > 0 && (
        <div className="sm:col-span-2 flex flex-col gap-1">
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

      {/* Notes */}
      <Field label="Notes" error={errors.notes?.[0]} className="sm:col-span-2">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this stay…"
          disabled={isPending}
        />
      </Field>

      {/* Attachments */}
      <Field label="Attachments" className="sm:col-span-2">
        {accommodation?.id && tripId ? (
          <AttachmentList
            tripId={tripId}
            targetType="ACCOMMODATION"
            targetId={accommodation.id}
            attachments={attachments ?? []}
            compact
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Save this accommodation first, then reopen it to attach files.
          </p>
        )}
      </Field>

      {/* Inline cost — hidden when >1 costs exist (CostEditor is authoritative) */}
      <div className="sm:col-span-2 flex flex-col gap-4">
        <InlineCostFields
          {...cost.fieldProps}
          hasMultipleCosts={hasMultipleCosts}
          errors={errors}
          disabled={isPending}
          paired
        />
      </div>

      <div className="sm:col-span-2">
        <FormError>{formError(errors)}</FormError>
      </div>

      <DialogFooter className="sm:col-span-2">
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          {onSubmitOverride ? "Confirm" : isEdit ? "Save changes" : "Add Accommodation"}
        </Button>
      </DialogFooter>
    </form>
  );
}
