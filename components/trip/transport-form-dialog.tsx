"use client";

import * as React from "react";
import { ArrowRight, Plus, Pencil } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
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
import { DialogFooter } from "@/components/ui/dialog";
import { TRANSPORT_MODE_TILES, TRANSPORT_MODE_META, formatDuration } from "@/lib/transport";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form-error";
import { createTransport, updateTransport } from "@/server/actions/transport";
import { parseAmountToMinor, formatMinor } from "@/lib/money";
import { resolveEndpointZones, instantToWallTimeInput } from "@/lib/time-display";
import { zonedWallTimeToInstant } from "@/lib/tz";
import type { TransportCardTransport } from "./transport-card";
import type { CostRow } from "@/server/actions/costs";
import { FormDialog } from "@/components/ui/form-dialog";
import { PresenceDiv } from "@/components/plan/presence";
import { useMotionTiming } from "@/components/plan/use-motion-timing";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { InlineCostFields } from "@/components/trip/inline-cost-fields";
import { isOnTrip, type CostSettlement, type TransportMode } from "@/lib/enums";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { LocationCombobox, type LocationValue } from "@/components/trip/location-combobox";
import { AiBookingParser } from "@/components/trip/ai-booking-parser";
import { NoteThread, type NoteView } from "@/components/trip/note-thread";
import { stopHue } from "@/lib/stop-colours";
import { HUE_CLASSES } from "@/lib/hues";
import { formatDayLabel } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StopOption {
  id: string;
  name: string;
  timezone?: string | null;
  /** Position on the plan — drives the context row's hue (stopHue). */
  sortOrder?: number;
  /** Stop's stay dates (YYYY-MM-DD) — feed the context row's date. */
  departDate?: string | null;
  arriveDate?: string | null;
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
  /** Edit mode only: shows a "Delete leg" button in the footer that calls this. */
  onDelete?: () => void;
  /**
   * The transport's existing notes thread (edit mode only). The leg pill
   * dropped its own notes display when it became a plain strip pill — this
   * keeps the thread reachable from the sheet instead.
   */
  notes?: NoteView[];
  /** Current authenticated user's ID — required by the notes thread. */
  currentUserId?: string;
  /** Whether the AI booking parser is configured — shows the "Paste a booking" row. */
  aiConfigured?: boolean;
}

// ---------------------------------------------------------------------------
// Endpoint name resolution (context row + title)
// ---------------------------------------------------------------------------

