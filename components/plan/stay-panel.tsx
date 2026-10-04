"use client";

import * as React from "react";
import { BedDouble, Check, Hash, Paperclip, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { MapLink } from "@/components/trip/map-link";
import { nightsBetween } from "@/lib/dates";
import {
  costPaidState,
  stayCostLabel,
  stayCoverage,
  stayCoverageLine,
  stayWindowLabel,
  type StayCoverage,
} from "@/lib/plan/plan-model";
import type { AccommodationCardAccommodation } from "@/components/trip/accommodation-card";
import type { CostRow } from "@/server/actions/costs";

/** One Accommodation as the stay panel lists it: the card's fields plus its Costs and file count. */
export interface StayPanelAccommodation extends AccommodationCardAccommodation {
  costs?: CostRow[];
  attachmentCount?: number;
}

export interface StayPanelProps {
  stop: { arriveDate: string | null; departDate: string | null };
  accommodations: StayPanelAccommodation[];
  homeCurrency?: string;
  /** Opens the existing Accommodation view — the stay dialog with this one expanded. */
  onOpen(accommodationId: string): void;
  onAdd(): void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const ADD_CLASS = "tap-target shrink-0 whitespace-nowrap text-xs font-bold text-coral-text";

/** The first non-blank line of an Accommodation's notes. */
function firstLine(notes: string | null | undefined): string | null {
  return notes?.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? null;
}

function StayBlock({
  a,
  homeCurrency,
  onOpen,
}: {
  a: StayPanelAccommodation;
  homeCurrency?: string;
  onOpen(id: string): void;
}) {
  const nights = nightsBetween(a.checkIn, a.checkOut);
  const cost = stayCostLabel(a.costs, homeCurrency);
  const paid = costPaidState(a.costs);
  const note = firstLine(a.notes);
  const files = a.attachmentCount ?? 0;

  // A stretched button (its ::after covers the block), not a <button> around
  // the whole block: the map pin is a real link and can't nest inside one, so
  // it sits above the overlay (relative z-10) and opens Maps on its own.
  return (
    <li
      data-testid="stay-block"
      className="relative flex min-w-0 flex-col gap-0.5 rounded-xl border-2 border-border bg-background px-2.5 py-2 text-xs text-foreground/80 hover:bg-teal/10 has-[button:focus-visible]:outline-[3px] has-[button:focus-visible]:outline-ring"
    >
      <button
        type="button"
        onClick={() => onOpen(a.id)}
        className="truncate text-left text-[13px] font-bold text-foreground after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none"
      >
        {a.name}
      </button>
      <p>
        {stayWindowLabel(a)} · {nights === 0 ? "Same-day" : plural(nights, "night")}
      </p>
      {a.address && (
        <p className="flex min-w-0 items-center gap-1">
          <span className="truncate">{a.address}</span>
          <MapLink lat={a.lat} lng={a.lng} address={a.address} label={a.name} className="relative z-10 text-foreground/80" />
        </p>
      )}
      {a.confirmation && (
        <p className="flex items-center gap-1 font-mono">
          <Hash className="size-3 shrink-0" aria-hidden="true" />
          {a.confirmation}
        </p>
      )}
      {cost && (
        <p className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">{cost}</span>
          {paid === "paid" ? <Badge variant="teal">Paid</Badge> : <Badge variant="muted">Unpaid</Badge>}
        </p>
      )}
      {note && (
        <p className="flex min-w-0 items-center gap-1">
          <StickyNote className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{note}</span>
        </p>
      )}
      {files > 0 && (
        <p className="flex items-center gap-1">
          <Paperclip className="size-3 shrink-0" aria-hidden="true" />
          {plural(files, "file")}
        </p>
      )}
    </li>
  );
}

function CoverageLine({ coverage, onAdd }: { coverage: Exclude<StayCoverage, { kind: "rough" }>; onAdd(): void }) {
  const add = coverage.kind === "covered" || coverage.kind === "partial" ? "+ Add another place" : "+ Add a stay";
  return (
    <p data-testid="stay-coverage" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold">
      <span
        className={cn(
          coverage.kind === "covered" && "text-teal-text",
          (coverage.kind === "partial" || coverage.kind === "none") && "text-coral-text",
          coverage.kind === "day-visit" && "text-muted-foreground",
        )}
      >
        {coverage.kind === "covered" && <Check className="mr-0.5 inline size-3" aria-hidden="true" />}
        {stayCoverageLine(coverage)}
      </span>
      <span aria-hidden="true">·</span>
      <button type="button" className={ADD_CLASS} onClick={onAdd}>
        {add}
      </button>
    </p>
  );
}

/**
 * Spec 2026-10-04 §B: the open Stop card's stay panel, beside the ideas box —
 * one block per Accommodation, then the coverage line. Replaces the stay chip.
 */
export function StayPanel({ stop, accommodations, homeCurrency, onOpen, onAdd }: StayPanelProps) {
  const headingId = React.useId();
  const coverage = stayCoverage(stop, accommodations);
  const rough = coverage.kind === "rough";

  return (
    <section
      aria-labelledby={headingId}
      data-testid="stay-panel"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-[14px] border-2 border-border bg-card px-3 py-2.5",
        (rough || coverage.kind === "none") && "border-dashed",
        coverage.kind === "none" && "bg-coral/20",
      )}
    >
      <h3 id={headingId} className="flex items-center gap-1.5 font-display text-base font-extrabold leading-tight">
        <BedDouble className="size-4 shrink-0" aria-hidden="true" />
        Where you&rsquo;re staying
      </h3>
      {!rough && accommodations.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {accommodations.map((a) => (
            <StayBlock key={a.id} a={a} homeCurrency={homeCurrency} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {rough ? (
        <p className="text-[13px] font-bold text-muted-foreground">Needs dates first</p>
      ) : (
        <CoverageLine coverage={coverage} onAdd={onAdd} />
      )}
    </section>
  );
}
