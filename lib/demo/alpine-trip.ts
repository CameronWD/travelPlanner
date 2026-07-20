/**
 * Alpine rough road-trip demo data.
 *
 * A rough-only trip (no scheduled stops) that demonstrates:
 *   – Rough stops (nights, no dates/timezone)
 *   – Combined-chapter interleaved route (DE → FR → DE → FR → CH → IT)
 *   – A Firm-up / projected-end that overshoots a hard-end date (OVERRUN)
 *   – CAR and OTHER transport modes
 *   – One rough chapter (Alsace, orange) with explicit membership
 *   – Ungrouped stops (Lucerne, Lake Como) at the tail
 *
 * Pure module — no Prisma, no React, no network.
 */

import type { DemoTrip, DemoStop, DemoTransport, DemoChapter, DemoItem, DemoCost } from "./types";

// ---------------------------------------------------------------------------
// Stop keys
// ---------------------------------------------------------------------------

const SK = {
  munich:    "alp:stop:munich",
  strasbourg:"alp:stop:strasbourg",
  freiburg:  "alp:stop:freiburg",
  colmar:    "alp:stop:colmar",
  lucerne:   "alp:stop:lucerne",
  lakeComo:  "alp:stop:lake-como",
} as const;

// ---------------------------------------------------------------------------
// Chapter keys
// ---------------------------------------------------------------------------

const CK = {
  alsace: "alp:chapter:alsace",
} as const;

// ---------------------------------------------------------------------------
// Stops (ALL rough — no arriveDate/departDate/timezone)
// Total nights: 3+2+2+2+4+3 = 16 → projected end ≈ 2027-05-17 > 2027-05-14
// ---------------------------------------------------------------------------

const STOPS: DemoStop[] = [
  {
    key: SK.munich,
    name: "Munich",
    country: "Germany",
    countryCode: "de",
    lat: 48.1351,
    lng: 11.582,
    nights: 3,
    notes: "Base camp — day-trip to Neuschwanstein castle.",
    sortOrder: 0,
    // ungrouped (home base city, before the Alsace chapter)
  },
  {
    key: SK.strasbourg,
    name: "Strasbourg",
    country: "France",
    countryCode: "fr",
    lat: 48.5734,
    lng: 7.7521,
    nights: 2,
    notes: "Petite France quarter and the cathedral.",
    chapterKey: CK.alsace,
    chapterSortOrder: 0,
    sortOrder: 1,
  },
  {
    key: SK.freiburg,
    name: "Freiburg im Breisgau",
    country: "Germany",
    countryCode: "de",
    lat: 47.999,
    lng: 7.842,
    nights: 2,
    notes: "Black Forest gateway — Schlossberg hike.",
    chapterKey: CK.alsace,
    chapterSortOrder: 1,
    sortOrder: 2,
  },
  {
    key: SK.colmar,
    name: "Colmar",
    country: "France",
    countryCode: "fr",
    lat: 48.0793,
    lng: 7.3585,
    nights: 2,
    notes: "Little Venice canals and Alsatian wine route.",
    chapterKey: CK.alsace,
    chapterSortOrder: 2,
    sortOrder: 3,
  },
  {
    key: SK.lucerne,
    name: "Lucerne",
    country: "Switzerland",
    countryCode: "ch",
    lat: 47.0502,
    lng: 8.3093,
    nights: 4,
    notes: "Chapel Bridge, lake cruise, possible Pilatus ascent.",
    // ungrouped (no chapterKey)
    sortOrder: 4,
  },
  {
    key: SK.lakeComo,
    name: "Lake Como",
    country: "Italy",
    countryCode: "it",
    lat: 45.9937,
    lng: 9.2564,
    nights: 3,
    notes: "Bellagio and the western shore — swim if warm enough.",
    // ungrouped (no chapterKey)
    sortOrder: 5,
  },
];

// ---------------------------------------------------------------------------
// Chapter (rough — no startDate/endDate)
// ---------------------------------------------------------------------------

const CHAPTERS: DemoChapter[] = [
  {
    key: CK.alsace,
    name: "Alsace Loop",
    colour: "orange",
    // No startDate / endDate — rough chapter
    sortOrder: 0,
  },
];

// ---------------------------------------------------------------------------
// Transports
// CAR legs carry depLat/depLng/arrLat/arrLng; depAt/arrAt left null (rough).
// One OTHER leg (cable car, Lucerne → Pilatus summit).
// ---------------------------------------------------------------------------

