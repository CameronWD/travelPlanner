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
import { chapterForStop, type ChapterLike } from "@/lib/chapters";
import { cn } from "@/lib/cn";
import { formatDateRangeCompact } from "@/lib/dates";
import { HUE_CLASSES } from "@/lib/hues";
import { exactStopPlacement, storedAnchorFor } from "@/lib/plan/exact-stop-placement";
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
  chapterId?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface AddStopSheetProps {
  open: boolean;
  onOpenChange(o: boolean): void;
  tripId: string;
  forkId: string | null;
  /** The plan's stops in plan (display) order, each with its stored sortOrder. */
  stops: AddStopSheetStop[];
  hardEndDate: string | null;
  /** The plan's chapters (empty while chapters are off): a rough stop joins its displayed neighbour's. */
  chapters?: readonly ChapterLike[];
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

function AddStopForm({ tripId, forkId, stops, hardEndDate, chapters = [], tripStartDate, defaultRange, onDone }: Omit<AddStopSheetProps, "open" | "onOpenChange"> & { onDone(): void }) {
  const last = stops.at(-1) ?? null;
  const [text, setText] = React.useState("");
  const [picked, setPicked] = React.useState<PickedPlace | null>(null);
  const [mode, setMode] = React.useState<Mode>(() => (last?.arriveDate || tripStartDate ? "exact" : "rough"));
  const [nights, setNights] = React.useState(3);
  const [range, setRange] = React.useState<{ start?: string; end?: string }>(() => ({
    start: defaultRange?.arriveDate || undefined,
    end: defaultRange?.departDate || undefined,
  }));
  // Roughly: a free choice. Exact dates: a scheduled stop's position is its
  // dates, so the anchor is derived from the range (exactStopPlacement).
  const [roughAfterId, setRoughAfterId] = React.useState<string | null>(last?.id ?? null);
  const hasRange = Boolean(range.start && range.end);
  const placement = mode === "exact" && hasRange ? exactStopPlacement(stops, range.start!, range.end!) : null;
  // Both anchors are *stored* ones (createStop inserts by sortOrder), which can differ from the plan order.
  const afterId = mode === "rough" ? storedAnchorFor(stops, roughAfterId) : (placement?.afterId ?? null);
  const storedLast = stops.reduce<AddStopSheetStop | null>((m, s) => (m === null || s.sortOrder > m.sortOrder ? s : m), null);
  const { run, isPending: pending, errors } = useServerAction(
    (input: StopInput) => createStop(tripId, input, forkId ?? undefined, afterId ?? undefined),
    { onSuccess: onDone },
  );

  const rankNear = React.useMemo(() => routeCentroid(stops) ?? undefined, [stops]);
  const consequence = addStopConsequence({
    mode,
    nights,
    range: hasRange ? { arrive: range.start!, depart: range.end! } : null,
    stops,
    // A null exact anchor appends (createStop), which the helper spells as "after the last stop".
    afterId: mode === "exact" && afterId === null ? (storedLast?.id ?? null) : afterId,
    startDate: tripStartDate ?? null,
    hardEndDate,
  });

  const preceding = placement?.precedingId ? (stops.find((s) => s.id === placement.precedingId) ?? null) : null;
  const name = (picked?.name ?? text).trim();
  const country = picked?.region?.split(",").pop()?.trim() || undefined;

  // Explicit, so the server never inherits the *stored* anchor's chapter (it can
  // be a different stop from the displayed neighbour); null means none.
  const roughNeighbour = stops.find((s) => s.id === roughAfterId) ?? null;
  const roughChapterId = roughNeighbour ? (chapterForStop(roughNeighbour, chapters)?.id ?? null) : null;

  const canSubmit = Boolean(name) && (mode === "rough" || hasRange) && !pending;

  function submit() {
    if (!canSubmit) return;
    const place = {
      name,
      ...(country ? { country } : {}),
      ...(picked ? { lat: picked.lat, lng: picked.lng } : {}),
      ...(picked?.countryCode ? { countryCode: picked.countryCode } : {}),
    };
    const input: StopInput =
      mode === "rough"
        ? { mode: "rough", ...place, nights, chapterId: roughChapterId }
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

      {stops.length > 0 && mode === "exact" && (
        <>
          <p className={LABEL}>GOES AFTER</p>
          <p data-testid="goes-after" className="text-sm font-bold">
            {placement ? (preceding ? `Goes after ${preceding.name}` : "Goes first") : "Pick dates to place it."}
            {placement && <span className="font-semibold text-muted-foreground"> · set by its dates</span>}
          </p>
        </>
      )}
      {stops.length > 0 && mode === "rough" && roughAfterId && (
        <>
          <p className={LABEL}>GOES AFTER</p>
          <Select value={roughAfterId} onValueChange={setRoughAfterId}>
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
