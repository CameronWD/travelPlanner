"use client";

import * as React from "react";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { AppLink } from "@/components/navigation/app-link";
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
import { formError } from "@/components/ui/action-failure";
import { createTransport, updateTransport } from "@/server/actions/transport";
import { resolveEndpointZones, instantToWallTimeInput } from "@/lib/time-display";
import { zonedWallTimeToInstant } from "@/lib/tz";
import type { TransportCardTransport } from "./transport-card";
import { HOME_ENDPOINT } from "./transport-endpoints";
import type { CostRow } from "@/server/actions/costs";
import { FormDialog, useFormDirty } from "@/components/ui/form-dialog";
import { PresenceDiv } from "@/components/plan/presence";
import { useMotionTiming } from "@/components/plan/use-motion-timing";
import { useEntityForm } from "@/components/ui/use-entity-form";
import { InlineCostFields } from "@/components/money/cost-fields/inline-cost-fields";
import { useCostFields } from "@/components/money/cost-fields/use-cost-fields";
import { seedCostFormState } from "@/lib/money/cost-form-state";
import type { TransportMode } from "@/lib/enum-values";
import { fail, type ActionResult } from "@/lib/action-result";
import type { ProposedTransportInput } from "@/lib/booking-import/types";
import { useDraftReporter } from "@/components/ui/use-draft-reporter";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { LocationCombobox, type LocationValue } from "@/components/trip/location-combobox";
import { NoteThread, type NoteView } from "@/components/trip/note-thread";
import { ReminderList } from "@/components/trip/reminder-list";
import type { ReminderItem } from "@/lib/reminder-about";
import { stopHue } from "@/lib/stop-colours";
import { HUE_CLASSES } from "@/lib/hues";
import { formatDayLabel } from "@/lib/dates";
import { resolveTransportSlot, canSitBeforeFirstStop, creationAnchor, HEAD_SLOT } from "@/lib/transport-anchor";
import { toPatch } from "@/lib/patch";
import { BookingStateField, seedFromProposal, useBookingStateField } from "./booking-state-field";
import { transportBookingSubject } from "@/lib/booking-state";

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
  /** Trip's Home base IANA timezone — a Home end's times read in this zone. */
  homeTimezone?: string | null;
  /** Existing attachments for this transport (edit mode only). */
  attachments?: AttachmentView[];
  /** Reminders about this leg (edit mode, real plan only — spec F8). */
  reminders?: ReminderItem[];
  /** Opens Add a Reminder about this leg; omitted on a Fork's leg. */
  onAddReminder?: () => void;
  /** Edit mode only: shows a "Delete leg" button in the footer that calls this. */
  onDelete?: () => void;
  /**
   * Edit mode: this leg is a Home base bookend (ADR 0032). It renders with
   * the Home base card whatever its anchor, so the Position in plan picker —
   * whose every option would do nothing visible — is hidden.
   */
  bookend?: boolean;
  /**
   * The transport's existing notes thread (edit mode only). The leg pill
   * dropped its own notes display when it became a plain strip pill — this
   * keeps the thread reachable from the sheet instead.
   */
  notes?: NoteView[];
  /** Current authenticated user's ID — required by the notes thread. */
  currentUserId?: string;
  /**
   * Create mode only: the day ("YYYY-MM-DD") the leg is added from. Seeds the
   * departure at 09:00 that day; ignored when editing (spec 2026-10-13 D5).
   */
  defaultDate?: string;
  /**
   * Trip settings path. When set and there is no Home base, a hint under the
   * From/To pickers links there (spec 2026-10-13 D6).
   */
  settingsHref?: Route;
  /** Booking import (Proposal mode): seeds a NEW record's fields. Ignored when editing a saved one. */
  initialValues?: Partial<ProposedTransportInput>;
  /** Proposal mode: told the would-be input on every change (live preview). */
  onDraftChange?: (input: ProposedTransportInput) => void;
  /** Proposal mode: replaces the create call; the save button reads "Confirm". */
  onSubmitOverride?: (input: ProposedTransportInput) => Promise<ActionResult>;
  /** Proposal mode: a live preview card shown at the top of the form. */
  preview?: React.ReactNode;
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
  homeTimezone,
  attachments,
  reminders,
  onAddReminder,
  onDelete,
  bookend,
  notes,
  currentUserId,
  defaultDate,
  settingsHref,
  initialValues,
  onDraftChange,
  onSubmitOverride,
  preview,
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
        homeTimezone={homeTimezone}
        attachments={attachments}
        reminders={reminders}
        onAddReminder={onAddReminder}
        onDelete={onDelete}
        bookend={bookend}
        notes={notes}
        currentUserId={currentUserId}
        defaultDate={defaultDate}
        settingsHref={settingsHref}
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
  homeTimezone?: string | null;
  attachments?: AttachmentView[];
  /** Reminders about this leg (edit mode, real plan only — spec F8). */
  reminders?: ReminderItem[];
  /** Opens Add a Reminder about this leg; omitted on a Fork's leg. */
  onAddReminder?: () => void;
  onDelete?: () => void;
  bookend?: boolean;
  notes?: NoteView[];
  currentUserId?: string;
  defaultDate?: string;
  settingsHref?: Route;
  initialValues?: Partial<ProposedTransportInput>;
  onDraftChange?: (input: ProposedTransportInput) => void;
  onSubmitOverride?: (input: ProposedTransportInput) => Promise<ActionResult>;
  preview?: React.ReactNode;
}

