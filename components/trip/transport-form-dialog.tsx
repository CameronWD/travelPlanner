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
import { LocationCombobox, type LocationValue } from "@/components/trip/location-combobox";

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

/** Sentinel for "trip's Home base" in stop selects. Exported so callers (e.g. the
 * plan editor's "add outbound flight" prompt) can pre-select the Home base as an
 * endpoint via defaultFromStopId / defaultToStopId. */
export const HOME_ENDPOINT = "__home__";

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
