import type { BookingState, TransportMode } from "@/lib/enum-values";
import type { OpeningHours } from "@/lib/opening-hours";
import type { SurpriseView } from "@/lib/surprise";
import type { CostRow } from "@/lib/money/cost-row";

/**
 * The Plan's entity rows as the cards and the three edit dialogs take them,
 * built by lib loaders (lib/day-view-loader.ts) and the Plan page. In lib so
 * a loader can name them without importing components (spec 2026-10-14 Q8).
 */

export interface ItemCardItem {
  id: string;
  title: string;
  category: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  address?: string | null;
  link?: string | null;
  booking?: string | null;
  /** CONTEXT.md "Booking state" — as stored (the effective state); absent on rows that don't read it (the Share page). */
  bookingState?: BookingState | null;
  /** True when the Traveller chose the state (the dialog then keeps it when the reference changes). */
  bookingStateSet?: boolean | null;
  /** YYYY-MM-DD the thing should be booked by; only while To book. */
  bookBy?: string | null;
  /** CONTEXT.md "Slot time" — the ticket's time, how early to be there, and whether it can be refunded. */
  slotTime?: string | null;
  arriveByMinutes?: number | null;
  refundable?: boolean | null;
  /** CONTEXT.md "Opening hours" — the place's hours; null/absent = not known. */
  openingHours?: OpeningHours | null;
  notes?: string | null;
  stopId?: string | null;
  stopName?: string | null; // resolved from stop relation
  lat?: number | null;
  lng?: number | null;
  /** CONTEXT.md "Share link" — never leaves via a share link (ADR 0051 floor); still fully visible to every Traveller. */
  hiddenFromShares?: boolean;
  /** CONTEXT.md "Item photo" (spec §I) — `lib/item-photo.ts`'s `itemPhotoUrl`, resolved by the loader. Null/absent = no photo. */
  photoUrl?: string | null;
  /** CONTEXT.md "Surprise" — the live Surprise this Item is; null/absent = none. */
  surprise?: SurpriseView | null;
}

export interface TransportCardTransport {
  id: string;
  mode: TransportMode;
  fromStopId?: string | null;
  toStopId?: string | null;
  anchorStopId?: string | null;
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | null;
  arrAt?: Date | null;
  reference?: string | null;
  /** CONTEXT.md "Booking state" — as stored (the effective state); absent on rows that don't read it (the Share page). */
  bookingState?: BookingState | null;
  /** True when the Traveller chose the state (the dialog then keeps it when the reference changes). */
  bookingStateSet?: boolean | null;
  /** YYYY-MM-DD the thing should be booked by; only while To book. */
  bookBy?: string | null;
  notes?: string | null;
  sortOrder: number;
  /** Resolved name of the fromStop (if linked) */
  fromStopName?: string | null;
  /** Resolved name of the toStop (if linked) */
  toStopName?: string | null;
  /** IANA timezone of fromStop (used for dep time display) */
  fromStopTimezone?: string | null;
  /** IANA timezone of toStop (used for arr time display) */
  toStopTimezone?: string | null;
  /** Precomputed offline drive estimate; present only for Car legs without real times. */
  driveEstimate?: { minutes: number; roadKm: number } | null;
}

export interface AccommodationCardAccommodation {
  id: string;
  stopId: string;
  name: string;
  address?: string | null;
  checkIn: string;
  checkOut: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  confirmation?: string | null;
  /** CONTEXT.md "Booking state" — as stored (the effective state); absent on rows that don't read it (the Share page). */
  bookingState?: BookingState | null;
  /** True when the Traveller chose the state (the dialog then keeps it when the reference changes). */
  bookingStateSet?: boolean | null;
  /** YYYY-MM-DD the thing should be booked by; only while To book. */
  bookBy?: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** The Item dialog's Stop choice (components/trip/item-form-dialog.tsx). Not the Transport dialog's same-named type. */
export interface StopOption {
  id: string;
  name: string;
  /** Stop's arrive date (YYYY-MM-DD) — the scheduled-mode date default. Null/absent for a rough Stop. */
  arriveDate?: string | null;
}

/** Everything the three edit dialogs need, built once by the day page and looked up by entity id. */
export interface DayEntryEditor {
  tripId: string;
  stops: (StopOption & { timezone?: string | null })[];
  homeCurrency?: string;
  homeBaseName?: string | null;
  homeTimezone?: string | null;
  items: Record<string, ItemCardItem>;
  transports: Record<string, TransportCardTransport>;
  accommodations: Record<
    string,
    { accommodation: AccommodationCardAccommodation; stopDateRange: { arriveDate: string; departDate: string } }
  >;
  costsByOwner: Record<string, CostRow[]>;
}
