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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { TRANSPORT_MODE_LIST } from "@/lib/transport";
import { Badge } from "@/components/ui/badge";
import { createTransport, updateTransport } from "@/server/actions/transport";
import type { TransportCardTransport } from "./transport-card";

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
}: TransportFormDialogProps) {
  const formKey = open ? `${transport?.id ?? "new"}-${String(open)}` : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {transport ? "Edit transport" : "Add transport"}
          </DialogTitle>
        </DialogHeader>
        <TransportForm
          key={formKey}
          tripId={tripId}
          stops={stops}
          transport={transport}
          defaultFromStopId={defaultFromStopId}
          defaultToStopId={defaultToStopId}
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

export function AddTransportButton({
  tripId,
  stops,
  defaultFromStopId,
  defaultToStopId,
  label = "Add transport",
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
        aria-label="Edit transport"
        title="Edit transport"
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
}

/** Sentinel for "none selected" in stop selects */
const NONE = "__none__";

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
}: TransportFormProps) {
  const isEdit = Boolean(transport);

  const [mode, setMode] = React.useState<string>(transport?.mode ?? "FLIGHT");
  const [fromStopId, setFromStopId] = React.useState(
    transport?.fromStopId ?? defaultFromStopId ?? NONE,
  );
  const [toStopId, setToStopId] = React.useState(
    transport?.toStopId ?? defaultToStopId ?? NONE,
  );
  const [depPlace, setDepPlace] = React.useState(transport?.depPlace ?? "");
  const [arrPlace, setArrPlace] = React.useState(transport?.arrPlace ?? "");
  const [depAt, setDepAt] = React.useState(toDatetimeLocal(transport?.depAt));
  const [arrAt, setArrAt] = React.useState(toDatetimeLocal(transport?.arrAt));
  const [reference, setReference] = React.useState(transport?.reference ?? "");
  const [notes, setNotes] = React.useState(transport?.notes ?? "");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    // The action accepts TransportInput whose depAt/arrAt are Date | undefined
    // (after Zod coercion), but we pass raw strings from the form — Zod's
    // preprocess in transportSchema handles the coercion server-side.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any = {
      mode: mode as import("@/lib/enums").TransportMode,
      fromStopId: fromStopId === NONE ? undefined : fromStopId,
      toStopId: toStopId === NONE ? undefined : toStopId,
      depPlace: depPlace.trim() || undefined,
      arrPlace: arrPlace.trim() || undefined,
      depAt: depAt || undefined,
      arrAt: arrAt || undefined,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      const result =
        isEdit && transport
          ? await updateTransport(transport.id, input)
          : await createTransport(tripId, input);

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
      {/* Mode */}
      <Field label="Mode" required error={errors.mode?.[0]}>
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
        <Field label="From stop" error={errors.fromStopId?.[0]}>
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
              {stops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="To stop" error={errors.toStopId?.[0]}>
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
        <Field label="Departure place" error={errors.depPlace?.[0]}>
          <Input
            value={depPlace}
            onChange={(e) => setDepPlace(e.target.value)}
            placeholder="e.g. Heathrow T5"
            disabled={isPending}
          />
        </Field>
        <Field label="Arrival place" error={errors.arrPlace?.[0]}>
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
        <Field label="Departure time" error={errors.depAt?.[0]}>
          <Input
            type="datetime-local"
            value={depAt}
            onChange={(e) => setDepAt(e.target.value)}
            disabled={isPending}
          />
        </Field>
        <Field label="Arrival time" error={errors.arrAt?.[0]}>
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
      <Field label="Booking reference / number" error={errors.reference?.[0]}>
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. BA0123 or ABC123"
          disabled={isPending}
        />
      </Field>

      {/* Notes */}
      <Field label="Notes" error={errors.notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this leg…"
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
          {isEdit ? "Save changes" : "Add transport"}
        </Button>
      </DialogFooter>
    </form>
  );
}
