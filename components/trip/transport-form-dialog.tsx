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
import { resolveEndpointZones, instantToWallTimeInput } from "@/lib/time-display";
import { zonedWallTimeToInstant } from "@/lib/tz";
import type { TransportCardTransport } from "./transport-card";
import type { CostRow } from "@/server/actions/costs";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { InlineCostFields } from "@/components/trip/inline-cost-fields";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { LocationCombobox, type LocationValue } from "@/components/trip/location-combobox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StopOption {
  id: string;
  name: string;
  timezone?: string | null;
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
  costMinor?: string[];
  currency?: string[];
  paidMinor?: string[];
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
  /** Pre-fill anchorStopId (the slot this leg will render under). */
  defaultAnchorStopId?: string;
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
  defaultAnchorStopId,
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
        defaultAnchorStopId={defaultAnchorStopId}
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
  defaultAnchorStopId?: string;
  onClose: () => void;
  onSaved?: () => void;
  forkId?: string | null;
  homeCurrency?: string;
  costs?: CostRow[];
  homeBaseName?: string | null;
  attachments?: AttachmentView[];
}

/** Sentinel for "trip's Home base" in endpoint comboboxes. Exported so callers
 * (e.g. the plan editor's "add outbound flight" prompt) can pre-select the Home
 * base as an endpoint via defaultFromStopId / defaultToStopId. */
export const HOME_ENDPOINT = "__home__";

/**
 * Sentinel value for the "Before {firstStop}" head option in the Position in
 * plan picker. Radix Select disallows empty-string item values, so we use this
 * non-empty string and map it to "" (no explicit anchor) on submit.
 */
const HEAD_SENTINEL = "__head__";

