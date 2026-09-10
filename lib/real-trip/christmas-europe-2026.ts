/**
 * "Christmas in Europe 2026" — Cam & Xanthia's real trip.
 *
 * Pure builder returning the trip as a DemoTrip descriptor for persistence by
 * prisma/seed-real.ts. Rebuilt 2026-09-10 from the booking confirmations after
 * the hand-entered version ("THE Trip") drifted: every Stop sat one day before
 * its Accommodation, Rome was undated, and two flight Costs recorded $0.
 *
 * Round trip from the Gold Coast (AUD): a Bali overnight, then Munich →
 * Strasbourg → Frankfurt → Paris → London → Aghalee → Dublin → Como → Milan →
 * Rome, home via Doha. Chapters are off. Times are local wall-clock stored
 * with a Z suffix, matching every existing row in this trip.
 *
 * Pure module — no Prisma, no React, no network, no clock.
 */

import type {
  DemoTrip,
  DemoStop,
  DemoTransport,
  DemoAccommodation,
  DemoCost,
} from "@/lib/demo/types";

// --- keys ------------------------------------------------------------------

export const SK = {
  denpasar: "xmas26:stop:denpasar",
  munich: "xmas26:stop:munich",
  strasbourg: "xmas26:stop:strasbourg",
  frankfurt: "xmas26:stop:frankfurt",
  paris: "xmas26:stop:paris",
  london: "xmas26:stop:london",
  aghalee: "xmas26:stop:aghalee",
  dublin: "xmas26:stop:dublin",
  como: "xmas26:stop:como",
  milan: "xmas26:stop:milan",
  rome: "xmas26:stop:rome",
} as const;

// --- stops -----------------------------------------------------------------

const STOPS: DemoStop[] = [
  { key: SK.denpasar, name: "Denpasar", country: "Indonesia", countryCode: "id", lat: -8.6653349, lng: 115.2176191, timezone: "Asia/Makassar", arriveDate: "2026-12-04", departDate: "2026-12-05", nights: 1, sortOrder: 0, notes: "Overnight stopover on the way to Europe." },
  { key: SK.munich, name: "Munich", country: "Germany", countryCode: "de", lat: 48.1371079, lng: 11.5753822, timezone: "Europe/Berlin", arriveDate: "2026-12-06", departDate: "2026-12-10", nights: 4, sortOrder: 1 },
  { key: SK.strasbourg, name: "Strasbourg", country: "France", countryCode: "fr", lat: 48.584614, lng: 7.7507127, timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-13", nights: 3, sortOrder: 2, notes: "Sleeping across the border in Kehl." },
  { key: SK.frankfurt, name: "Frankfurt", country: "Germany", countryCode: "de", lat: 50.1106444, lng: 8.6820917, timezone: "Europe/Berlin", arriveDate: "2026-12-13", departDate: "2026-12-15", nights: 2, sortOrder: 3 },
  { key: SK.paris, name: "Paris", country: "France", countryCode: "fr", lat: 48.8588897, lng: 2.320041, timezone: "Europe/Paris", arriveDate: "2026-12-15", departDate: "2026-12-19", nights: 4, sortOrder: 4 },
  { key: SK.london, name: "London", country: "United Kingdom", countryCode: "gb", lat: 51.5074456, lng: -0.1277653, timezone: "Europe/London", arriveDate: "2026-12-19", departDate: "2026-12-22", nights: 3, sortOrder: 5 },
  { key: SK.aghalee, name: "Aghalee", country: "United Kingdom", countryCode: "gb", lat: 54.5057, lng: -6.3183, timezone: "Europe/London", arriveDate: "2026-12-22", departDate: "2026-12-29", nights: 7, sortOrder: 6, notes: "Christmas in Northern Ireland." },
  { key: SK.dublin, name: "Dublin", country: "Ireland", countryCode: "ie", lat: 53.3493795, lng: -6.2605593, timezone: "Europe/Dublin", arriveDate: "2026-12-29", departDate: "2026-12-30", nights: 1, sortOrder: 7 },
  { key: SK.como, name: "Como", country: "Italy", countryCode: "it", lat: 45.9395857, lng: 9.1493609, timezone: "Europe/Rome", arriveDate: "2026-12-30", departDate: "2027-01-01", nights: 2, sortOrder: 8, notes: "New Year's Eve on Lake Como." },
  { key: SK.milan, name: "Milan", country: "Italy", countryCode: "it", lat: 45.4641943, lng: 9.1896346, timezone: "Europe/Rome", arriveDate: "2027-01-01", departDate: "2027-01-02", nights: 1, sortOrder: 9, notes: "One night back in Milan between Como and Rome." },
  { key: SK.rome, name: "Rome", country: "Italy", countryCode: "it", lat: 41.8933203, lng: 12.4829321, timezone: "Europe/Rome", arriveDate: "2027-01-02", departDate: "2027-01-07", nights: 5, sortOrder: 10 },
];

// --- accommodations (Task 3) -----------------------------------------------

const ACCOMMODATIONS: DemoAccommodation[] = [];

// --- transports (Task 4) ---------------------------------------------------

const TRANSPORTS: DemoTransport[] = [];

// --- standalone costs (Task 4) ---------------------------------------------

const COSTS: DemoCost[] = [];

// --- builder ---------------------------------------------------------------

export function buildChristmasEurope2026(): DemoTrip {
  return {
    key: "xmas26:trip",
    name: "Christmas in Europe 2026",
    createdBy: "you",
    startDate: "2026-12-04",
    endDate: "2027-01-08",
    hardEndDate: null,
    homeCurrency: "AUD",
    home: { name: "Gold Coast", lat: -28.0023731, lng: 153.4145987, countryCode: "au" },
    roundTrip: true,
    chapters: [],
    stops: STOPS,
    transports: TRANSPORTS,
    accommodations: ACCOMMODATIONS,
    items: [],
    costs: COSTS,
    exchangeRates: [
      { base: "EUR", quote: "AUD", rate: 1.63, manual: true, fetchedAt: "2026-09-10T00:00:00.000Z" },
    ],
  };
}
