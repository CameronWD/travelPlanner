import type { BookingExtraction, ExtractedProposal } from "@/lib/booking-import/schema";

const end = (place: string, city: string, country: string, localDateTime: string | null) => ({ place, city, country, localDateTime });

export const OUTBOUND: ExtractedProposal = {
  kind: "transport",
  confidence: "high",
  doubleCheck: ["The fare covers both flights."],
  uncertainFields: [],
  transport: {
    mode: "FLIGHT",
    carrier: "Skylark Air",
    serviceNumber: "SK101",
    reference: "QX7P2M",
    dep: end("Brisbane (BNE)", "Brisbane", "Australia", "2026-12-01T10:00"),
    arr: end("Lisbon (LIS)", "Lisbon", "Portugal", "2026-12-02T07:15"),
    seat: "32A",
    travelClass: "Economy",
  },
  accommodation: null,
  item: null,
  cost: { amount: "2140.00", currency: "AUD", paidAmount: "2140.00", paidDate: "2026-10-01" },
};

export const RETURN: ExtractedProposal = {
  ...OUTBOUND,
  doubleCheck: [],
  transport: {
    ...OUTBOUND.transport!,
    serviceNumber: "SK102",
    dep: end("Lisbon (LIS)", "Lisbon", "Portugal", "2026-12-15T21:30"),
    arr: end("Brisbane (BNE)", "Brisbane", "Australia", "2026-12-17T06:00"),
    seat: "30C",
  },
  cost: null,
};

export const STAY: ExtractedProposal = {
  kind: "accommodation",
  confidence: "medium",
  doubleCheck: [],
  uncertainFields: ["checkInTime"],
  transport: null,
  accommodation: {
    name: "Casa do Rio Lisboa",
    address: "Rua Ficticia 12, 1100-000 Lisboa",
    city: "Lisbon",
    country: "Portugal",
    checkIn: "2026-12-02",
    checkOut: "2026-12-08",
    checkInTime: "15:00",
    checkOutTime: "11:00",
    confirmation: "CDR-55821",
  },
  item: null,
  cost: { amount: "812.40", currency: "EUR", paidAmount: "812.40", paidDate: "2026-10-01" },
};

export const SAMPLE_EXTRACTION: BookingExtraction = {
  isBooking: true,
  notBookingReason: null,
  bookedOn: "2026-10-01",
  proposals: [OUTBOUND, RETURN, STAY],
};

/** An empty end, for building variants in tests. */
export const NO_END = { place: null, city: null, country: null, localDateTime: null };
