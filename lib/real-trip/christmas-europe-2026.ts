/**
 * "Christmas in Europe 2026" — Cameron & Xanthia's real trip.
 *
 * Pure builder returning the trip as a DemoTrip descriptor (reusing the
 * well-tested demo data types) for persistence by prisma/seed-real.ts.
 *
 * Round-trip from the Gold Coast (AUD): a Bali overnight, then Munich →
 * Strasbourg → Frankfurt → Paris → London → Belfast → Dublin → Milan → Rome,
 * home via Doha. Booked legs carry real references + actual/paid costs;
 * unbooked internal legs are placeholders. No accommodation booked yet — the
 * pre-trip checklist captures everything still to arrange.
 *
 * Pure module — no Prisma, no React, no network.
 */

import type {
  DemoTrip,
  DemoStop,
  DemoChapter,
  DemoTransport,
  DemoItem,
  DemoChecklistItem,
} from "@/lib/demo/types";

// --- keys ------------------------------------------------------------------

const SK = {
  bali: "xmas26:stop:bali",
  munich: "xmas26:stop:munich",
  strasbourg: "xmas26:stop:strasbourg",
  frankfurt: "xmas26:stop:frankfurt",
  paris: "xmas26:stop:paris",
  london: "xmas26:stop:london",
  belfast: "xmas26:stop:belfast",
  dublin: "xmas26:stop:dublin",
  milan: "xmas26:stop:milan",
  rome: "xmas26:stop:rome",
} as const;

const CK = {
  bali: "xmas26:chapter:bali",
  central: "xmas26:chapter:central-europe",
  ukIreland: "xmas26:chapter:uk-ireland",
  italy: "xmas26:chapter:italy",
} as const;

// --- stops -----------------------------------------------------------------

