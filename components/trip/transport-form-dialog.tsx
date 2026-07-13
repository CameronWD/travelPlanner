"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { TRANSPORT_MODE_LIST } from "@/lib/transport";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form-error";
import { createTransport, updateTransport } from "@/server/actions/transport";
import { parseAmountToMinor, formatMinor } from "@/lib/money";
import type { TransportCardTransport } from "./transport-card";
import type { CostRow } from "@/server/actions/costs";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { InlineCostFields } from "@/components/trip/inline-cost-fields";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StopOption {
  id: string;
  name: string;
}

interface FormErrors {
  mode?: string[];
  fromStopId?: string[];
  toStopId?: string[];
  depPlace?: string[];
  arrPlace?: string[];
  depAt?: string[];
  arrAt?: string[];
  reference?: string[];
  notes?: string[];
  estimatedMinor?: string[];
  currency?: string[];
  actualMinor?: string[];
  paidAt?: string[];
  _form?: string[];
}

export interface TransportFormDialogProps {
  tripId: string;
  stops: StopOption[];
  /** When provided, the form is in "edit" mode. */
  transport?: TransportCardTransport | null;
  /** Pre-fill fromStopId. */
  defaultFromStopId?: string;
  /** Pre-fill toStopId. */
  defaultToStopId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Fork to create the transport in (null = real plan). */
  forkId?: string | null;
  /** Trip's home currency — used as default for the cost currency picker. */
  homeCurrency?: string;
  /**
   * Existing costs on the transport (edit mode only).
   * When exactly one cost is present, the cost fields are pre-filled from it.
   * When >1 costs are present, the cost fields are hidden (CostEditor is authoritative).
   */
  costs?: CostRow[];
  /**
   * The trip's home base name. When set, a "🏠 {homeBaseName}" option is
   * rendered in the From and To stop selects.
   */
  homeBaseName?: string | null;
  /** Existing attachments for this transport (edit mode only). */
  attachments?: AttachmentView[];
}

// ---------------------------------------------------------------------------
// Dialog wrapper
// ---------------------------------------------------------------------------