const TRANSPORTS: DemoTransport[] = [
  {
    key: "alp:tr:munich-strasbourg",
    mode: "CAR",
    fromStopKey: SK.munich,
    toStopKey: SK.strasbourg,
    depLat: 48.1351,
    depLng: 11.582,
    arrLat: 48.5734,
    arrLng: 7.7521,
    notes: "~3.5h via A8/A5 through the Black Forest.",
    sortOrder: 0,
    cost: { estimatedMinor: 4500, currency: "EUR" },
  },
  {
    key: "alp:tr:strasbourg-freiburg",
    mode: "CAR",
    fromStopKey: SK.strasbourg,
    toStopKey: SK.freiburg,
    depLat: 48.5734,
    depLng: 7.7521,
    arrLat: 47.999,
    arrLng: 7.842,
    notes: "~1h via D83 along the Rhine plain.",
    sortOrder: 1,
    cost: { estimatedMinor: 1500, currency: "EUR" },
  },
  {
    key: "alp:tr:freiburg-colmar",
    mode: "CAR",
    fromStopKey: SK.freiburg,
    toStopKey: SK.colmar,
    depLat: 47.999,
    depLng: 7.842,
    arrLat: 48.0793,
    arrLng: 7.3585,
    notes: "~45 min back across the Rhine.",
    sortOrder: 2,
    cost: { estimatedMinor: 1200, currency: "EUR" },
  },
  {
    key: "alp:tr:colmar-lucerne",
    mode: "CAR",
    fromStopKey: SK.colmar,
    toStopKey: SK.lucerne,
    depLat: 48.0793,
    depLng: 7.3585,
    arrLat: 47.0502,
    arrLng: 8.3093,
    notes: "~2.5h south through the Jura into Switzerland.",
    sortOrder: 3,
    cost: { estimatedMinor: 3500, currency: "EUR" },
  },
  {
    key: "alp:tr:lucerne-como",
    mode: "OTHER",
    fromStopKey: SK.lucerne,
    toStopKey: SK.lakeComo,
    depLat: 47.0502,
    depLng: 8.3093,
    arrLat: 45.9937,
    arrLng: 9.2564,
    depPlace: "Lucerne (Autoverlad Gotthard)",
    arrPlace: "Airolo / Lugano → Lake Como",
    notes: "Gotthard car-carrying auto-train through the base tunnel — car on board, no mountain pass.",
    sortOrder: 4,
    cost: { estimatedMinor: 6000, currency: "EUR" },
  },
];

// ---------------------------------------------------------------------------
// Things-to-do items (undated, stop-attached)
// ---------------------------------------------------------------------------

const ITEMS: DemoItem[] = [
  {
    key: "alp:item:neuschwanstein",
    title: "Day trip to Neuschwanstein Castle",
    category: "SIGHTSEEING",
    stopKey: SK.munich,
    notes: "Book timed entry tickets in advance.",
    sortOrder: 0,
  },
  {
    key: "alp:item:petite-france",
    title: "Walk Petite France and the Barrage Vauban",
    category: "SIGHTSEEING",
    stopKey: SK.strasbourg,
    sortOrder: 1,
  },
  {
    key: "alp:item:schlossberg",
    title: "Hike the Schlossberg to the Aussichtsturm",
    category: "ACTIVITY",
    stopKey: SK.freiburg,
    notes: "Free entry to the tower; great Black Forest views.",
    sortOrder: 2,
  },
  {
    key: "alp:item:wine-route",
    title: "Drive the Alsace Wine Route south of Colmar",
    category: "ACTIVITY",
    stopKey: SK.colmar,
    sortOrder: 3,
  },
  {
    key: "alp:item:pilatus",
    title: "Mount Pilatus cable car and cog-railway",
    category: "ACTIVITY",
    stopKey: SK.lucerne,
    notes: "Aerial gondola up from Kriens, world's steepest rack railway down — full loop.",
    cost: { estimatedMinor: 7200, currency: "EUR" },
    sortOrder: 4,
  },
  {
    key: "alp:item:lake-cruise",
    title: "Lake Lucerne evening cruise",
    category: "ACTIVITY",
    stopKey: SK.lucerne,
    notes: "SGV steamboat schedule — check seasonal timetable.",
    sortOrder: 5,
  },
  {
    key: "alp:item:bellagio",
    title: "Ferry to Bellagio and walk the old town",
    category: "SIGHTSEEING",
    stopKey: SK.lakeComo,
    sortOrder: 6,
  },
];

// ---------------------------------------------------------------------------
// Trip-wide wishlist ideas (no stopKey, no date)
// ---------------------------------------------------------------------------

const WISHLIST_ITEMS: DemoItem[] = [
  {
    key: "alp:wish:fondue",
    title: "Traditional cheese fondue dinner in Switzerland",
    category: "FOOD",
    notes: "Wishlist: find a proper mountain hut restaurant.",
    sortOrder: 100,
  },
  {
    key: "alp:wish:paragliding",
    title: "Paragliding tandem flight over the Alps",
    category: "ACTIVITY",
    notes: "Wishlist: Interlaken or Lucerne operators — check weather window.",
    sortOrder: 101,
  },
];

// ---------------------------------------------------------------------------
// Estimated costs (no `paid` — rough estimates only, no accommodation)
// ---------------------------------------------------------------------------

const COSTS: DemoCost[] = [
  {
    ownerType: "OTHER",
    ownerKey: null,
    label: "Highway vignette — Switzerland",
    estimatedMinor: 4400,
    currency: "CHF",
    category: "OTHER",
  },
  {
    ownerType: "OTHER",
    ownerKey: null,
    label: "Petrol budget (entire route)",
    estimatedMinor: 18000,
    currency: "EUR",
    category: "OTHER",
  },
];

// ---------------------------------------------------------------------------
// Trip
// ---------------------------------------------------------------------------

export function buildAlpineTrip(): DemoTrip {
  return {
    key: "alp:trip",
    name: "Alpine Road Loop — Spring 2027",
    createdBy: "you",

    startDate: "2027-05-01",
    endDate: null,
    hardEndDate: "2027-05-14",
    homeCurrency: "EUR",

    home: {
      name: "Munich",
      lat: 48.1351,
      lng: 11.582,
      countryCode: "de",
    },
    roundTrip: true,
    coverGradient: ["#10b981", "#065f46"],

    stops: STOPS,
    chapters: CHAPTERS,
    transports: TRANSPORTS,
    accommodations: [],  // no accommodation — drives rough-stop / next-steps signals
    items: [...ITEMS, ...WISHLIST_ITEMS],
    costs: COSTS,

    exchangeRates: [
      { base: "CHF", quote: "EUR", rate: 1.05, manual: false, fetchedAt: "2027-04-01T00:00:00Z" },
    ],
  };
}