function TransportForm({
  tripId,
  stops,
  transport,
  defaultFromStopId,
  defaultToStopId,
  defaultAnchorStopId,
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

  // Derive initial LocationValue for From endpoint
  const initialFrom = React.useMemo((): LocationValue => {
    if (isEdit && transport) {
      if (transport.depIsHome) return { kind: "home" };
      if (transport.fromStopId) {
        const stop = stops.find((s) => s.id === transport.fromStopId);
        return { kind: "stop", stopId: transport.fromStopId, name: stop?.name ?? transport.fromStopId };
      }
      if (transport.depPlace) return { kind: "place", name: transport.depPlace };
      return { kind: "none" };
    }
    // Add mode
    if (defaultFromStopId === HOME_ENDPOINT) return { kind: "home" };
    if (defaultFromStopId) {
      const stop = stops.find((s) => s.id === defaultFromStopId);
      return { kind: "stop", stopId: defaultFromStopId, name: stop?.name ?? defaultFromStopId };
    }
    return { kind: "none" };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive initial LocationValue for To endpoint
  const initialTo = React.useMemo((): LocationValue => {
    if (isEdit && transport) {
      if (transport.arrIsHome) return { kind: "home" };
      if (transport.toStopId) {
        const stop = stops.find((s) => s.id === transport.toStopId);
        return { kind: "stop", stopId: transport.toStopId, name: stop?.name ?? transport.toStopId };
      }
      if (transport.arrPlace) return { kind: "place", name: transport.arrPlace };
      return { kind: "none" };
    }
    // Add mode
    if (defaultToStopId === HOME_ENDPOINT) return { kind: "home" };
    if (defaultToStopId) {
      const stop = stops.find((s) => s.id === defaultToStopId);
      return { kind: "stop", stopId: defaultToStopId, name: stop?.name ?? defaultToStopId };
    }
    return { kind: "none" };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [fromValue, setFromValue] = React.useState<LocationValue>(initialFrom);
  const [toValue, setToValue] = React.useState<LocationValue>(initialTo);

  // anchorStopId: in edit mode this is controlled by the Position in plan
  // picker; in add mode it is seeded from defaultAnchorStopId and never shown.
  const [anchorStopId, setAnchorStopId] = React.useState<string>(
    transport?.anchorStopId ?? defaultAnchorStopId ?? "",
  );
  // Render the stored instants in the endpoint stops' own timezones (P0-1
  // client) — not the device's local timezone — so editing shows back what
  // was typed, even when the device and the leg are in different zones.
  const initialZones = resolveEndpointZones(
    stops.find((s) => s.id === transport?.fromStopId)?.timezone ?? null,
    stops.find((s) => s.id === transport?.toStopId)?.timezone ?? null,
  );
  const [depAt, setDepAt] = React.useState(instantToWallTimeInput(transport?.depAt, initialZones.depTz));
  const [arrAt, setArrAt] = React.useState(instantToWallTimeInput(transport?.arrAt, initialZones.arrTz));
  const [reference, setReference] = React.useState(transport?.reference ?? "");
  const [notes, setNotes] = React.useState(transport?.notes ?? "");

  // Inline cost fields
  const [costAmount, setCostAmount] = React.useState(
    singleCost ? formatMinor(singleCost.costMinor, singleCost.currency) : "",
  );
  const [currency, setCurrency] = React.useState(
    singleCost?.currency ?? defaultCurrency,
  );
  const [paidAmount, setPaidAmount] = React.useState(
    singleCost && singleCost.paidMinor !== null && singleCost.paidMinor !== undefined
      ? formatMinor(singleCost.paidMinor, singleCost.currency)
      : "",
  );
  const [paidAt, setPaidAt] = React.useState(
    singleCost?.paidAt ? new Date(singleCost.paidAt).toISOString().slice(0, 10) : "",
  );
  // Seeded from the existing cost so editing a paid Cost opens with the box
  // ticked (ADR 0037). `paidAt` is the sole "is this paid" signal — a legacy
  // row with a paid amount but no date is NOT paid (see CONTEXT.md "Paid").
  const [paid, setPaid] = React.useState(Boolean(singleCost?.paidAt));

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: () => {
      const costMinor = costAmount.trim()
        ? (parseAmountToMinor(costAmount, currency) ?? undefined)
        : undefined;
      // Gated on the amount actually *parsing*, not just being non-blank —
      // a pasted "$150.00" or a lone "-" is non-blank text but parses to
      // null, and un-ticking Paid (or ticking it and then clearing/breaking
      // the amount) must all clear the payment. The invariant is
      // one-directional (ADR 0037): a paid *date* requires an amount, but an
      // amount with no date is a legal, honest, incomplete record — so we
      // never invent a date here. `todayISO()` is only used for the
      // interactive pre-fill in InlineCostFields, where the user can see and
      // edit it before saving; it is never fabricated at submit time.
      const parsedPaidMinor = paid ? parseAmountToMinor(paidAmount, currency) : null;
      const hasPaidAmount = parsedPaidMinor !== null;

      // depAt/arrAt stay offset-less "YYYY-MM-DDTHH:mm" wall-time strings —
      // we submit the raw datetime-local value exactly as typed; the server
      // converts it to an instant using the endpoint stop's timezone
      // (things-to-fix P0-1). Never coerce these to Date here.
      // Map LocationValue → endpoint fields for From
      const fromFields = (() => {
        switch (fromValue.kind) {
          case "home":
            return { fromStopId: undefined, depIsHome: true, depPlace: undefined };
          case "stop":
            return { fromStopId: fromValue.stopId, depIsHome: false, depPlace: undefined };
          case "place":
            return { fromStopId: undefined, depIsHome: false, depPlace: fromValue.name };
          default:
            return { fromStopId: undefined, depIsHome: false, depPlace: undefined };
        }
      })();

      // Map LocationValue → endpoint fields for To
      const toFields = (() => {
        switch (toValue.kind) {
          case "home":
            return { toStopId: undefined, arrIsHome: true, arrPlace: undefined };
          case "stop":
            return { toStopId: toValue.stopId, arrIsHome: false, arrPlace: undefined };
          case "place":
            return { toStopId: undefined, arrIsHome: false, arrPlace: toValue.name };
          default:
            return { toStopId: undefined, arrIsHome: false, arrPlace: undefined };
        }
      })();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input: any = {
        mode: mode as import("@/lib/enums").TransportMode,
        ...fromFields,
        ...toFields,
        depAt: depAt || undefined,
        arrAt: arrAt || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        anchorStopId: anchorStopId === HEAD_SENTINEL ? "" : (anchorStopId || undefined),
        ...(costMinor !== undefined && {
          costMinor,
          currency,
          // Un-ticking (or breaking) Paid must never clear the paid amount —
          // it survives as history (CONTEXT.md "Paid") — so we omit
          // paidMinor entirely rather than sending null. Only the date is
          // explicitly cleared.
          paidMinor: hasPaidAmount ? parsedPaidMinor : undefined,
          paidAt: hasPaidAmount ? paidAt || null : null,
        }),
      };

      return isEdit && transport
        ? updateTransport(transport.id, input)
        : createTransport(tripId, input, forkId ?? undefined);
    },
    onClose,
    onSaved,
  });

  // Soft date-order warning: compare real instants in the *currently
  // selected* endpoints' timezones, not the raw datetime-local strings — a
  // cross-zone leg can have an earlier wall-clock arrival string while still
  // landing later in absolute time (things-to-fix P0-1).
  const currentZones = resolveEndpointZones(
    fromValue.kind === "stop" ? (stops.find((s) => s.id === fromValue.stopId)?.timezone ?? null) : null,
    toValue.kind === "stop" ? (stops.find((s) => s.id === toValue.stopId)?.timezone ?? null) : null,
  );
  const depInstant = depAt ? zonedWallTimeToInstant(depAt.slice(0, 10), depAt.slice(11, 16), currentZones.depTz) : null;
  const arrInstant = arrAt ? zonedWallTimeToInstant(arrAt.slice(0, 10), arrAt.slice(11, 16), currentZones.arrTz) : null;

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

      {/* Location comboboxes — replace From/To stop selects + place inputs */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" error={(errors as FormErrors).fromStopId?.[0]}>
          <LocationCombobox
            label="From"
            value={fromValue}
            onChange={setFromValue}
            stops={stops}
            homeBaseName={homeBaseName}
            tripId={tripId}
            disabled={isPending}
            data-testid="from-combobox"
          />
        </Field>

        <Field label="To" error={(errors as FormErrors).toStopId?.[0]}>
          <LocationCombobox
            label="To"
            value={toValue}
            onChange={setToValue}
            stops={stops}
            homeBaseName={homeBaseName}
            tripId={tripId}
            disabled={isPending}
            data-testid="to-combobox"
          />
        </Field>
      </div>

      {/* Position in plan — edit mode only */}
      {isEdit && (
        <Field label="Position in plan">
          <Select
            value={anchorStopId === "" ? HEAD_SENTINEL : anchorStopId}
            onValueChange={setAnchorStopId}
            disabled={isPending}
          >
            <SelectTrigger aria-label="Position in plan">
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              {stops.length > 0 && (
                <SelectItem value={HEAD_SENTINEL}>
                  Before {stops[0].name}
                </SelectItem>
              )}
              {stops.map((stop) => (
                <SelectItem key={stop.id} value={stop.id}>
                  After {stop.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

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
      {depInstant && arrInstant && depInstant >= arrInstant && (
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
        costAmount={costAmount}
        onCostChange={setCostAmount}
        currency={currency}
        onCurrencyChange={setCurrency}
        paid={paid}
        onPaidChange={setPaid}
        paidAmount={paidAmount}
        onPaidAmountChange={setPaidAmount}
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