export function TransportFormDialog({
  tripId,
  stops,
  transport,
  defaultFromStopId,
  defaultToStopId,
  open,
  onOpenChange,
  onSaved,
  forkId,
  homeCurrency,
  costs,
  homeBaseName,
  attachments,
}: TransportFormDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={transport ? "Edit Transport" : "Add Transport"}
      recordId={transport?.id ?? null}
    >
      <TransportForm
        tripId={tripId}
        stops={stops}
        transport={transport}
        defaultFromStopId={defaultFromStopId}
        defaultToStopId={defaultToStopId}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
        forkId={forkId}
        homeCurrency={homeCurrency}
        costs={costs}
        homeBaseName={homeBaseName}
        attachments={attachments}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Trigger buttons
// ---------------------------------------------------------------------------

export function AddTransportButton({
  tripId,
  stops,
  defaultFromStopId,
  defaultToStopId,
  label = "Add Transport",
}: {
  tripId: string;
  stops: StopOption[];
  defaultFromStopId?: string;
  defaultToStopId?: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>
      <TransportFormDialog
        tripId={tripId}
        stops={stops}
        defaultFromStopId={defaultFromStopId}
        defaultToStopId={defaultToStopId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function EditTransportButton({
  tripId,
  stops,
  transport,
}: {
  tripId: string;
  stops: StopOption[];
  transport: TransportCardTransport;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setOpen(true)}
        aria-label="Edit Transport"
        title="Edit Transport"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Button>
      <TransportFormDialog
        tripId={tripId}
        stops={stops}
        transport={transport}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

interface TransportFormProps {
  tripId: string;
  stops: StopOption[];
  transport?: TransportCardTransport | null;
  defaultFromStopId?: string;
  defaultToStopId?: string;
  onClose: () => void;
  onSaved?: () => void;
  forkId?: string | null;
  homeCurrency?: string;
  costs?: CostRow[];
  homeBaseName?: string | null;
  attachments?: AttachmentView[];
}

/** Sentinel for "none selected" in stop selects */
const NONE = "__none__";
/** Sentinel for "trip's Home base" in stop selects. Exported so callers (e.g. the
 * plan editor's "add outbound flight" prompt) can pre-select the Home base as an
 * endpoint via defaultFromStopId / defaultToStopId. */
export const HOME_ENDPOINT = "__home__";
const HOME = HOME_ENDPOINT;

/**
 * Format a Date to datetime-local input value (YYYY-MM-DDTHH:mm).
 * Uses local (wall-clock) getters so the displayed value matches what the user
 * originally entered — not the UTC equivalent.
 */
function toDatetimeLocal(dt: Date | null | undefined): string {
  if (!dt) return "";
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const h = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

function TransportForm({
  tripId,
  stops,
  transport,
  defaultFromStopId,
  defaultToStopId,
  onClose,
  onSaved,
  forkId,
  homeCurrency,
  costs,
  homeBaseName,
  attachments,
}: TransportFormProps) {
  const isEdit = Boolean(transport);

  // Determine the single existing cost (if any) for prefill.
  // When >1 costs exist the CostEditor is authoritative — hide the inline fields.
  const singleCost = costs?.length === 1 ? costs[0] : null;
  const hasMultipleCosts = (costs?.length ?? 0) > 1;

  const defaultCurrency = homeCurrency ?? "AUD";

  const [mode, setMode] = React.useState<string>(transport?.mode ?? "FLIGHT");
  const [fromStopId, setFromStopId] = React.useState(
    transport?.depIsHome ? HOME : (transport?.fromStopId ?? defaultFromStopId ?? NONE),
  );
  const [toStopId, setToStopId] = React.useState(
    transport?.arrIsHome ? HOME : (transport?.toStopId ?? defaultToStopId ?? NONE),
  );
  const [depPlace, setDepPlace] = React.useState(transport?.depPlace ?? "");
  const [arrPlace, setArrPlace] = React.useState(transport?.arrPlace ?? "");
  const [depAt, setDepAt] = React.useState(toDatetimeLocal(transport?.depAt));
  const [arrAt, setArrAt] = React.useState(toDatetimeLocal(transport?.arrAt));
  const [reference, setReference] = React.useState(transport?.reference ?? "");
  const [notes, setNotes] = React.useState(transport?.notes ?? "");

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

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: () => {
      const estimatedMinor = estimatedAmount.trim()
        ? (parseAmountToMinor(estimatedAmount, currency) ?? undefined)
        : undefined;
      const actualMinor = actualAmount.trim()
        ? (parseAmountToMinor(actualAmount, currency) ?? undefined)
        : undefined;

      // The action accepts TransportInput whose depAt/arrAt are Date | undefined
      // (after Zod coercion), but we pass raw strings from the form — Zod's
      // preprocess in transportSchema handles the coercion server-side.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input: any = {
        mode: mode as import("@/lib/enums").TransportMode,
        fromStopId: fromStopId === NONE || fromStopId === HOME ? undefined : fromStopId,
        depIsHome: fromStopId === HOME,
        toStopId: toStopId === NONE || toStopId === HOME ? undefined : toStopId,
        arrIsHome: toStopId === HOME,
        depPlace: depPlace.trim() || undefined,
        arrPlace: arrPlace.trim() || undefined,
        depAt: depAt || undefined,
        arrAt: arrAt || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(estimatedMinor !== undefined && {
          estimatedMinor,
          currency,
          actualMinor: actualMinor ?? null,
          paidAt: paidAt || null,
        }),
      };

      return isEdit && transport
        ? updateTransport(transport.id, input)
        : createTransport(tripId, input, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Mode */}
      <Field label="Mode" required error={(errors as FormErrors).mode?.[0]}>
        <Select
          value={mode}
          onValueChange={setMode}
          disabled={isPending}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {TRANSPORT_MODE_LIST.map((m) => {
              const ModeIcon = m.icon;
              return (
                <SelectItem key={m.value} value={m.value}>
                  <span className="flex items-center gap-2">
                    <ModeIcon className="size-4" aria-hidden="true" />
                    {m.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </Field>

      {/* Stop selects */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From stop" error={(errors as FormErrors).fromStopId?.[0]}>
          <Select
            value={fromStopId}
            onValueChange={setFromStopId}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="— none —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— none —</SelectItem>
              {homeBaseName ? (
                <SelectItem value={HOME}>🏠 {homeBaseName}</SelectItem>
              ) : null}
              {stops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="To stop" error={(errors as FormErrors).toStopId?.[0]}>
          <Select
            value={toStopId}
            onValueChange={setToStopId}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="— none —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— none —</SelectItem>
              {homeBaseName ? (
                <SelectItem value={HOME}>🏠 {homeBaseName}</SelectItem>
              ) : null}
              {stops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Place names */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Departure place" error={(errors as FormErrors).depPlace?.[0]}>
          <Input
            value={depPlace}
            onChange={(e) => setDepPlace(e.target.value)}
            placeholder="e.g. Heathrow T5"
            autoFocus
            disabled={isPending}
          />
        </Field>
        <Field label="Arrival place" error={(errors as FormErrors).arrPlace?.[0]}>
          <Input
            value={arrPlace}
            onChange={(e) => setArrPlace(e.target.value)}
            placeholder="e.g. CDG Terminal 2"
            disabled={isPending}
          />
        </Field>
      </div>

      {/* Times */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Departure time" error={(errors as FormErrors).depAt?.[0]}>
          <Input
            type="datetime-local"
            value={depAt}
            onChange={(e) => setDepAt(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field label="Arrival time" error={(errors as FormErrors).arrAt?.[0]}>
          <Input
            type="datetime-local"
            value={arrAt}
            onChange={(e) => setArrAt(e.target.value)}
            disabled={isPending}
          />
        </Field>
      </div>

      {/* Soft date-order warning */}
      {depAt && arrAt && depAt >= arrAt && (
        <Badge
          role="status"
          variant="warning"
          className="flex w-fit items-center gap-1 text-xs"
        >
          Departure is on or after arrival — double-check these times.
        </Badge>
      )}

      {/* Reference */}
      <Field label="Booking reference / number" error={(errors as FormErrors).reference?.[0]}>
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. BA0123 or ABC123"
          disabled={isPending}
        />
      </Field>

      {/* Notes */}
      <Field label="Notes" error={(errors as FormErrors).notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this leg…"
          disabled={isPending}
        />
      </Field>

      {/* Attachments */}
      <Field label="Attachments">
        {transport?.id ? (
          <AttachmentList
            tripId={tripId}
            targetType="TRANSPORT"
            targetId={transport.id}
            attachments={attachments ?? []}
            compact
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Save this transport first, then reopen it to attach files.
          </p>
        )}
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
          {isEdit ? "Save changes" : "Add Transport"}
        </Button>
      </DialogFooter>
    </form>
  );
}
