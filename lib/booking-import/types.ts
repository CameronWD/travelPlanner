/**
 * Booking import (CONTEXT.md "Booking import", "Proposal"): the types the
 * server and the Booking import sheet share. Zod-free and server-free, so a
 * "use client" component can import it (lib/client-zod.guard.test.ts).
 */
import type { BookingState, TransportMode } from "@/lib/enum-values";
import type { Category } from "@/lib/categories";
import type { ActionResult } from "@/lib/action-result";

export type Confidence = "high" | "medium" | "low";

/** A Stop reference to a proposed Stop not saved yet. */
const PROPOSED_PREFIX = "proposed:";

export function proposedRef(clientId: string): string {
  return `${PROPOSED_PREFIX}${clientId}`;
}

export function parseProposedRef(id: string | null | undefined): string | null {
  return id && id.startsWith(PROPOSED_PREFIX) ? id.slice(PROPOSED_PREFIX.length) : null;
}

/** The inline Cost the create actions accept (lib/validations/*: costMinor, currency, paidMinor, paidAt, settlement). */
export interface ProposalCostFields {
  costMinor?: number;
  currency?: string;
  paidMinor?: number | null;
  paidAt?: string | null;
  settlement?: "BEFORE" | "ON_TRIP";
}

/** A scheduled Stop, as createStop takes it (lib/validations/stop.ts). */
export interface ProposedStopInput {
  mode: "scheduled";
  name: string;
  country?: string;
  countryCode?: string;
  timezone: string;
  arriveDate: string;
  departDate: string;
  notes?: string;
  lat?: number;
  lng?: number;
}

/**
 * As createTransport takes it (lib/validations/transport.ts), with wall times
 * ("YYYY-MM-DDTHH:mm") the action reads in each end's Stop or Home zone.
 * depTimezone/arrTimezone are import-only hints for an end that has no zone of
 * its own (a connection airport, or Home when the Trip's Home timezone is
 * unset); confirm converts that end itself and strips them.
 */
export interface ProposedTransportInput extends ProposalCostFields {
  mode: TransportMode;
  fromStopId?: string;
  toStopId?: string;
  depIsHome?: boolean;
  arrIsHome?: boolean;
  depPlace?: string;
  arrPlace?: string;
  depAt?: string;
  arrAt?: string;
  reference?: string;
  /** CONTEXT.md "Booking state": an imported booking is Booked (set as a choice, so it stays Booked with no reference printed). */
  bookingState?: BookingState;
  bookBy?: string;
  notes?: string;
  depTimezone?: string;
  arrTimezone?: string;
}

export interface ProposedAccommodationInput extends ProposalCostFields {
  stopId: string;
  name: string;
  address?: string;
  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  confirmation?: string;
  /** CONTEXT.md "Booking state": an imported booking is Booked (set as a choice, so it stays Booked with no reference printed). */
  bookingState?: BookingState;
  bookBy?: string;
  notes?: string;
}

export interface ProposedItemInput extends ProposalCostFields {
  title: string;
  category: Category;
  stopId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  address?: string;
  booking?: string;
  /** CONTEXT.md "Booking state": an imported booking is Booked (set as a choice, so it stays Booked with no reference printed). */
  bookingState?: BookingState;
  bookBy?: string;
  /** CONTEXT.md "Slot time" (R3): the ticket's time, how early to be there, and whether it can be refunded (Section S: boolean, null/absent = not known). */
  slotTime?: string;
  arriveByMinutes?: number;
  refundable?: boolean;
  notes?: string;
}

export interface DuplicateRef {
  kind: "transport" | "accommodation" | "item";
  id: string;
  label: string;
}

export interface ProposalBase {
  /** Stable within one Booking import: "s1".. for proposed Stops, "p1".. for the rest. */
  clientId: string;
  confidence: Confidence;
  /** Notes to the Traveller: Claude's, plus the code's (a guessed zone, an untracked currency). */
  doubleCheck: string[];
  /** Date clashes with the Stop, a rough Stop, a likely duplicate. */
  warnings: string[];
  /** Card field keys to highlight (uncertain fields). */
  highlight: string[];
  /** Plain labels of key fields the booking did not show ("Departure time"). */
  missing: string[];
  duplicateOf: DuplicateRef | null;
  /** Set when it belongs to a Stop the importer is surprised by: it cannot be confirmed. */
  blocked: string | null;
}

export type StopProposal = ProposalBase & { kind: "stop"; input: ProposedStopInput };
export type TransportProposal = ProposalBase & { kind: "transport"; input: ProposedTransportInput };
export type AccommodationProposal = ProposalBase & { kind: "accommodation"; input: ProposedAccommodationInput };
export type ItemProposal = ProposalBase & { kind: "item"; input: ProposedItemInput };
export type Proposal = StopProposal | TransportProposal | AccommodationProposal | ItemProposal;
export type BookingProposal = TransportProposal | AccommodationProposal | ItemProposal;

/** Every Stop id (real or `proposed:`) a Proposal attaches to. */
function stopIdsOf(p: Proposal): (string | undefined)[] {
  return p.kind === "stop" ? [] : p.kind === "transport" ? [p.input.fromStopId, p.input.toStopId] : [p.input.stopId];
}

/** The proposed Stops (by clientId) a Proposal needs saved before it can be. */
export function proposalStopRefs(p: Proposal): string[] {
  return [...new Set(stopIdsOf(p).map(parseProposedRef).filter((id): id is string => id !== null))];
}

/** Real Stop ids (not proposed ones) the Proposal attaches to. */
export function existingStopIds(p: Proposal): string[] {
  return stopIdsOf(p).filter((id): id is string => Boolean(id) && parseProposedRef(id) === null);
}

/** A Stop on the plan being viewed, as the sheet needs it. */
interface ImportStop {
  id: string;
  name: string;
  country: string | null;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
  sortOrder: number;
}

export interface ImportContext {
  homeName: string | null;
  homeTimezone: string | null;
  homeCurrency: string;
  /** In plan order (lib/plan-order.ts orderPlanStops). */
  stops: ImportStop[];
}

export type BookingImportFailureReason =
  | "invalid_file"
  | "unreadable"
  | "not_booking"
  | "nothing_usable"
  | "rate_limited"
  | "busy"
  | "error"
  | "disabled";

/** `code`, on failure, is one of `BookingImportFailureReason`'s values. */
export type BookingImportResult = ActionResult<
  { proposals: Proposal[]; partial: boolean; context: ImportContext },
  { retryInMinutes?: number }
>;

export interface ConfirmRequest {
  proposal: Proposal;
  /** Proposed Stops the Proposal refers to that are not saved yet; saved first, in order. */
  proposedStops: StopProposal[];
  /** Proposed Stops already saved in this Booking import: clientId → Stop id. */
  resolvedStops: Record<string, string>;
}

export type ConfirmProposalResult = ActionResult<
  { createdId: string; createdStops: Record<string, string> },
  { createdStops: Record<string, string> }
>;

export type BookingImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** What is sent to Claude for one Booking import. */
export type BookingPart =
  | { type: "pdf"; base64: string }
  | { type: "image"; mediaType: BookingImageType; base64: string }
  | { type: "text"; text: string };
