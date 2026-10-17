"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlaceCombobox, type PickedPlace } from "@/components/ui/place-combobox";
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
import { TIMEZONES, UNCHOSEN_TIMEZONE, stopTimezone } from "@/lib/tz";
import { FormError } from "@/components/ui/form-error";
import { formError } from "@/components/ui/action-failure";
import { createStop, updateStop } from "@/server/actions/stops";
import type { StopInput } from "@/lib/validations/stop";
import { toPatch } from "@/lib/patch";
import type { StopPatch } from "@/lib/stop-patch";
import type { StopCardStop } from "@/components/plan/types";
import { FormDialog, useFormDirty } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { useDraftReporter } from "@/components/ui/use-draft-reporter";
import type { ActionResult } from "@/lib/action-result";
import type { ProposedStopInput } from "@/lib/booking-import/types";

const NO_CHAPTER = "__none__";
/** An edit's empty fields are clears (ADR 0075). Not the point: an unpicked place is re-geocoded, never cleared. */
const STOP_CLEARABLE = ["country", "notes", "chapterId"] as const;

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
  /**
   * ADR 0073: the Stop being edited is a dated Trip's only Stop, so it keeps
   * the Trip's dates — no Exact dates / Roughly toggle, scheduled mode only.
   */
  loneOnDatedTrip?: boolean;
  /** Booking import (Proposal mode): seeds a NEW record's fields. Ignored when editing a saved one. */
  initialValues?: Partial<ProposedStopInput>;
  /** Proposal mode: told the would-be input on every change (live preview). */
  onDraftChange?: (input: ProposedStopInput) => void;
  /** Proposal mode: replaces the create call; the save button reads "Confirm". A proposed Stop is always scheduled. */
  onSubmitOverride?: (input: ProposedStopInput) => Promise<ActionResult>;
  /** Proposal mode: a live preview card shown at the top of the form. */
  preview?: React.ReactNode;
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
  loneOnDatedTrip,
  initialValues,
  onDraftChange,
  onSubmitOverride,
  preview,
}: StopFormDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={stop ? `Edit ${stop.name}` : "Add stop"}
      recordId={stop?.id ?? null}
      size="lg"
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
        loneOnDatedTrip={loneOnDatedTrip}
        initialValues={initialValues}
        onDraftChange={onDraftChange}
        onSubmitOverride={onSubmitOverride}
        preview={preview}
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
  loneOnDatedTrip?: boolean;
  initialValues?: Partial<ProposedStopInput>;
  onDraftChange?: (input: ProposedStopInput) => void;
  onSubmitOverride?: (input: ProposedStopInput) => Promise<ActionResult>;
  preview?: React.ReactNode;
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
  loneOnDatedTrip = false,
  initialValues,
  onDraftChange,
  onSubmitOverride,
  preview,
}: StopFormProps) {
  const isEdit = Boolean(stop);
  // Booking import (Proposal mode) seeds a new Stop only; a saved one always wins.
  const proposed = stop ? undefined : initialValues;
  // ADR 0073: a dated Trip's only Stop is never rough, so its edit is
  // scheduled. A proposed Stop is scheduled too: it has the booking's dates.
  const lockedScheduled = (isEdit && loneOnDatedTrip) || Boolean(onSubmitOverride);

  // Default mode: editing keeps the stop's current mode; adding starts rough.
  const initialMode: Mode = lockedScheduled
    ? "scheduled"
    : stop ? (stop.arriveDate ? "scheduled" : "rough") : "rough";
  const [mode, setMode] = React.useState<Mode>(initialMode);

  // State is initialised once from props when the component mounts.
  // The parent uses FormDialog which keys the inner form to force a remount
  // when the dialog re-opens.
  const [name, setName] = React.useState(stop?.name ?? proposed?.name ?? "");
  const [country, setCountry] = React.useState(stop?.country ?? proposed?.country ?? "");
  const [timezone, setTimezone] = React.useState(
    stopTimezone({ timezone: stop?.timezone ?? proposed?.timezone, country: stop?.country }),
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
    stop?.arriveDate ?? proposed?.arriveDate ?? (lockedScheduled ? tripStartDate : undefined) ?? defaultArriveDate ?? "",
  );
  const [departDate, setDepartDate] = React.useState(
    stop?.departDate ?? proposed?.departDate ?? (lockedScheduled ? tripEndDate : undefined) ?? defaultDepartDate ?? "",
  );
  const [notes, setNotes] = React.useState(stop?.notes ?? proposed?.notes ?? "");
  // Spec 2026-10-06 §L: a picked place carries its point and country code to the save.
  const [picked, setPicked] = React.useState<PickedPlace | null>(null);
  useFormDirty({ mode, name, country, timezone, nights, chapterId, arriveDate, departDate, notes });
  const pickedPoint = picked
    ? { lat: picked.lat, lng: picked.lng, ...(picked.countryCode ? { countryCode: picked.countryCode } : {}) }
    : {};

  // The would-be create/update input, exactly as typed.
  function buildInput(): StopInput {
    let input: StopInput;
    if (mode === "rough") {
      const parsedNights = Number.parseInt(nights, 10);
      input = {
        mode: "rough",
        name,
        country: country.trim() || undefined,
        ...pickedPoint,
        nights: Number.isFinite(parsedNights) ? parsedNights : 0,
        notes: notes.trim() || undefined,
        ...(chapterId !== NO_CHAPTER ? { chapterId } : {}),
      };
    } else {
      input = {
        mode: "scheduled",
        name,
        country: country.trim() || undefined,
        ...pickedPoint,
        timezone,
        arriveDate,
        departDate,
        notes: notes.trim() || undefined,
      };
    }
    return input;
  }

  // Proposal mode is always scheduled (lockedScheduled), so the input is a ProposedStopInput.
  useDraftReporter(onDraftChange as ((input: StopInput) => void) | undefined, buildInput);

  const { errors, isPending, onSubmit } = useEntityForm<Record<never, never>>({
    submit: () => {
      const input = buildInput();
      if (onSubmitOverride) return onSubmitOverride(input as ProposedStopInput);
      // `toPatch` nulls only STOP_CLEARABLE's fields, each nullable in StopPatch.
      return isEdit && stop
        ? updateStop(stop.id, toPatch<StopPatch>(input, STOP_CLEARABLE) as StopPatch)
        : createStop(tripId, input, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  // A pick's zone lookup in flight; a later pick, a typed country or a
  // hand-picked zone bumps this so the lookup's answer is dropped.
  const zoneRequest = React.useRef(0);

  // Auto-guess timezone when the user types a country
  function handleCountryChange(value: string) {
    zoneRequest.current++;
    setCountry(value);
    // A hand-edited country no longer matches the picked point; drop it so
    // the save re-geocodes name + country server-side.
    setPicked(null);
    const guessed = stopTimezone({ country: value });
    if (guessed !== UNCHOSEN_TIMEZONE) setTimezone(guessed);
  }

  // A pick sets the name, country and point, and the timezone: the
  // country's at once, then the zone at the picked point once lib/tz-point
  // loads (F3). Loaded with import() so the lookup table stays out of the
  // main bundle; a failed load keeps the country's zone.
  function handlePick(p: PickedPlace) {
    setPicked(p);
    setName(p.name);
    const pickedCountry = p.region?.split(",").pop()?.trim();
    if (pickedCountry) setCountry(pickedCountry);
    const place = { countryCode: p.countryCode, country: pickedCountry };
    const tz = stopTimezone(place);
    if (tz !== UNCHOSEN_TIMEZONE) setTimezone(tz);
    const request = ++zoneRequest.current;
    import("@/lib/tz-point")
      .then(({ pointTimezone }) => {
        if (request !== zoneRequest.current) return;
        const atPoint = stopTimezone({ ...place, pointZone: pointTimezone(p.lat, p.lng) });
        if (atPoint !== UNCHOSEN_TIMEZONE) setTimezone(atPoint);
      })
      .catch(() => {});
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {preview && <div data-testid="proposal-preview">{preview}</div>}
      {/* Mode toggle — a dated Trip's only Stop has no rough mode (ADR 0073);
          nor has a proposed Stop (Booking import), which needs no explanation. */}
      {onSubmitOverride ? null : lockedScheduled ? (
        <p className="text-[13px] font-semibold text-muted-foreground">Your only Stop takes the Trip&apos;s dates. Add a second Stop to split them.</p>
      ) : (
        <Segmented
          type="single"
          value={mode}
          onValueChange={(v) => {
            if (v) setMode(v as Mode);
          }}
          aria-label="Stop type"
          disabled={isPending}
        >
          <SegmentedItem value="scheduled">Exact dates</SegmentedItem>
          <SegmentedItem value="rough">Roughly</SegmentedItem>
        </Segmented>
      )}

      {/* Place name + Country — paired from sm (spec 2026-10-05 §D). */}
      <div data-pair="place" className="grid gap-4 sm:grid-cols-2">
        {/* Name */}
        <Field label="Place name" required error={errors.name?.[0]}>
          <PlaceCombobox
            value={name}
            onValueChange={(t) => {
              setName(t);
              setPicked(null);
            }}
            onPick={handlePick}
            placeholder="e.g. London"
            aria-label="Place name"
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
      </div>

      {mode === "rough" ? (
        <div data-pair="rough" className="grid gap-4 sm:grid-cols-2">
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
        </div>
      ) : (
        <>
          {/* Timezone */}
          <Field label="Timezone" required error={errors.timezone?.[0]}>
            <Select
              value={timezone}
              onValueChange={(v) => {
                zoneRequest.current++;
                setTimezone(v);
              }}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      <FormError>{formError(errors)}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          {onSubmitOverride ? "Confirm" : isEdit ? "Save changes" : "Add stop"}
        </Button>
      </DialogFooter>
    </form>
  );
}
