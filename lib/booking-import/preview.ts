/**
 * Booking import preview (spec 2026-10-14 "Preview"): what the real cards
 * need to show an unsaved Proposal. Zod-free; the sheet and the edit dialogs use it.
 */
import type { TransportMode } from "@/lib/enum-values";
import { resolveEndpointZones } from "@/lib/time-display";
import { wallTimeToInstant } from "@/lib/wall-time";
import { proposedRef, type ImportContext, type ProposedAccommodationInput, type ProposedTransportInput, type StopProposal } from "./types";

export interface PreviewStop {
  id: string;
  name: string;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
}

export function previewStopMap(context: ImportContext, stopProposals: readonly StopProposal[]): Map<string, PreviewStop> {
  const map = new Map<string, PreviewStop>();
  for (const s of context.stops) map.set(s.id, { id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate, departDate: s.departDate });
  for (const p of stopProposals) {
    const id = proposedRef(p.clientId);
    map.set(id, { id, name: p.input.name, timezone: p.input.timezone, arriveDate: p.input.arriveDate, departDate: p.input.departDate });
  }
  return map;
}

export interface TransportPreview {
  id: string;
  mode: TransportMode;
  fromStopId: string | null;
  toStopId: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  reference: string | null;
  /** A Proposal's Booking state is a choice when it has one (components/trip/booking-state-field.tsx seedFromProposal). */
  bookingStateSet: boolean;
  notes: string | null;
  sortOrder: number;
  fromStopName: string | null;
  toStopName: string | null;
  fromStopTimezone: string | null;
  toStopTimezone: string | null;
}

export function transportPreview(
  input: ProposedTransportInput,
  stops: ReadonlyMap<string, PreviewStop>,
  homeTimezone: string | null,
): { transport: TransportPreview; homeTimezone: string | null } {
  const from = input.fromStopId ? stops.get(input.fromStopId) : undefined;
  const to = input.toStopId ? stops.get(input.toStopId) : undefined;
  const fromTz = from?.timezone ?? (input.depIsHome ? null : (input.depTimezone ?? null));
  const toTz = to?.timezone ?? (input.arrIsHome ? null : (input.arrTimezone ?? null));
  const homeTz = homeTimezone ?? (input.depIsHome ? input.depTimezone : input.arrIsHome ? input.arrTimezone : undefined) ?? null;
  const { depTz, arrTz } = resolveEndpointZones(fromTz, toTz, { depIsHome: input.depIsHome, arrIsHome: input.arrIsHome, homeTimezone: homeTz });
  return {
    homeTimezone: homeTz,
    transport: {
      id: "preview",
      mode: input.mode,
      fromStopId: input.fromStopId ?? null,
      toStopId: input.toStopId ?? null,
      depIsHome: Boolean(input.depIsHome),
      arrIsHome: Boolean(input.arrIsHome),
      depPlace: input.depPlace ?? null,
      arrPlace: input.arrPlace ?? null,
      depAt: wallTimeToInstant(input.depAt, depTz),
      arrAt: wallTimeToInstant(input.arrAt, arrTz),
      reference: input.reference ?? null,
      bookingStateSet: input.bookingState !== undefined,
      notes: input.notes ?? null,
      sortOrder: 0,
      fromStopName: from?.name ?? null,
      toStopName: to?.name ?? null,
      fromStopTimezone: fromTz,
      toStopTimezone: toTz,
    },
  };
}

/** The range a stay is checked against: its Stop's dates, or its own when the Stop has none. */
export function stayRange(input: ProposedAccommodationInput, stops: ReadonlyMap<string, PreviewStop>): { arriveDate: string; departDate: string } {
  const stop = stops.get(input.stopId);
  return stop?.arriveDate && stop.departDate
    ? { arriveDate: stop.arriveDate, departDate: stop.departDate }
    : { arriveDate: input.checkIn, departDate: input.checkOut };
}