const STOPS: DemoStop[] = [
  { key: SK.bali, name: "Bali (Denpasar)", country: "Indonesia", countryCode: "id", lat: -8.6705, lng: 115.2126, timezone: "Asia/Makassar", arriveDate: "2026-12-04", departDate: "2026-12-05", chapterKey: CK.bali, sortOrder: 0, notes: "Overnight stopover before the Munich flight." },
  { key: SK.munich, name: "Munich", country: "Germany", countryCode: "de", lat: 48.1351, lng: 11.582, timezone: "Europe/Berlin", arriveDate: "2026-12-06", departDate: "2026-12-10", chapterKey: CK.central, sortOrder: 1 },
  { key: SK.strasbourg, name: "Strasbourg", country: "France", countryCode: "fr", lat: 48.5734, lng: 7.7521, timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-13", chapterKey: CK.central, sortOrder: 2 },
  { key: SK.frankfurt, name: "Frankfurt", country: "Germany", countryCode: "de", lat: 50.1109, lng: 8.6821, timezone: "Europe/Berlin", arriveDate: "2026-12-13", departDate: "2026-12-15", chapterKey: CK.central, sortOrder: 3 },
  { key: SK.paris, name: "Paris", country: "France", countryCode: "fr", lat: 48.8566, lng: 2.3522, timezone: "Europe/Paris", arriveDate: "2026-12-15", departDate: "2026-12-19", chapterKey: CK.central, sortOrder: 4 },
  { key: SK.london, name: "London", country: "United Kingdom", countryCode: "gb", lat: 51.5074, lng: -0.1278, timezone: "Europe/London", arriveDate: "2026-12-19", departDate: "2026-12-22", chapterKey: CK.ukIreland, sortOrder: 5 },
  { key: SK.belfast, name: "Belfast", country: "United Kingdom", countryCode: "gb", lat: 54.5973, lng: -5.9301, timezone: "Europe/London", arriveDate: "2026-12-22", departDate: "2026-12-29", chapterKey: CK.ukIreland, sortOrder: 6, notes: "Christmas in Belfast." },
  { key: SK.dublin, name: "Dublin", country: "Ireland", countryCode: "ie", lat: 53.3498, lng: -6.2603, timezone: "Europe/Dublin", arriveDate: "2026-12-29", departDate: "2026-12-30", chapterKey: CK.ukIreland, sortOrder: 7 },
  { key: SK.milan, name: "Milan", country: "Italy", countryCode: "it", lat: 45.4642, lng: 9.19, timezone: "Europe/Rome", arriveDate: "2026-12-30", departDate: "2027-01-02", chapterKey: CK.italy, sortOrder: 8, notes: "New Year's Eve in Milan." },
  { key: SK.rome, name: "Rome", country: "Italy", countryCode: "it", lat: 41.9028, lng: 12.4964, timezone: "Europe/Rome", arriveDate: "2027-01-02", departDate: "2027-01-07", chapterKey: CK.italy, sortOrder: 9 },
];

// --- chapters --------------------------------------------------------------

const CHAPTERS: DemoChapter[] = [
  { key: CK.bali, name: "Bali stopover", colour: "amber", startDate: "2026-12-04", endDate: "2026-12-05", sortOrder: 0 },
  { key: CK.central, name: "Central Europe", colour: "sky", startDate: "2026-12-06", endDate: "2026-12-19", sortOrder: 1 },
  { key: CK.ukIreland, name: "UK & Ireland", colour: "violet", startDate: "2026-12-19", endDate: "2026-12-30", sortOrder: 2 },
  { key: CK.italy, name: "Italy", colour: "rose", startDate: "2026-12-30", endDate: "2027-01-07", sortOrder: 3 },
];

// --- transports (11) -------------------------------------------------------

const TRANSPORTS: DemoTransport[] = [
  { key: "xmas26:tr:ool-dps", mode: "FLIGHT", fromStopKey: null, toStopKey: SK.bali, depIsHome: true, depPlace: "Gold Coast (OOL)", depAt: "2026-12-04T07:50:00Z", arrPlace: "Denpasar (DPS)", arrAt: "2026-12-04T14:00:00Z", notes: "Virgin Australia — flight number & booking reference TBC. Times approximate.", sortOrder: 0 },
  { key: "xmas26:tr:dps-muc", mode: "FLIGHT", fromStopKey: SK.bali, toStopKey: SK.munich, depPlace: "Denpasar (DPS)", depAt: "2026-12-05T11:00:00Z", arrPlace: "Munich (MUC)", arrAt: "2026-12-06T05:00:00Z", reference: "TG440 · DHZU24", notes: "Thai Airways, Economy. Booking ref DHZU24. Checked-baggage allowance/cost TBC. Arrival time approximate (overnight).", sortOrder: 1 },
  { key: "xmas26:tr:muc-xwg", mode: "TRAIN", fromStopKey: SK.munich, toStopKey: SK.strasbourg, depPlace: "Munich Hbf", depAt: "2026-12-10T05:51:00Z", arrPlace: "Strasbourg", arrAt: "2026-12-10T09:30:00Z", reference: "TGV", notes: "1st class · You + Xanthia.", sortOrder: 2, cost: { costMinor: 23521, paidMinor: 23521, currency: "AUD", paid: true } },
  { key: "xmas26:tr:xwg-fra", mode: "TRAIN", fromStopKey: SK.strasbourg, toStopKey: SK.frankfurt, depPlace: "Strasbourg", depAt: "2026-12-13T10:00:00Z", arrPlace: "Frankfurt (Hbf)", arrAt: "2026-12-13T12:00:00Z", notes: "Not booked yet — placeholder time.", sortOrder: 3 },
  { key: "xmas26:tr:fra-par", mode: "TRAIN", fromStopKey: SK.frankfurt, toStopKey: SK.paris, depPlace: "Frankfurt (Hbf)", depAt: "2026-12-15T10:00:00Z", arrPlace: "Paris (Gare de l'Est)", arrAt: "2026-12-15T14:00:00Z", notes: "Not booked yet — placeholder time.", sortOrder: 4 },
  { key: "xmas26:tr:par-lon", mode: "TRAIN", fromStopKey: SK.paris, toStopKey: SK.london, depPlace: "Paris Gare du Nord", depAt: "2026-12-19T07:02:00Z", arrPlace: "London St Pancras", arrAt: "2026-12-19T09:18:00Z", reference: "Eurostar Plus", notes: "Coach 15, seats 53 & 54. Arrive 120 min early; gates close 30 min before departure. You + Xanthia.", sortOrder: 5, cost: { costMinor: 41438, paidMinor: 41438, currency: "AUD", paid: true } },
  { key: "xmas26:tr:lon-bfs", mode: "FLIGHT", fromStopKey: SK.london, toStopKey: SK.belfast, depPlace: "London Heathrow (LHR)", depAt: "2026-12-22T09:15:00Z", arrPlace: "Belfast City (BHD)", arrAt: "2026-12-22T10:40:00Z", reference: "BA1394 · XHARUZ", notes: "British Airways, Economy. Booking ref XHARUZ.", sortOrder: 6 },
  { key: "xmas26:tr:bfs-dub", mode: "TRAIN", fromStopKey: SK.belfast, toStopKey: SK.dublin, depPlace: "Belfast (Lanyon Place)", depAt: "2026-12-29T11:00:00Z", arrPlace: "Dublin (Connolly)", arrAt: "2026-12-29T13:15:00Z", notes: "Not booked yet — bus/train/drive TBD; placeholder time (Enterprise ~2h15).", sortOrder: 7 },
  { key: "xmas26:tr:dub-mxp", mode: "FLIGHT", fromStopKey: SK.dublin, toStopKey: SK.milan, depPlace: "Dublin (DUB)", depAt: "2026-12-30T08:15:00Z", arrPlace: "Milan Malpensa (MXP)", arrAt: "2026-12-30T10:45:00Z", reference: "FR7799 · H4WP7Q", notes: "Ryanair. Booking ref H4WP7Q. Digital boarding pass via the Ryanair app only — no printed passes.", sortOrder: 8 },
  { key: "xmas26:tr:mil-rom", mode: "TRAIN", fromStopKey: SK.milan, toStopKey: SK.rome, depPlace: "Milano Centrale", depAt: "2027-01-02T09:00:00Z", arrPlace: "Roma Termini", arrAt: "2027-01-02T12:00:00Z", notes: "Not booked yet — high-speed (Frecciarossa ~3h); placeholder time.", sortOrder: 9 },
  { key: "xmas26:tr:rom-bne", mode: "FLIGHT", fromStopKey: SK.rome, toStopKey: null, arrIsHome: true, depPlace: "Rome (FCO)", depAt: "2027-01-07T14:15:00Z", arrPlace: "Brisbane (BNE)", arrAt: "2027-01-08T09:30:00Z", reference: "Qatar · via Doha · 8QPEWK", notes: "Rome → Doha → Brisbane. PNR 8QPEWK. Lands Brisbane — ~1h drive home to the Gold Coast. Times approximate.", sortOrder: 10, cost: { costMinor: 186752, paidMinor: 186752, currency: "EUR", paid: true } },
];

// --- items (1) -------------------------------------------------------------

const ITEMS: DemoItem[] = [
  {
    key: "xmas26:item:neuschwanstein",
    title: "Day trip to Neuschwanstein Castle",
    category: "SIGHTSEEING",
    stopKey: SK.munich,
    date: null,
    lat: 47.5576,
    lng: 10.7498,
    link: "https://www.neuschwanstein.de",
    notes: "The fairytale castle near Füssen — ~2h each way from Munich. Book timed-entry tickets well in advance; winter slots sell out.",
    votes: [{ user: "you", level: "MUST" }],
    sortOrder: 0,
  },
];

// --- pre-trip checklist (20) -----------------------------------------------

const CHECKLIST: DemoChecklistItem[] = [
  { kind: "PRETRIP", text: "Book accommodation — Bali (1 night)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Munich (4 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Strasbourg (3 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Frankfurt (2 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Paris (4 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — London (3 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Belfast (7 nights) — over Christmas, book early", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Dublin (1 night)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Milan (3 nights) — NYE, book early", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Rome (5 nights)", done: false },
  { kind: "PRETRIP", text: "Confirm Gold Coast → Denpasar flight (Virgin) — save flight number + booking ref", done: false },
  { kind: "PRETRIP", text: "Book Strasbourg → Frankfurt train", done: false },
  { kind: "PRETRIP", text: "Book Frankfurt → Paris train", done: false },
  { kind: "PRETRIP", text: "Decide & book Belfast → Dublin transfer (Dec 29)", done: false },
  { kind: "PRETRIP", text: "Book Milan → Rome high-speed train", done: false },
  { kind: "PRETRIP", text: "Book Neuschwanstein Castle timed-entry tickets (in advance)", done: false },
  { kind: "PRETRIP", text: "Travel insurance", done: false },
  { kind: "PRETRIP", text: "Passport valid 6+ months; visas (Indonesia VoA, UK, Schengen)", done: false },
  { kind: "PRETRIP", text: "Confirm TG440 checked-baggage allowance/cost", done: false },
  { kind: "PRETRIP", text: "Download Ryanair app for digital boarding pass (Dublin → Milan)", done: false },
];

// --- builder ---------------------------------------------------------------

export function buildChristmasEurope2026(): DemoTrip {
  return {
    key: "xmas26:trip",
    name: "Christmas in Europe 2026",
    createdBy: "you",
    startDate: "2026-12-04",
    endDate: "2027-01-08",
    homeCurrency: "AUD",
    home: { name: "Gold Coast", lat: -28.0167, lng: 153.4, countryCode: "au" },
    roundTrip: true,
    coverGradient: ["#0c2461", "#b71540"],
    exchangeRates: [
      { base: "EUR", quote: "AUD", rate: 1.65, manual: false, fetchedAt: "2026-07-26T00:00:00Z" },
      { base: "GBP", quote: "AUD", rate: 1.95, manual: false, fetchedAt: "2026-07-26T00:00:00Z" },
      { base: "IDR", quote: "AUD", rate: 0.0001, manual: false, fetchedAt: "2026-07-26T00:00:00Z" },
    ],
    stops: STOPS,
    chapters: CHAPTERS,
    transports: TRANSPORTS,
    accommodations: [],
    items: ITEMS,
    costs: [],
    checklist: CHECKLIST,
  };
}