export { HOME_ENDPOINT } from "./transport-endpoints";

/** An edit's empty fields are clears (ADR 0075). Each end is sent whole; the home flags are always booleans. */
// `bookingState` is deliberately absent: a null would hand a choice back to automatic; an un-chosen state is simply not sent.
const TRANSPORT_CLEARABLE = ["fromStopId", "toStopId", "depPlace", "arrPlace", "depAt", "arrAt", "reference", "notes", "anchorStopId", "paidAt", "bookBy"] as const;

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
  homeTimezone,
  attachments,
  reminders,
  onAddReminder,
  onDelete,
  bookend,
  notes,
  currentUserId,
  defaultDate,
  settingsHref,
  initialValues,
  onDraftChange,
  onSubmitOverride,
  preview,
}: TransportFormProps) {
  const isEdit = Boolean(transport);
  // Booking import (Proposal mode) seeds a new leg only; a saved leg always wins.
  const proposed = transport ? undefined : initialValues;

  // Determine the single existing cost (if any) for prefill.
  // When >1 costs exist the CostEditor is authoritative — hide the inline fields.
  const singleCost = costs?.length === 1 ? costs[0] : null;
  const hasMultipleCosts = (costs?.length ?? 0) > 1;

  const defaultCurrency = homeCurrency ?? "AUD";

  const [mode, setMode] = React.useState<string>(transport?.mode ?? proposed?.mode ?? "FLIGHT");

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
    if (proposed?.depIsHome) return { kind: "home" };
    if (proposed?.fromStopId) {
      const stop = stops.find((s) => s.id === proposed.fromStopId);
      return { kind: "stop", stopId: proposed.fromStopId, name: stop?.name ?? proposed.fromStopId };
    }
    if (proposed?.depPlace) return { kind: "place", name: proposed.depPlace };
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
    if (proposed?.arrIsHome) return { kind: "home" };
    if (proposed?.toStopId) {
      const stop = stops.find((s) => s.id === proposed.toStopId);
      return { kind: "stop", stopId: proposed.toStopId, name: stop?.name ?? proposed.toStopId };
    }
    if (proposed?.arrPlace) return { kind: "place", name: proposed.arrPlace };
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

  // A Stop end can also carry its exact departure/arrival point (the station,
  // airport terminal, pier — spec B3/B4). Seeded from the stored depPlace/
  // arrPlace only when that end actually is a Stop; a Home or place end never
  // shows this field, so there's nothing to seed.
  const [depPoint, setDepPoint] = React.useState(
    transport?.fromStopId && !transport?.depIsHome
      ? (transport.depPlace ?? "")
      : proposed?.fromStopId ? (proposed.depPlace ?? "") : "",
  );
  const [arrPoint, setArrPoint] = React.useState(
    transport?.toStopId && !transport?.arrIsHome
      ? (transport.arrPlace ?? "")
      : proposed?.toStopId ? (proposed.arrPlace ?? "") : "",
  );

  // Re-picking the SAME Stop keeps the point; changing to a different Stop,
  // or away from a Stop entirely (Home/none/place), clears it — the point
  // belongs to the specific Stop selection, not the endpoint in general.
  const handleFromChange = (next: LocationValue) => {
    const sameStop = next.kind === "stop" && fromValue.kind === "stop" && next.stopId === fromValue.stopId;
    if (!sameStop) setDepPoint("");
    setFromValue(next);
  };
  const handleToChange = (next: LocationValue) => {
    const sameStop = next.kind === "stop" && toValue.kind === "stop" && next.stopId === toValue.stopId;
    if (!sameStop) setArrPoint("");
    setToValue(next);
  };

  // Position in plan (edit mode). null = untouched: the picker shows the slot
  // the timeline actually renders the leg in (resolveTransportSlot, for the
  // endpoints as they stand) and saving sends the stored anchor back
  // unchanged — an untouched picker never moves the leg (spec 2026-10-04 §D).
  // HEAD_SLOT is the head option's value (Radix Select disallows "" items);
  // it is sent as "" (no anchor).
  const [pickedSlot, setPickedSlot] = React.useState<string | null>(null);
  const liveFromStopId = fromValue.kind === "stop" ? fromValue.stopId : null;
  const liveToStopId = toValue.kind === "stop" ? toValue.stopId : null;
  const storedAnchor = transport?.anchorStopId ?? null;
  const headHolds = canSitBeforeFirstStop({ fromStopId: liveFromStopId, toStopId: liveToStopId }, stops);
  const resolvedSlot = resolveTransportSlot(
    { id: transport?.id ?? "", sortOrder: 0, anchorStopId: storedAnchor, fromStopId: liveFromStopId, toStopId: liveToStopId },
    stops,
  );
  // A picked head that stops holding (the From changed under it) falls back.
  const pickValid = pickedSlot !== null && (pickedSlot !== HEAD_SLOT || headHolds);
  const positionSlot = pickValid && pickedSlot !== null ? pickedSlot : resolvedSlot;

  function anchorForSubmit(): string | undefined {
    if (isEdit) {
      if (!pickValid || pickedSlot === null) return storedAnchor ?? "";
      return pickedSlot === HEAD_SLOT ? "" : pickedSlot;
    }
    // Add mode: the slot the leg was added in, else the slot it would
    // resolve to — every new leg gets a real anchor (spec 2026-10-04 §D).
    return defaultAnchorStopId || (creationAnchor({ fromStopId: liveFromStopId, toStopId: liveToStopId }, stops) ?? undefined);
  }

  // Render the stored instants in the endpoint stops' own timezones (P0-1
  // client) — not the device's local timezone — so editing shows back what
  // was typed, even when the device and the leg are in different zones.
  const initialZones = resolveEndpointZones(
    stops.find((s) => s.id === transport?.fromStopId)?.timezone ?? null,
    stops.find((s) => s.id === transport?.toStopId)?.timezone ?? null,
    { depIsHome: transport?.depIsHome, arrIsHome: transport?.arrIsHome, homeTimezone },
  );
  const [depAt, setDepAt] = React.useState(
    proposed?.depAt
      ? proposed.depAt
      : !transport && defaultDate
      ? `${defaultDate}T09:00`
      : instantToWallTimeInput(transport?.depAt, initialZones.depTz),
  );
  const [arrAt, setArrAt] = React.useState(
    proposed?.arrAt ? proposed.arrAt : instantToWallTimeInput(transport?.arrAt, initialZones.arrTz),
  );
  const [reference, setReference] = React.useState(transport?.reference ?? proposed?.reference ?? "");
  const bookingField = useBookingStateField(transportBookingSubject(mode), transport ?? seedFromProposal(proposed), reference);
  const [notesText, setNotesText] = React.useState(transport?.notes ?? proposed?.notes ?? "");
  // Car with no times yet shows a drive estimate instead of empty Leaves/
  // Arrives cards; "Add times" reveals them without waiting for a real time.
  const [showTimes, setShowTimes] = React.useState(false);
  // Bumped on every tile pick so the picked tile's content remounts and
  // replays its pop (MOTION.md P13) — even when it was already the mode.
  const [selectedAt, setSelectedAt] = React.useState(0);
  const { t: timing } = useMotionTiming();

  // Inline cost fields: a saved single Cost, else a Proposal's Cost (Booking
  // import), else empty — the rules are lib/money/cost-form-state.ts's (card 2.I).
  const [costSeed] = React.useState(() => seedCostFormState(singleCost, proposed, defaultCurrency));
  const cost = useCostFields(costSeed);
  // Cost starts collapsed behind "+ Add cost" unless a cost already exists.
  const [showCost, setShowCost] = React.useState(
    Boolean(singleCost || hasMultipleCosts || proposed?.costMinor !== undefined),
  );

  // UI-only state (showTimes, selectedAt, showCost) is not input.
  useFormDirty({ mode, fromValue, toValue, depPoint, arrPoint, pickedSlot, depAt, arrAt, reference, bookingState: bookingField.dirtyValues, notesText, cost: cost.dirtyValues });

  // The would-be create/update input, exactly as typed.
  function buildInput() {
    const c = cost.payload();

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
          return { fromStopId: fromValue.stopId, depIsHome: false, depPlace: depPoint.trim() || undefined };
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
          return { toStopId: toValue.stopId, arrIsHome: false, arrPlace: arrPoint.trim() || undefined };
        case "place":
          return { toStopId: undefined, arrIsHome: false, arrPlace: toValue.name };
        default:
          return { toStopId: undefined, arrIsHome: false, arrPlace: undefined };
      }
    })();

    const input = {
      mode: mode as TransportMode,
      ...fromFields,
      ...toFields,
      depAt: depAt || undefined,
      arrAt: arrAt || undefined,
      reference: reference.trim() || undefined,
      ...bookingField.payload(),
      notes: notesText.trim() || undefined,
      // A proposed Stop id must never become an anchor: confirmProposal computes it.
      anchorStopId: onSubmitOverride ? undefined : anchorForSubmit(),
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
      return isEdit && transport
        ? updateTransport(transport.id, toPatch(input, TRANSPORT_CLEARABLE))
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
    { depIsHome: fromValue.kind === "home", arrIsHome: toValue.kind === "home", homeTimezone },
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
  const hasStopError = Boolean(errors.fromStopId?.[0] || errors.toStopId?.[0]);
  // The submit button lives in DialogFooter, outside this <form> (see below —
  // NoteThread needs to sit between them without nesting inside the <form>
  // itself), so it's wired back in via the `form` attribute instead of DOM
  // containment.
  const formId = React.useId();

  const showLeavesArrives = mode !== "CAR" || Boolean(depAt) || Boolean(arrAt) || showTimes;

  const stopsCombo = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="From" error={errors.fromStopId?.[0]}>
        <LocationCombobox
          label="From"
          value={fromValue}
          onChange={handleFromChange}
          stops={stops}
          homeBaseName={homeBaseName}
          tripId={tripId}
          disabled={isPending}
          data-testid="from-combobox"
        />
        {fromValue.kind === "stop" && (
          <Field label="Departure point" className="mt-2">
            <Input
              value={depPoint}
              onChange={(e) => setDepPoint(e.target.value)}
              placeholder="e.g. Gare du Nord, optional"
              disabled={isPending}
            />
          </Field>
        )}
      </Field>

      <Field label="To" error={errors.toStopId?.[0]}>
        <LocationCombobox
          label="To"
          value={toValue}
          onChange={handleToChange}
          stops={stops}
          homeBaseName={homeBaseName}
          tripId={tripId}
          disabled={isPending}
          data-testid="to-combobox"
        />
        {toValue.kind === "stop" && (
          <Field label="Arrival point" className="mt-2">
            <Input
              value={arrPoint}
              onChange={(e) => setArrPoint(e.target.value)}
              placeholder="e.g. St Pancras, optional"
              disabled={isPending}
            />
          </Field>
        )}
      </Field>
      {/* Only when the leg actually touches Home base (final review F4). */}
      {homeBaseName == null && settingsHref && (fromValue.kind === "home" || toValue.kind === "home") && (
        <p className="text-[13px] font-semibold text-muted-foreground sm:col-span-2">
          No Home base yet. Set one in{" "}
          <AppLink href={settingsHref} className="underline">
            Trip settings
          </AppLink>{" "}
          to add flights from home.
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {preview && <div data-testid="proposal-preview">{preview}</div>}
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
          <div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
          {errors.mode?.[0] && (
            <p className="mt-1.5 text-sm font-medium text-destructive">{errors.mode?.[0]}</p>
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
              {/* A native datetime-local value is ~190px wide; two half-width boxes
                  clip it on a 360–390 phone (LA-120), so they stack until 430px. */}
              <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2">
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
                    invalid={Boolean(errors.depAt?.[0])}
                    className="h-auto border-0 bg-transparent p-0 text-[17px] font-extrabold tabular-nums shadow-none focus-visible:translate-x-0 focus-visible:translate-y-0 focus-visible:shadow-none"
                  />
                  {errors.depAt?.[0] && (
                    <p className="mt-1 text-xs font-medium text-destructive">{errors.depAt?.[0]}</p>
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
                    invalid={Boolean(errors.arrAt?.[0])}
                    className="h-auto border-0 bg-transparent p-0 text-[17px] font-extrabold tabular-nums shadow-none focus-visible:translate-x-0 focus-visible:translate-y-0 focus-visible:shadow-none"
                  />
                  {errors.arrAt?.[0] && (
                    <p className="mt-1 text-xs font-medium text-destructive">{errors.arrAt?.[0]}</p>
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
                : "The drive estimate will show once it's saved."}
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
            Departure is on or after arrival. Double-check these times.
          </Badge>
        )}

        {/* Booking ref + Position in plan — paired from sm (spec 2026-10-05 §D).
            Position: edit mode only, and not for a Home base bookend (it sits
            with the Home base card whatever its anchor). Opens on the slot the
            timeline renders the leg in; the head is only offered where a null
            anchor really lands there. */}
        <div data-pair="booking" className="grid gap-4 sm:grid-cols-2">
          <Field label="Booking ref · only people on the trip see this" error={errors.reference?.[0]}>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. BA0123 or ABC123"
              disabled={isPending}
            />
          </Field>

          {isEdit && !bookend && stops.length > 0 && (
            <Field label="Position in plan">
              <Select value={positionSlot} onValueChange={setPickedSlot} disabled={isPending}>
                <SelectTrigger aria-label="Position in plan">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {headHolds && <SelectItem value={HEAD_SLOT}>Before {stops[0].name}</SelectItem>}
                  {stops.map((stop) => (
                    <SelectItem key={stop.id} value={stop.id}>
                      After {stop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>

        {/* Booking state (CONTEXT.md): a tentative leg is To book; a typed reference implies Booked until the Traveller picks. */}
        <BookingStateField field={bookingField} errors={errors} disabled={isPending} />

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
              {...cost.fieldProps}
              hasMultipleCosts={hasMultipleCosts}
              errors={errors}
              disabled={isPending}
              paired
            />
          )}
        </div>

        {/* Notes */}
        <Field label="Notes" error={errors.notes?.[0]}>
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

        {isEdit && transport && (reminders || onAddReminder) && (
          <Field label="Reminders">
            <ReminderList reminders={reminders ?? []} onAdd={onAddReminder} />
          </Field>
        )}

        <FormError>{formError(errors)}</FormError>
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
          {onSubmitOverride ? "Confirm" : isEdit ? "Save" : `Add ${TRANSPORT_MODE_META[mode as TransportMode].label.toLowerCase()}`}
        </Button>
      </DialogFooter>
    </div>
  );
}