function resolveEndpointName(
  stops: StopOption[],
  homeBaseName: string | null | undefined,
  args: { stopId?: string | null; isHome?: boolean | null; place?: string | null },
): string | undefined {
  if (args.isHome) return homeBaseName ?? "Home";
  if (args.stopId) return stops.find((s) => s.id === args.stopId)?.name;
  if (args.place) return args.place;
  return undefined;
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
  onDelete,
  notes,
  currentUserId,
  aiConfigured,
}: TransportFormDialogProps) {
  const toName = transport
    ? resolveEndpointName(stops, homeBaseName, {
        stopId: transport.toStopId,
        isHome: transport.arrIsHome,
        place: transport.arrPlace,
      })
    : resolveEndpointName(stops, homeBaseName, {
        stopId: defaultToStopId === HOME_ENDPOINT ? undefined : defaultToStopId,
        isHome: defaultToStopId === HOME_ENDPOINT,
      });

  const title = transport
    ? `${TRANSPORT_MODE_META[transport.mode].label} to ${toName ?? "…"}`
    : "How are you getting there?";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      recordId={transport?.id ?? null}
      size="lg"
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
        onDelete={onDelete}
        notes={notes}
        currentUserId={currentUserId}
        aiConfigured={aiConfigured}
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
  onDelete?: () => void;
  notes?: NoteView[];
  currentUserId?: string;
  aiConfigured?: boolean;
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
  onDelete,
  notes,
  currentUserId,
  aiConfigured,
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
  const [notesText, setNotesText] = React.useState(transport?.notes ?? "");
  // Car with no times yet shows a drive estimate instead of empty Leaves/
  // Arrives cards; "Add times" reveals them without waiting for a real time.
  const [showTimes, setShowTimes] = React.useState(false);
  // Bumped on every tile pick so the picked tile's content remounts and
  // replays its pop (MOTION.md P13) — even when it was already the mode.
  const [selectedAt, setSelectedAt] = React.useState(0);
  const { t: timing } = useMotionTiming();
  // Swaps the whole sheet body over to AiBookingParser (deviation 8 — it
  // isn't pre-scoped to this leg, it's just a way in).
  const [pasting, setPasting] = React.useState(false);

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
  // Settlement (CONTEXT.md) — seeded from the existing cost; a new cost is
  // Before you go until the Traveller says otherwise.
  const [settlement, setSettlement] = React.useState<CostSettlement>(
    isOnTrip(singleCost?.settlement) ? "ON_TRIP" : "BEFORE",
  );
  // Cost starts collapsed behind "+ Add cost" unless a cost already exists.
  const [showCost, setShowCost] = React.useState(Boolean(singleCost || hasMultipleCosts));

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
      // never invent a date here. `todayLocalISO()` is only used for the
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
        notes: notesText.trim() || undefined,
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
          settlement,
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

  // The context row + Leaves/Arrives labels read the *currently selected*
  // endpoints, not the initial props — picking a different stop from "Change
  // the stops" updates them live.
  const fromStopRecord = fromValue.kind === "stop" ? stops.find((s) => s.id === fromValue.stopId) : undefined;
  const toStopRecord = toValue.kind === "stop" ? stops.find((s) => s.id === toValue.stopId) : undefined;
  const fromName =
    fromValue.kind === "home" ? (homeBaseName ?? "Home") : fromValue.kind !== "none" ? fromValue.name : undefined;
  const toName =
    toValue.kind === "home" ? (homeBaseName ?? "Home") : toValue.kind !== "none" ? toValue.name : undefined;
  const showContextRow =
    fromValue.kind === "stop" || fromValue.kind === "home" || toValue.kind === "stop" || toValue.kind === "home";
  const contextDate = fromStopRecord?.departDate ?? toStopRecord?.arriveDate ?? undefined;
  const hasStopError = Boolean((errors as FormErrors).fromStopId?.[0] || (errors as FormErrors).toStopId?.[0]);
  // The submit button lives in DialogFooter, outside this <form> (see below —
  // NoteThread needs to sit between them without nesting inside the <form>
  // itself), so it's wired back in via the `form` attribute instead of DOM
  // containment.
  const formId = React.useId();

  // Paste a booking swaps the whole sheet body over — the fields underneath
  // are untouched, so returning to the leg shows exactly what was there.
  if (pasting) {
    return (
      <div className="flex flex-col gap-4">
        <AiBookingParser tripId={tripId} aiConfigured={Boolean(aiConfigured)} />
        <Button type="button" variant="ghost" onClick={() => setPasting(false)}>
          Back to the leg
        </Button>
      </div>
    );
  }

  const showLeavesArrives = mode !== "CAR" || Boolean(depAt) || Boolean(arrAt) || showTimes;

  const stopsCombo = (
    <div className="grid gap-4 sm:grid-cols-2">
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
  );

  return (
    <div className="flex flex-col gap-4">
      <form id={formId} onSubmit={onSubmit} className="contents">
        {/* Context row: from-stop pill → to-stop pill, plus the change date */}
        {showContextRow && (
          <div data-testid="leg-context" className="flex items-center gap-2">
            <span
              className={cn(
                "whitespace-nowrap shrink-0 rounded-full border-2 border-border px-2.5 text-xs font-extrabold",
                HUE_CLASSES[stopHue(fromStopRecord?.sortOrder ?? 0)].fill,
              )}
            >
              {fromName}
            </span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
            <span
              className={cn(
                "whitespace-nowrap shrink-0 rounded-full border-2 border-border px-2.5 text-xs font-extrabold",
                HUE_CLASSES[stopHue(toStopRecord?.sortOrder ?? 0)].fill,
              )}
            >
              {toName}
            </span>
            {contextDate && (
              <span className="ml-auto text-xs font-semibold text-muted-foreground">
                {formatDayLabel(contextDate)}
              </span>
            )}
          </div>
        )}

        {/* Mode grid */}
        <div>
          <div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-2">
            {TRANSPORT_MODE_TILES.map((m) => {
              const TileIcon = m.icon;
              const selected = mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={isPending}
                  onClick={() => {
                    setMode(m.value);
                    setSelectedAt((n) => n + 1);
                  }}
                  className={cn(
                    "pressable flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-2 border-border text-sm font-extrabold",
                    selected ? "bg-coral text-on-accent shadow-hard-1" : "bg-card",
                  )}
                >
                  <span
                    key={`${m.value}-${selected ? selectedAt : 0}`}
                    className={cn("inline-flex items-center gap-2", selected && selectedAt > 0 && "tp-pop")}
                  >
                    <TileIcon className="size-4" aria-hidden="true" />
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
          {(errors as FormErrors).mode?.[0] && (
            <p className="mt-1.5 text-sm font-medium text-destructive">{(errors as FormErrors).mode?.[0]}</p>
          )}
        </div>

        {/* From / To — collapsed once the context row already says where the
            leg runs, so create mode with both endpoints preset doesn't repeat
            itself. */}
        {!isEdit && defaultFromStopId && defaultToStopId ? (
          <details open={hasStopError}>
            <summary className="tap-target cursor-pointer text-[13px] font-semibold text-muted-foreground">
              Change the stops
            </summary>
            <div className="mt-2">{stopsCombo}</div>
          </details>
        ) : (
          stopsCombo
        )}

        {/* Leaves / Arrives — or, for a timeless Car leg, the drive estimate.
            MOTION.md P13: Car folds the times away (height, 180ms) and the estimate rises in. */}
        <AnimatePresence initial={false}>
          {showLeavesArrives && (
            <PresenceDiv
              key="times"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1, transition: timing({ duration: 0.18 }) }}
              exit={{ height: 0, opacity: 0, transition: timing({ duration: 0.18 }, "exit") }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[14px] border-2 border-border bg-card px-3 py-2">
                  <label htmlFor="transport-dep-at" className="block text-[11px] font-semibold text-muted-foreground">
                    Leaves {fromName}
                  </label>
                  <Input
                    id="transport-dep-at"
                    type="datetime-local"
                    value={depAt}
                    onChange={(e) => setDepAt(e.target.value)}
                    disabled={isPending}
                    invalid={Boolean((errors as FormErrors).depAt?.[0])}
                    className="h-auto border-0 bg-transparent p-0 text-[17px] font-extrabold tabular-nums shadow-none focus-visible:translate-x-0 focus-visible:translate-y-0 focus-visible:shadow-none"
                  />
                  {(errors as FormErrors).depAt?.[0] && (
                    <p className="mt-1 text-xs font-medium text-destructive">{(errors as FormErrors).depAt?.[0]}</p>
                  )}
                </div>
                <div className="rounded-[14px] border-2 border-border bg-card px-3 py-2">
                  <label htmlFor="transport-arr-at" className="block text-[11px] font-semibold text-muted-foreground">
                    Arrives {toName}
                  </label>
                  <Input
                    id="transport-arr-at"
                    type="datetime-local"
                    value={arrAt}
                    onChange={(e) => setArrAt(e.target.value)}
                    disabled={isPending}
                    invalid={Boolean((errors as FormErrors).arrAt?.[0])}
                    className="h-auto border-0 bg-transparent p-0 text-[17px] font-extrabold tabular-nums shadow-none focus-visible:translate-x-0 focus-visible:translate-y-0 focus-visible:shadow-none"
                  />
                  {(errors as FormErrors).arrAt?.[0] && (
                    <p className="mt-1 text-xs font-medium text-destructive">{(errors as FormErrors).arrAt?.[0]}</p>
                  )}
                </div>
              </div>
            </PresenceDiv>
          )}
        </AnimatePresence>
        {!showLeavesArrives && (
          <div className="tp-rise-in flex items-center justify-between gap-2 rounded-[14px] border-2 border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            <span>
              {transport?.driveEstimate
                ? `~${formatDuration(transport.driveEstimate.minutes)} · ${transport.driveEstimate.roadKm} km`
                : "We'll estimate the drive once it's saved."}
            </span>
            <button
              type="button"
              className="tap-target text-sm font-bold text-coral-text"
              onClick={() => setShowTimes(true)}
            >
              Add times
            </button>
          </div>
        )}

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

        {/* Booking ref */}
        <Field label="Booking ref · only people on the trip see this" error={(errors as FormErrors).reference?.[0]}>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. BA0123 or ABC123"
            disabled={isPending}
          />
        </Field>

        {/* Paste a booking */}
        {aiConfigured && (
          <div className="flex items-center gap-2 rounded-[14px] border-2 border-border bg-sun px-3.5 py-2.5 text-on-accent">
            <span className="flex-1 text-[13px] font-extrabold">Got the confirmation email?</span>
            <Button type="button" variant="secondary" size="sm" className="tap-target" onClick={() => setPasting(true)}>
              Paste a booking
            </Button>
          </div>
        )}

        {/* Cost — collapsed behind "+ Add cost" unless a cost already exists */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Cost</span>
            {!showCost && (
              <button
                type="button"
                className="tap-target text-sm font-bold text-coral-text"
                onClick={() => setShowCost(true)}
              >
                + Add cost
              </button>
            )}
          </div>
          {showCost && (
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
              settlement={settlement}
              onSettlementChange={setSettlement}
              errors={errors}
              disabled={isPending}
            />
          )}
        </div>

        {/* Notes */}
        <Field label="Notes" error={(errors as FormErrors).notes?.[0]}>
          <Textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
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

        <FormError>{(errors as FormErrors)._form?.[0]}</FormError>
      </form>

      {/* The transport's collaborative notes thread (edit mode only) — kept
          reachable here since the leg pill no longer shows it (Task 13).
          Rendered OUTSIDE the <form> above: NoteThread has its own <form> for
          adding a note, and a nested <form> bubbles its submit into the
          outer one — posting a note would also save the leg and close the
          sheet (and React logs a DOM-nesting warning for it). */}
      {isEdit && transport && currentUserId && (
        <NoteThread
          inline
          tripId={tripId}
          targetType="TRANSPORT"
          targetId={transport.id}
          notes={notes ?? []}
          currentUserId={currentUserId}
        />
      )}

      <DialogFooter>
        {isEdit && onDelete && (
          <Button
            type="button"
            variant="ghost"
            className="text-coral-text"
            onClick={onDelete}
            disabled={isPending}
          >
            Delete leg
          </Button>
        )}
        <Button type="submit" form={formId} variant="primary" size="lg" className="flex-1" loading={isPending}>
          {isEdit ? "Save" : `Add ${TRANSPORT_MODE_META[mode as TransportMode].label.toLowerCase()}`}
        </Button>
      </DialogFooter>
    </div>
  );
}
