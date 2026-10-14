/**
 * What Claude reports about a booking (spec 2026-10-14 "Extraction schema").
 * Claude reports, code decides: every value is as printed, or null. Sent as
 * the structured-output schema (zodOutputFormat) and re-validated with
 * safeParse before any Proposal is built (lib/booking-import/extract.ts).
 * Server only: zod never reaches the browser.
 */
import { z } from "zod";
import { TRANSPORT_MODES } from "@/lib/enum-values";
import { CATEGORY_VALUES } from "@/lib/categories";

const text = z.string().nullable();

const EndSchema = z.object({
  place: text, // station, airport, pier or pickup point as printed
  city: text,
  country: text,
  localDateTime: text, // "YYYY-MM-DDTHH:mm", the local wall time printed for this place
});

const TransportSchema = z.object({
  mode: z.enum(TRANSPORT_MODES).nullable(),
  carrier: text,
  serviceNumber: text, // flight or train number
  reference: text, // booking reference / PNR
  dep: EndSchema,
  arr: EndSchema,
  seat: text,
  travelClass: text,
});

const AccommodationSchema = z.object({
  name: text,
  address: text,
  city: text,
  country: text,
  checkIn: text,
  checkOut: text,
  checkInTime: text,
  checkOutTime: text,
  confirmation: text,
});

const ItemSchema = z.object({
  title: text,
  category: z.enum(CATEGORY_VALUES).nullable(),
  date: text,
  startTime: text,
  endTime: text,
  place: text,
  address: text,
  city: text,
  country: text,
  booking: text,
});

const CostSchema = z.object({
  amount: text, // decimal string, no symbol or separators
  currency: text, // ISO 4217
  paidAmount: text, // only when an amount actually paid is shown
  paidDate: text,
});

/** Field names Claude may list in uncertainFields (prompt.ts lists them; build.ts maps them to card fields). */
export const UNCERTAIN_FIELD_NAMES = [
  "mode", "carrier", "serviceNumber", "reference", "depPlace", "depTime", "arrPlace", "arrTime", "seat", "travelClass",
  "name", "address", "checkIn", "checkOut", "checkInTime", "checkOutTime", "confirmation",
  "title", "category", "date", "startTime", "endTime", "booking", "cost",
] as const;

const ExtractedProposalSchema = z.object({
  kind: z.enum(["transport", "accommodation", "item"]),
  confidence: z.enum(["high", "medium", "low"]),
  doubleCheck: z.array(z.string()),
  uncertainFields: z.array(z.string()),
  transport: TransportSchema.nullable(),
  accommodation: AccommodationSchema.nullable(),
  item: ItemSchema.nullable(),
  cost: CostSchema.nullable(),
});

export const BookingExtractionSchema = z.object({
  isBooking: z.boolean(),
  notBookingReason: text,
  bookedOn: text, // the date the booking was made, if printed
  proposals: z.array(ExtractedProposalSchema),
});

export type BookingExtraction = z.infer<typeof BookingExtractionSchema>;
export type ExtractedProposal = z.infer<typeof ExtractedProposalSchema>;
export type ExtractedEnd = z.infer<typeof EndSchema>;
export type ExtractedCost = z.infer<typeof CostSchema>;
