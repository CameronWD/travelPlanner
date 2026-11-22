"use client";

import * as React from "react";
import Link from "next/link";
import { Bed, Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDayLabel } from "@/lib/dates";
import { mapsUrl } from "@/lib/map/maps";
import type { DayViewData } from "@/lib/day-view-loader";
import { STAY_NAME_CLASS, StayCard, StayConfirmation } from "@/components/trip/stay-card";
import { BookingConfirmationMarker } from "@/components/trip/booking-confirmation-marker";
import { useTripHref } from "@/components/trip/use-trip-href";

/**
 * Tonight (DAY_VIEW §2 right column 2, §3.7): StayCard naming tonight's bed,
 * its night-of count and check-out day. Hidden on the trip's last day.
 *
 * Tapping the card expands it in place (spec 2026-09-29 D1): address (opens
 * in maps), confirmation number (copyable), check-in/out times and notes,
 * each only when present, plus "Edit in plan" to the day's Stop on the Plan
 * (`#stop-<id>`, the anchor components/plan/stop-row.tsx sets — the Plan has no
 * per-Accommodation anchor, and an Accommodation is edited from its Stop).
 */
export function TonightCard({
  tripId,
  tonight,
  isLastDay,
  stopId,
  size,
  needsBookingConfirmation = false,
}: {
  tripId: string;
  tonight: DayViewData["tonight"];
  isLastDay: boolean;
  stopId: string | null;
  size: "desktop" | "phone";
  needsBookingConfirmation?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const panelId = React.useId();
  const tripHref = useTripHref(tripId);
  if (isLastDay) return null;

  const planHref = tripHref(`/plan${stopId ? `#stop-${stopId}` : ""}`);
  const shell = size === "phone" ? "shadow-hard-2" : "shadow-hard-3";

  if (!tonight) {
    return (
      <StayCard data-slot="tonight-card" className={shell} label="Tonight" icon={Bed} name="No bed yet">
        <Link href={planHref} className="inline-flex min-h-11 items-center self-start text-[13px] font-bold underline underline-offset-2 md:min-h-0">
          + Add a stay
        </Link>
      </StayCard>
    );
  }

  const mapHref = tonight.address
    ? mapsUrl({ lat: tonight.lat, lng: tonight.lng, address: tonight.address, label: tonight.name, placeId: tonight.placeId })
    : null;
  const confirmation = tonight.confirmation;
  function copyConfirmation() {
    if (!confirmation) return;
    void navigator.clipboard.writeText(confirmation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <StayCard
      data-slot="tonight-card"
      className={shell}
      label="Tonight"
      icon={Bed}
      name={
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="pressable flex w-full items-center justify-between gap-3 rounded-2xl text-left focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="min-w-0">
            <span className={STAY_NAME_CLASS} title={tonight.name}>{tonight.name}</span>
            <span className="block font-sans text-[13px] font-semibold leading-snug">{`Night ${tonight.nightOf.night} of ${tonight.nightOf.of} · check-out ${formatDayLabel(tonight.checkOut)}`}</span>
          </span>
          <ChevronDown
            className={cn("size-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
            strokeWidth={2.5}
            aria-hidden="true"
          />
        </button>
      }
    >
      {needsBookingConfirmation ? <BookingConfirmationMarker kind="ACCOMMODATION" id={tonight.id} /> : null}
      {open ? (
        <div id={panelId} data-slot="tonight-details" className="mt-2 flex flex-col gap-1.5 border-t-2 border-border/30 pt-2.5 text-[13px] font-semibold">
          {tonight.address && mapHref ? (
            <a href={mapHref} target="_blank" rel="noreferrer" className="self-start underline underline-offset-2">
              {tonight.address}
            </a>
          ) : null}
          {confirmation ? (
            <div className="flex items-center gap-2">
              <span>Confirmation</span>
              <StayConfirmation value={confirmation} />
              <button
                type="button"
                onClick={copyConfirmation}
                aria-label={copied ? "Copied" : "Copy confirmation number"}
                className="inline-grid size-11 place-items-center rounded-[12px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring md:size-8"
              >
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
            </div>
          ) : null}
          {tonight.checkInTime ? <p>{`Check-in ${tonight.checkInTime}`}</p> : null}
          {tonight.checkOutTime ? <p>{`Check-out ${tonight.checkOutTime}`}</p> : null}
          {tonight.notes ? <p className="whitespace-pre-line font-medium">{tonight.notes}</p> : null}
          <Link href={planHref} className="inline-flex min-h-11 items-center self-start font-bold underline underline-offset-2 md:min-h-0">
            Edit in plan
          </Link>
        </div>
      ) : null}
    </StayCard>
  );
}
