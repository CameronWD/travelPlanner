"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { PlaceCombobox, type PickedPlace } from "@/components/ui/place-combobox";
import { RangeCalendar } from "@/components/ui/range-calendar";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { useServerAction } from "@/components/ui/use-server-action";
import { createStop } from "@/server/actions/stops";
import { cn } from "@/lib/cn";
import { formatDateRangeCompact } from "@/lib/dates";
import { HUE_CLASSES } from "@/lib/hues";
import { addStopConsequence, routeCentroid } from "@/lib/plan/plan-model";
import { stopHue } from "@/lib/stop-colours";
import { guessTimezoneForCountry } from "@/lib/tz";
import type { StopInput } from "@/lib/validations/stop";

export interface AddStopSheetStop {
  id: string;
  name: string;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  lat?: number | null;
  lng?: number | null;
}

export interface AddStopSheetProps {
  open: boolean;
  onOpenChange(o: boolean): void;
  tripId: string;
  forkId: string | null;
  /** The plan's stops in plan order. */
  stops: AddStopSheetStop[];
  hardEndDate: string | null;
  tripStartDate?: string;
  defaultRange?: { arriveDate?: string; departDate?: string };
}

type Mode = "exact" | "rough";

const LABEL = "text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground";

/** PLAN.md §7.4 Add a stop: a bottom sheet on phones (full height minus 118px), a 560px dialog from sm. */
export function AddStopSheet({ open, onOpenChange, ...rest }: AddStopSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[560px] max-sm:h-[calc(100dvh-118px)]">
        <DialogHeader>
          <DialogTitle className="font-display text-[26px]">Add a stop</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts fresh and RangeCalendar's
            client-only "today" never reaches the server render. */}
        <AddStopForm {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddStopForm({ tripId, forkId, stops, hardEndDate, tripStartDate, defaultRange, onDone }: Omit<AddStopSheetProps, "open" | "onOpenChange"> & { onDone(): void }) {
  const last = stops.at(-1) ?? null;
  const [text, setText] = React.useState("");
  const [picked, setPicked] = React.useState<PickedPlace | null>(null);
  const [mode, setMode] = React.useState<Mode>(() => (last?.arriveDate || tripStartDate ? "exact" : "rough"));
  const [nights, setNights] = React.useState(3);
  const [range, setRange] = React.useState<{ start?: string; end?: string }>(() => ({
    start: defaultRange?.arriveDate || undefined,
    end: defaultRange?.departDate || undefined,
  }));
  const [afterId, setAfterId] = React.useState<string | null>(last?.id ?? null);
  const { run, isPending: pending, errors } = useServerAction(
    (input: StopInput) => createStop(tripId, input, forkId ?? undefined, afterId ?? undefined),
    { onSuccess: onDone },
  );

  const rankNear = React.useMemo(() => routeCentroid(stops) ?? undefined, [stops]);
  const hasRange = Boolean(range.start && range.end);
  const consequence = addStopConsequence({
    mode,
    nights,
    range: hasRange ? { arrive: range.start!, depart: range.end! } : null,
    stops,
    afterId,
    startDate: tripStartDate ?? null,
    hardEndDate,
  });

  const name = (picked?.name ?? text).trim();
  const country = picked?.region?.split(",").pop()?.trim() || undefined;

  const canSubmit = Boolean(name) && (mode === "rough" || hasRange) && !pending;

  function submit() {
    if (!canSubmit) return;
    const place = {
      name,
      ...(country ? { country } : {}),
      ...(picked ? { lat: picked.lat, lng: picked.lng } : {}),
    };
    const input: StopInput =
      mode === "rough"
        ? { mode: "rough", ...place, nights }
        : { mode: "scheduled", ...place, timezone: guessTimezoneForCountry(picked?.countryCode ?? country), arriveDate: range.start!, departDate: range.end! };
    run(input);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <PlaceCombobox
        value={text}
        onValueChange={(t) => {
          setText(t);
          setPicked(null);
        }}
        onPick={(p) => {
          setPicked(p);
          setText(p.name);
        }}
        placeholder="Where to?"
        rankNear={rankNear}
        autoFocus
      />

      <p className={LABEL}>HOW LONG</p>
      <Segmented type="single" tone="ink" value={mode} onValueChange={(v) => v && setMode(v as Mode)} aria-label="How long" className="grid grid-cols-2">
        <SegmentedItem value="exact">Exact dates</SegmentedItem>
        <SegmentedItem value="rough">Roughly</SegmentedItem>
      </Segmented>
      {mode === "rough" ? (
        // §7.4 asks for 44px −/+ and a 34px number; Stepper's defaults are 36px/18px.
        <Stepper value={nights} onChange={setNights} min={1} max={60} unit="nights" label="Nights" className="self-start [&_button]:size-11 [&_[aria-live]]:text-[34px]" />
      ) : (
        <RangeCalendar start={range.start} end={range.end} onChange={setRange} months={1} disableBefore={tripStartDate} />
      )}

      {stops.length > 0 && afterId && (
        <>
          <p className={LABEL}>GOES AFTER</p>
          <Select value={afterId} onValueChange={setAfterId}>
            <SelectTrigger aria-label="Goes after">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full border-2 border-border", HUE_CLASSES[stopHue(s.sortOrder)].fill)} />
                    {s.name}
                    <span className="whitespace-nowrap text-muted-foreground">{s.arriveDate && s.departDate ? formatDateRangeCompact(s.arriveDate, s.departDate) : "rough"}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {consequence && (
        <p aria-live="polite" className={cn("text-[13px] font-semibold", consequence.over && "text-coral-text")}>
          {consequence.text}
        </p>
      )}
      <FormError>{Object.values(errors).flat()[0]}</FormError>

      <Button type="submit" variant="primary" size="lg" className="mt-auto w-full" disabled={!canSubmit} loading={pending}>
        Add {name || "a stop"}
      </Button>
    </form>
  );
}
