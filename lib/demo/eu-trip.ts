/**
 * Enriched EU Christmas flagship trip demo data.
 *
 * Builds a fully-populated DemoTrip from the EU Christmas travel scenario
 * (Brisbane home → Rovaniemi → Munich → London → Dublin → Paris → Rome → home),
 * exercising every DemoTrip feature: home base, chapters, pinned stops, wishlist,
 * things-to-do, placed copies, globe marker links, exchange rates, forks, activities,
 * notes, checklists, packing template, reminders, journal entries, and attachments.
 *
 * Pure module — no Prisma, no React, no network.
 */

import type { DemoTrip, DemoFork, DemoStop, DemoTransport, DemoAccommodation, DemoItem, DemoCost, DemoChapter } from "./types";
import { GLOBE_MARKER_KEYS } from "./globe";

// ---------------------------------------------------------------------------
// Stop keys
// ---------------------------------------------------------------------------

const SK = {
  rovaniemi: "eu:stop:rovaniemi",
  munich: "eu:stop:munich",
  london: "eu:stop:london",
  dublin: "eu:stop:dublin",
  paris: "eu:stop:paris",
  rome: "eu:stop:rome",
} as const;

// ---------------------------------------------------------------------------
// Chapter keys
// ---------------------------------------------------------------------------

const CK = {
  lapland: "eu:chapter:lapland",
  bavaria: "eu:chapter:bavaria",
  britishIsles: "eu:chapter:british-isles",
  franceItaly: "eu:chapter:france-italy",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ItemCategory = "SIGHTSEEING" | "FOOD" | "ACTIVITY" | "NIGHTLIFE" | "SHOPPING" | "OTHER";

// ---------------------------------------------------------------------------
// Stops
// ---------------------------------------------------------------------------

const STOPS: DemoStop[] = [
  {
    key: SK.rovaniemi,
    name: "Rovaniemi (Lapland)",
    country: "Finland",
    countryCode: "fi",
    lat: 66.5039,
    lng: 25.7294,
    timezone: "Europe/Helsinki",
    arriveDate: "2026-12-07",
    departDate: "2026-12-11",
    notes: "Arctic Circle. Expect −15°C and only ~3h of daylight.",
    pinned: true,
    chapterKey: CK.lapland,
    sortOrder: 0,
  },
  {
    key: SK.munich,
    name: "Munich",
    country: "Germany",
    countryCode: "de",
    lat: 48.1351,
    lng: 11.582,
    timezone: "Europe/Berlin",
    arriveDate: "2026-12-11",
    departDate: "2026-12-15",
    notes: "Bavaria + Christmas markets.",
    chapterKey: CK.bavaria,
    sortOrder: 1,
  },
  {
    key: SK.london,
    name: "London",
    country: "United Kingdom",
    countryCode: "gb",
    lat: 51.5074,
    lng: -0.1278,
    timezone: "Europe/London",
    arriveDate: "2026-12-15",
    departDate: "2026-12-21",
    chapterKey: CK.britishIsles,
    sortOrder: 2,
  },
  {
    key: SK.dublin,
    name: "Dublin",
    country: "Ireland",
    countryCode: "ie",
    lat: 53.3498,
    lng: -6.2603,
    timezone: "Europe/Dublin",
    arriveDate: "2026-12-21",
    departDate: "2026-12-29",
    notes: "Christmas in Ireland — 8 nights.",
    chapterKey: CK.britishIsles,
    sortOrder: 3,
  },
  {
    key: SK.paris,
    name: "Paris",
    country: "France",
    countryCode: "fr",
    lat: 48.8566,
    lng: 2.3522,
    timezone: "Europe/Paris",
    arriveDate: "2026-12-29",
    departDate: "2027-01-03",
    notes: "New Year's Eve in Paris.",
    pinned: true,
    chapterKey: CK.franceItaly,
    sortOrder: 4,
  },
  {
    key: SK.rome,
    name: "Rome",
    country: "Italy",
    countryCode: "it",
    lat: 41.9028,
    lng: 12.4964,
    timezone: "Europe/Rome",
    arriveDate: "2027-01-03",
    departDate: "2027-01-09",
    notes: "Finale — 6 nights, then the long haul home.",
    chapterKey: CK.franceItaly,
    sortOrder: 5,
  },
];

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

const CHAPTERS: DemoChapter[] = [
  {
    key: CK.lapland,
    name: "Lapland",
    colour: "sky",
    startDate: "2026-12-07",
    endDate: "2026-12-11",
    sortOrder: 0,
  },
  {
    key: CK.bavaria,
    name: "Bavaria",
    colour: "amber",
    startDate: "2026-12-11",
    endDate: "2026-12-15",
    sortOrder: 1,
  },
  {
    key: CK.britishIsles,
    name: "British Isles",
    colour: "emerald",
    startDate: "2026-12-15",
    endDate: "2026-12-29",
    sortOrder: 2,
  },
  {
    key: CK.franceItaly,
    name: "France & Italy",
    colour: "violet",
    startDate: "2026-12-29",
    endDate: "2027-01-09",
    sortOrder: 3,
  },
];

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

const TRANSPORTS: DemoTransport[] = [
  // Outbound: Brisbane → Rovaniemi
  {
    key: "eu:tr:bne-rvn",
    mode: "FLIGHT",
    fromStopKey: null,
    toStopKey: SK.rovaniemi,
    depIsHome: true,
    depPlace: "Brisbane (BNE)",
    depAt: "2026-12-06T11:00:00Z",
    arrPlace: "Rovaniemi (RVN)",
    arrAt: "2026-12-07T15:30:00Z",
    reference: "QF / AY (via HEL)",
    notes: "Brisbane → Helsinki → Rovaniemi. ~24h door to door.",
    sortOrder: 0,
    cost: { estimatedMinor: 220000, actualMinor: 226400, currency: "AUD" },
  },
  // Rovaniemi → Munich
  {
    key: "eu:tr:rvn-muc",
    mode: "FLIGHT",
    fromStopKey: SK.rovaniemi,
    toStopKey: SK.munich,
    depPlace: "Rovaniemi (RVN)",
    depAt: "2026-12-11T08:00:00Z",
    arrPlace: "Munich (MUC)",
    arrAt: "2026-12-11T12:30:00Z",
    reference: "AY1234 / LH (via HEL)",
    sortOrder: 1,
    cost: { estimatedMinor: 46000, currency: "EUR" },
  },
  // Munich → London
  {
    key: "eu:tr:muc-lhr",
    mode: "FLIGHT",
    fromStopKey: SK.munich,
    toStopKey: SK.london,
    depPlace: "Munich (MUC)",
    depAt: "2026-12-15T10:00:00Z",
    arrPlace: "London (LHR)",
    arrAt: "2026-12-15T12:00:00Z",
    reference: "LH2476",
    sortOrder: 2,
    cost: { estimatedMinor: 32000, currency: "EUR" },
  },
  // London → Dublin
  {
    key: "eu:tr:lhr-dub",
    mode: "FLIGHT",
    fromStopKey: SK.london,
    toStopKey: SK.dublin,
    depPlace: "London (LHR)",
    depAt: "2026-12-21T09:30:00Z",
    arrPlace: "Dublin (DUB)",
    arrAt: "2026-12-21T10:55:00Z",
    reference: "EI155",
    sortOrder: 3,
    cost: { estimatedMinor: 18000, currency: "GBP" },
  },
  // Dublin → Paris
  {
    key: "eu:tr:dub-cdg",
    mode: "FLIGHT",
    fromStopKey: SK.dublin,
    toStopKey: SK.paris,
    depPlace: "Dublin (DUB)",
    depAt: "2026-12-29T12:00:00Z",
    arrPlace: "Paris (CDG)",
    arrAt: "2026-12-29T14:10:00Z",
    reference: "EI520",
    sortOrder: 4,
    cost: { estimatedMinor: 24000, currency: "EUR" },
  },
  // Paris → Rome
  {
    key: "eu:tr:cdg-fco",
    mode: "FLIGHT",
    fromStopKey: SK.paris,
    toStopKey: SK.rome,
    depPlace: "Paris (CDG)",
    depAt: "2027-01-03T09:30:00Z",
    arrPlace: "Rome (FCO)",
    arrAt: "2027-01-03T11:35:00Z",
    reference: "AF1004",
    sortOrder: 5,
    cost: { estimatedMinor: 29000, currency: "EUR" },
  },
  // Homeward: Rome → Brisbane
  {
    key: "eu:tr:fco-bne",
    mode: "FLIGHT",
    fromStopKey: SK.rome,
    toStopKey: null,
    arrIsHome: true,
    depPlace: "Rome (FCO)",
    depAt: "2027-01-09T13:00:00Z",
    arrPlace: "Brisbane (BNE)",
    arrAt: "2027-01-10T13:00:00Z",
    reference: "EK / QF (via DXB)",
    notes: "The long way home. Rome → Dubai → Brisbane.",
    sortOrder: 99,
    cost: { estimatedMinor: 240000, currency: "AUD" },
  },
];

// ---------------------------------------------------------------------------
// Accommodations
// ---------------------------------------------------------------------------

const ACCOMMODATIONS: DemoAccommodation[] = [
  {
    key: "eu:acc:igloo",
    stopKey: SK.rovaniemi,
    name: "Arctic Glass Igloo (Santa's Resort)",
    address: "Tähtikuja 2, 96930 Rovaniemi, Finland",
    checkIn: "2026-12-07",
    checkOut: "2026-12-11",
    confirmation: "IGLOO-7741",
    lat: 66.5436,
    lng: 25.8472,
    notes: "Glass roof for aurora-watching from bed.",
    cost: { estimatedMinor: 185000, actualMinor: 189000, currency: "EUR" },
  },
  {
    key: "eu:acc:platzl",
    stopKey: SK.munich,
    name: "Platzl Hotel",
    address: "Sparkassenstraße 10, 80331 München, Germany",
    checkIn: "2026-12-11",
    checkOut: "2026-12-15",
    confirmation: "PLATZL-3392",
    lat: 48.1374,
    lng: 11.5786,
    cost: { estimatedMinor: 88000, actualMinor: 88000, currency: "EUR" },
  },
  {
    key: "eu:acc:bloomsbury",
    stopKey: SK.london,
    name: "The Bloomsbury Hotel",
    address: "16-22 Great Russell St, London WC1B 3NN, UK",
    checkIn: "2026-12-15",
    checkOut: "2026-12-21",
    confirmation: "BLM-44192",
    lat: 51.5169,
    lng: -0.1267,
    cost: { estimatedMinor: 156000, actualMinor: 160500, currency: "GBP" },
  },
  {
    key: "eu:acc:westbury",
    stopKey: SK.dublin,
    name: "The Westbury",
    address: "Balfe St, Dublin 2, D02 H924, Ireland",
    checkIn: "2026-12-21",
    checkOut: "2026-12-29",
    confirmation: "WST-55120",
    lat: 53.3412,
    lng: -6.2603,
    cost: { estimatedMinor: 176000, actualMinor: 181200, currency: "EUR" },
  },
  {
    key: "eu:acc:grands-boulevards",
    stopKey: SK.paris,
    name: "Hôtel des Grands Boulevards",
    address: "17 Boulevard Poissonnière, 75002 Paris, France",
    checkIn: "2026-12-29",
    checkOut: "2027-01-03",
    confirmation: "HGB-7781",
    lat: 48.8709,
    lng: 2.3453,
    notes: "NYE rates — booked early.",
    cost: { estimatedMinor: 165000, actualMinor: 168000, currency: "EUR" },
  },
  {
    key: "eu:acc:artemide",
    stopKey: SK.rome,
    name: "Hotel Artemide",
    address: "Via Nazionale, 22, 00184 Roma RM, Italy",
    checkIn: "2027-01-03",
    checkOut: "2027-01-09",
    confirmation: "ART-30551",
    lat: 41.9009,
    lng: 12.4925,
    cost: { estimatedMinor: 114000, actualMinor: 114000, currency: "EUR" },
  },
];

// ---------------------------------------------------------------------------
// Items (scheduled + wishlist + things-to-do + placed copy)
// ---------------------------------------------------------------------------

function makeItem(
  key: string,
  title: string,
  category: ItemCategory,
  stopKey: string | null,
  date: string | null,
  rest: Partial<DemoItem> = {},
): DemoItem {
  return { key, title, category, stopKey, date, ...rest };
}

const ITEMS: DemoItem[] = [
  // ---- Rovaniemi scheduled ------------------------------------------------
  makeItem("eu:item:santa-village", "Santa Claus Village & cross the Arctic Circle", "SIGHTSEEING", SK.rovaniemi, "2026-12-07", {
    startTime: "18:30", endTime: "20:00",
    lat: 66.5436, lng: 25.8472,
    link: "https://santaclausvillage.info",
    notes: "Get the official Arctic Circle crossing certificate.",
  }),
  makeItem("eu:item:husky-safari", "Husky sled safari", "ACTIVITY", SK.rovaniemi, "2026-12-08", {
    startTime: "09:00", endTime: "12:00",
    booking: "HUSKY-2208",
    notes: "Meeting point pickup 08:45 from the resort.",
    cost: { estimatedMinor: 32000, currency: "EUR" },
  }),
  makeItem("eu:item:reindeer-farm", "Reindeer farm visit & sleigh ride", "ACTIVITY", SK.rovaniemi, "2026-12-08", {
    startTime: "14:00", endTime: "16:00",
    cost: { estimatedMinor: 9000, currency: "EUR" },
  }),
  makeItem("eu:item:arktikum", "Arktikum — Arctic science & Lapland museum", "SIGHTSEEING", SK.rovaniemi, "2026-12-09", {
    startTime: "11:00", endTime: "13:00",
    lat: 66.5108, lng: 25.7242,
    cost: { estimatedMinor: 3600, currency: "EUR" },
  }),
  makeItem("eu:item:aurora-snowmobile", "Northern Lights snowmobile hunt", "ACTIVITY", SK.rovaniemi, "2026-12-09", {
    startTime: "20:00", endTime: "23:00",
    booking: "AURORA-1209",
    notes: "Thermal suits provided. Cross fingers for clear skies.",
    cost: { estimatedMinor: 26000, currency: "EUR" },
  }),
  makeItem("eu:item:snowshoe-trek", "Snowshoe trek through the boreal forest", "ACTIVITY", SK.rovaniemi, "2026-12-10", {
    startTime: "10:00", endTime: "13:00",
    cost: { estimatedMinor: 11000, currency: "EUR" },
  }),
  makeItem("eu:item:smoke-sauna", "Smoke sauna & ice-hole swim", "ACTIVITY", SK.rovaniemi, "2026-12-10", {
    startTime: "18:00", endTime: "20:00",
    notes: "Very Finnish. Very cold. Very worth it.",
    cost: { estimatedMinor: 7000, currency: "EUR" },
  }),

  // ---- Munich scheduled ---------------------------------------------------
  makeItem("eu:item:christkindlmarkt", "Marienplatz Christkindlmarkt & Glühwein", "FOOD", SK.munich, "2026-12-11", {
    startTime: "17:00", endTime: "19:00",
    lat: 48.1374, lng: 11.5755,
    notes: "Keep the Glühwein mug as a souvenir (pfand refundable).",
  }),
  makeItem("eu:item:neuschwanstein", "Neuschwanstein Castle day trip", "SIGHTSEEING", SK.munich, "2026-12-12", {
    startTime: "08:30", endTime: "17:00",
    lat: 47.5576, lng: 10.7498,
    booking: "NEU-1212",
    link: "https://neuschwanstein.de",
    notes: "Snow-covered fairytale castle. Book the timed entry slot.",
    cost: { estimatedMinor: 15000, currency: "EUR" },
  }),
  makeItem("eu:item:glockenspiel", "Glockenspiel, Viktualienmarkt & Frauenkirche", "SIGHTSEEING", SK.munich, "2026-12-13", {
    startTime: "10:00", endTime: "12:30",
    lat: 48.1352, lng: 11.5762,
  }),
  makeItem("eu:item:kaufingerstrasse", "Christmas gift shopping — Kaufingerstraße", "SHOPPING", SK.munich, "2026-12-13", {
    startTime: "13:30", endTime: "15:30",
  }),
  makeItem("eu:item:hofbrauhaus", "Hofbräuhaus dinner & a stein", "FOOD", SK.munich, "2026-12-13", {
    startTime: "19:00", endTime: "21:00",
    lat: 48.1376, lng: 11.5797,
    cost: { estimatedMinor: 11000, currency: "EUR" },
  }),
  makeItem("eu:item:dachau", "Dachau Memorial Site", "SIGHTSEEING", SK.munich, "2026-12-14", {
    startTime: "10:00", endTime: "13:00",
    notes: "Sobering but important. Free entry; audio guide recommended.",
  }),
  makeItem("eu:item:bmw-welt", "BMW Welt & Museum", "ACTIVITY", SK.munich, "2026-12-14", {
    startTime: "15:00", endTime: "17:00",
    lat: 48.1772, lng: 11.5562,
  }),

  // ---- London scheduled ---------------------------------------------------
  makeItem("eu:item:winter-wonderland", "Winter Wonderland, Hyde Park", "ACTIVITY", SK.london, "2026-12-15", {
    startTime: "18:00", endTime: "21:00",
    lat: 51.5073, lng: -0.1657,
  }),
  makeItem("eu:item:tower-of-london", "Tower of London & the Crown Jewels", "SIGHTSEEING", SK.london, "2026-12-16", {
    startTime: "10:00", endTime: "12:30",
    lat: 51.5081, lng: -0.0759,
    booking: "TOL-1216",
    cost: { estimatedMinor: 7800, currency: "GBP" },
  }),
  makeItem("eu:item:lion-king", "The Lion King — Lyceum Theatre", "NIGHTLIFE", SK.london, "2026-12-16", {
    startTime: "19:30", endTime: "22:00",
    lat: 51.5115, lng: -0.1199,
    booking: "WE-LK-882",
    notes: "Booked row F, aisle seats.",
    cost: { estimatedMinor: 18000, actualMinor: 18000, currency: "GBP" },
  }),
  makeItem("eu:item:british-museum", "British Museum (Rosetta Stone, Egypt)", "SIGHTSEEING", SK.london, "2026-12-17", {
    startTime: "10:00", endTime: "13:00",
    lat: 51.5194, lng: -0.127,
    notes: "Free entry — donation suggested.",
  }),
  makeItem("eu:item:borough-market", "Borough Market lunch crawl", "FOOD", SK.london, "2026-12-17", {
    startTime: "13:30", endTime: "14:45",
    lat: 51.5055, lng: -0.0905,
  }),
  makeItem("eu:item:harry-potter-studio", "Harry Potter Warner Bros. Studio Tour", "ACTIVITY", SK.london, "2026-12-18", {
    startTime: "09:00", endTime: "13:00",
    lat: 51.6907, lng: -0.4197,
    booking: "WB-HP-1218",
    cost: { estimatedMinor: 11000, currency: "GBP" },
  }),
  // Placed copy of the Ritz wishlist idea — scheduled for Dec 18 afternoon
  makeItem("eu:item:ritz-tea-scheduled", "Afternoon tea at The Ritz", "FOOD", SK.london, "2026-12-18", {
    startTime: "14:30", endTime: "16:30",
    lat: 51.5074, lng: -0.1419,
    notes: "Smart dress code — jackets for gents.",
    sourceItemKey: "eu:item:ritz-tea",
  }),
  makeItem("eu:item:churchill-war-rooms", "Churchill War Rooms", "SIGHTSEEING", SK.london, "2026-12-19", {
    startTime: "11:00", endTime: "13:00",
    lat: 51.5021, lng: -0.1291,
  }),
  makeItem("eu:item:oxford-regent-lights", "Oxford & Regent Street Christmas lights walk", "SIGHTSEEING", SK.london, "2026-12-19", {
    startTime: "17:00", endTime: "18:30",
  }),
  makeItem("eu:item:bath-stonehenge", "Bath & Stonehenge day trip", "SIGHTSEEING", SK.london, "2026-12-20", {
    startTime: "08:00", endTime: "18:00",
    lat: 51.1789, lng: -1.8262,
    booking: "BATH-1220",
    cost: { estimatedMinor: 16000, currency: "GBP" },
  }),

  // ---- Dublin scheduled ---------------------------------------------------
  makeItem("eu:item:temple-bar", "Temple Bar — live trad music & a pint", "NIGHTLIFE", SK.dublin, "2026-12-21", {
    startTime: "19:00", endTime: "22:00",
    lat: 53.3455, lng: -6.2649,
  }),
  makeItem("eu:item:guinness-storehouse", "Guinness Storehouse & Gravity Bar", "SIGHTSEEING", SK.dublin, "2026-12-22", {
    startTime: "11:00", endTime: "13:00",
    lat: 53.3419, lng: -6.2867,
    booking: "GUIN-1222",
    cost: { estimatedMinor: 6000, currency: "EUR" },
  }),
  makeItem("eu:item:book-of-kells", "Trinity College & the Book of Kells", "SIGHTSEEING", SK.dublin, "2026-12-22", {
    startTime: "14:30", endTime: "16:00",
    lat: 53.3438, lng: -6.2546,
    booking: "TCD-1222",
    cost: { estimatedMinor: 5000, currency: "EUR" },
  }),
  makeItem("eu:item:cliffs-of-moher", "Cliffs of Moher & Galway day trip", "SIGHTSEEING", SK.dublin, "2026-12-23", {
    startTime: "07:30", endTime: "19:00",
    lat: 52.9719, lng: -9.4262,
    booking: "MOHER-1223",
    notes: "Long coach day; includes a stop in Galway.",
    cost: { estimatedMinor: 13000, currency: "EUR" },
  }),
  makeItem("eu:item:christmas-eve-dinner", "Christmas Eve dinner", "FOOD", SK.dublin, "2026-12-24", {
    startTime: "19:00", endTime: "21:30",
    notes: "Book ahead — most kitchens close early on the 24th.",
    cost: { estimatedMinor: 16000, currency: "EUR" },
  }),
  makeItem("eu:item:stephens-green-walk", "Christmas morning stroll — St Stephen's Green", "SIGHTSEEING", SK.dublin, "2026-12-25", {
    startTime: "11:00", endTime: "12:30",
    lat: 53.3382, lng: -6.2591,
    notes: "Almost everything is shut on Christmas Day — keep it gentle.",
  }),
  makeItem("eu:item:dublin-castle", "Dublin Castle & Chester Beatty Library", "SIGHTSEEING", SK.dublin, "2026-12-26", {
    startTime: "11:00", endTime: "13:00",
    lat: 53.3429, lng: -6.2674,
  }),
  makeItem("eu:item:jameson-distillery", "Jameson Distillery tour & tasting", "ACTIVITY", SK.dublin, "2026-12-26", {
    startTime: "15:00", endTime: "16:30",
    lat: 53.3486, lng: -6.2784,
    booking: "JAM-1226",
    cost: { estimatedMinor: 5600, currency: "EUR" },
  }),
  makeItem("eu:item:howth-cliff-walk", "Howth cliff walk & seafood lunch", "ACTIVITY", SK.dublin, "2026-12-27", {
    startTime: "10:00", endTime: "14:00",
    lat: 53.3877, lng: -6.0664,
  }),
  makeItem("eu:item:kilmainham-gaol", "Kilmainham Gaol", "SIGHTSEEING", SK.dublin, "2026-12-28", {
    startTime: "10:00", endTime: "11:30",
    lat: 53.3419, lng: -6.3098,
    booking: "KIL-1228",
    cost: { estimatedMinor: 1600, currency: "EUR" },
  }),
  makeItem("eu:item:farewell-pub-crawl", "Farewell-to-Ireland pub crawl", "NIGHTLIFE", SK.dublin, "2026-12-28", {
    startTime: "20:00", endTime: "23:00",
  }),

  // ---- Paris scheduled ----------------------------------------------------
  makeItem("eu:item:seine-walk", "Seine evening walk & Eiffel sparkle", "SIGHTSEEING", SK.paris, "2026-12-29", {
    startTime: "19:00", endTime: "20:30",
    lat: 48.8584, lng: 2.2945,
    notes: "Tower sparkles for 5 min on the hour after dark.",
  }),
  makeItem("eu:item:louvre", "Louvre Museum", "SIGHTSEEING", SK.paris, "2026-12-30", {
    startTime: "10:00", endTime: "13:00",
    lat: 48.8606, lng: 2.3376,
    booking: "LOUVRE-1230",
    cost: { estimatedMinor: 4400, currency: "EUR" },
  }),
  makeItem("eu:item:champs-elysees", "Champs-Élysées Christmas lights & Arc de Triomphe", "SIGHTSEEING", SK.paris, "2026-12-30", {
    startTime: "18:00", endTime: "19:30",
    lat: 48.8698, lng: 2.3078,
  }),
  makeItem("eu:item:eiffel-summit", "Eiffel Tower summit", "SIGHTSEEING", SK.paris, "2026-12-31", {
    startTime: "14:00", endTime: "16:00",
    lat: 48.8584, lng: 2.2945,
    booking: "ET-558210",
    cost: { estimatedMinor: 7400, currency: "EUR" },
  }),
  makeItem("eu:item:nye-cruise", "New Year's Eve dinner cruise on the Seine", "NIGHTLIFE", SK.paris, "2026-12-31", {
    startTime: "20:00", endTime: "23:30",
    lat: 48.8635, lng: 2.314,
    booking: "NYE-CRUISE-31",
    notes: "Bring a warm coat for the open deck at midnight.",
    cost: { estimatedMinor: 34000, actualMinor: 34000, currency: "EUR" },
  }),
  makeItem("eu:item:sacre-coeur", "Sacré-Cœur & Montmartre (New Year's recovery)", "SIGHTSEEING", SK.paris, "2027-01-01", {
    startTime: "12:00", endTime: "14:00",
    lat: 48.8867, lng: 2.3431,
  }),
  makeItem("eu:item:musee-dorsay", "Musée d'Orsay", "SIGHTSEEING", SK.paris, "2027-01-02", {
    startTime: "10:00", endTime: "12:00",
    lat: 48.86, lng: 2.3266,
    booking: "ORSAY-0102",
  }),
  makeItem("eu:item:le-marais-food", "Le Marais food & pastry tour", "FOOD", SK.paris, "2027-01-02", {
    startTime: "16:00", endTime: "18:00",
    lat: 48.8575, lng: 2.3622,
    cost: { estimatedMinor: 13000, currency: "EUR" },
  }),

  // ---- Rome scheduled -----------------------------------------------------
  makeItem("eu:item:trevi-fountain", "Trevi Fountain & Spanish Steps by night", "SIGHTSEEING", SK.rome, "2027-01-03", {
    startTime: "18:00", endTime: "20:00",
    lat: 41.9009, lng: 12.4833,
    notes: "Toss a coin to guarantee a return to Rome.",
  }),
  makeItem("eu:item:colosseum", "Colosseum, Roman Forum & Palatine guided tour", "SIGHTSEEING", SK.rome, "2027-01-04", {
    startTime: "09:00", endTime: "12:00",
    lat: 41.8902, lng: 12.4922,
    booking: "COL-91002",
    cost: { estimatedMinor: 11000, currency: "EUR" },
  }),
  makeItem("eu:item:gelato-trastevere", "Gelato in Trastevere", "FOOD", SK.rome, "2027-01-04", {
    startTime: "16:00", endTime: "16:45",
    lat: 41.8896, lng: 12.4696,
  }),
  makeItem("eu:item:vatican-museums", "Vatican Museums & Sistine Chapel", "SIGHTSEEING", SK.rome, "2027-01-05", {
    startTime: "09:00", endTime: "12:30",
    lat: 41.9065, lng: 12.4536,
    booking: "VAT-0105",
    cost: { estimatedMinor: 9000, currency: "EUR" },
  }),
  makeItem("eu:item:st-peters", "St Peter's Basilica & the dome climb", "SIGHTSEEING", SK.rome, "2027-01-05", {
    startTime: "14:00", endTime: "15:30",
    lat: 41.9022, lng: 12.4539,
  }),
  makeItem("eu:item:piazza-navona", "Piazza Navona — La Befana Epiphany market", "SIGHTSEEING", SK.rome, "2027-01-06", {
    startTime: "11:00", endTime: "12:30",
    lat: 41.8992, lng: 12.4731,
  }),
  makeItem("eu:item:roman-food-tour", "Roman evening food tour", "FOOD", SK.rome, "2027-01-06", {
    startTime: "18:00", endTime: "20:30",
    booking: "FOOD-0106",
    cost: { estimatedMinor: 16000, currency: "EUR" },
  }),
  makeItem("eu:item:pompeii", "Pompeii day trip", "SIGHTSEEING", SK.rome, "2027-01-07", {
    startTime: "07:30", endTime: "18:00",
    lat: 40.7497, lng: 14.4869,
    booking: "POMP-0107",
    cost: { estimatedMinor: 24000, currency: "EUR" },
  }),
  makeItem("eu:item:borghese", "Borghese Gallery & Gardens", "SIGHTSEEING", SK.rome, "2027-01-08", {
    startTime: "10:00", endTime: "12:00",
    lat: 41.9142, lng: 12.4922,
    booking: "BORG-0108",
  }),
  makeItem("eu:item:final-roman-dinner", "Final Roman dinner — cacio e pepe", "FOOD", SK.rome, "2027-01-08", {
    startTime: "19:30", endTime: "21:30",
    cost: { estimatedMinor: 14000, currency: "EUR" },
  }),

  // ---- Wishlist (trip-wide, no stopKey, no date) --------------------------
  makeItem("eu:item:snowhotel-kemi", "Overnight at the SnowHotel, Kemi", "ACTIVITY", null, null, {
    lat: 65.7362, lng: 24.5638,
    notes: "Sleep in an actual ice room — if we can squeeze it in.",
    votes: [{ user: "you", level: "MUST" }, { user: "partner", level: "KEEN" }],
    sourceMarkerKey: GLOBE_MARKER_KEYS.kemi,
  }),
  makeItem("eu:item:zugspitze", "Zugspitze cable car (Germany's highest peak)", "ACTIVITY", null, null, {
    lat: 47.4211, lng: 10.9853,
    votes: [{ user: "you", level: "KEEN" }, { user: "partner", level: "MUST" }],
  }),
  makeItem("eu:item:ritz-tea", "Afternoon tea at The Ritz", "FOOD", null, null, {
    lat: 51.5074, lng: -0.1419,
    notes: "Smart dress code — jackets for gents.",
    votes: [{ user: "you", level: "MUST" }, { user: "partner", level: "MUST" }],
  }),
  makeItem("eu:item:got-tour", "Game of Thrones tour, Northern Ireland", "ACTIVITY", null, null, {
    notes: "Full-day from Dublin — might be too much on top of Moher.",
    votes: [{ user: "you", level: "MEH" }, { user: "partner", level: "MUST" }],
  }),
  makeItem("eu:item:versailles-day-trip", "Day trip to the Palace of Versailles", "SIGHTSEEING", null, null, {
    lat: 48.8049, lng: 2.1204,
    votes: [{ user: "you", level: "MUST" }, { user: "partner", level: "KEEN" }],
    sourceMarkerKey: GLOBE_MARKER_KEYS.versailles,
  }),
  makeItem("eu:item:pasta-class", "Cooking class: pasta & tiramisù", "ACTIVITY", null, null, {
    votes: [{ user: "you", level: "MUST" }, { user: "partner", level: "MUST" }],
  }),
  makeItem("eu:item:aperitivo-monti", "Aperitivo evening in Monti", "FOOD", null, null, {
    lat: 41.8946, lng: 12.4917,
    votes: [{ user: "you", level: "KEEN" }, { user: "partner", level: "KEEN" }],
  }),

  // ---- Things to do (stop-attached, undated) ------------------------------
  makeItem("eu:item:englischer-garten", "Englischer Garten stroll", "SIGHTSEEING", SK.munich, null, {
    lat: 48.1642, lng: 11.6065,
  }),
  makeItem("eu:item:camden-market", "Camden Market browse", "SHOPPING", SK.london, null, {
    lat: 51.5415, lng: -0.1462,
  }),
  makeItem("eu:item:aventine-keyhole", "Aventine Keyhole view of St Peter's", "SIGHTSEEING", SK.rome, null, {
    lat: 41.882, lng: 12.4784,
  }),
];

// ---------------------------------------------------------------------------
// Costs (OTHER — standalone)
// ---------------------------------------------------------------------------

const COSTS: DemoCost[] = [
  { ownerType: "OTHER", label: "Travel insurance (winter-sports add-on)", category: "Insurance", currency: "AUD", estimatedMinor: 48000, actualMinor: 48000 },
  { ownerType: "OTHER", label: "eSIM data — EU + UK", category: "Connectivity", currency: "AUD", estimatedMinor: 12000 },
  { ownerType: "OTHER", label: "ETIAS authorisation (×2)", category: "Visas & docs", currency: "EUR", estimatedMinor: 1400, actualMinor: 1400 },
  { ownerType: "OTHER", label: "Airport transfers & local transit", category: "Transport", currency: "AUD", estimatedMinor: 40000 },
  { ownerType: "OTHER", label: "Spending money / meals buffer", category: "Food & misc", currency: "AUD", estimatedMinor: 150000 },
  { ownerType: "OTHER", label: "Christmas gifts for each other", category: "Gifts", currency: "AUD", estimatedMinor: 30000 },
];

// ---------------------------------------------------------------------------
// Italy First fork (clean — same window, Rome ↔ Paris swapped)
// ---------------------------------------------------------------------------

// Items for the Italy-first fork — all stopKeys use fork-scoped keys only.
const FORK_ITALY_FIRST_ITEMS: DemoItem[] = [
  makeItem("eu:fork:if:item:husky-safari", "Husky sled safari", "ACTIVITY", "eu:fork:if:stop:rovaniemi", "2026-12-08", {
    startTime: "09:00", endTime: "12:00",
    cost: { estimatedMinor: 32000, currency: "EUR" },
  }),
  makeItem("eu:fork:if:item:neuschwanstein", "Neuschwanstein Castle day trip", "SIGHTSEEING", "eu:fork:if:stop:munich", "2026-12-12", {
    startTime: "08:30", endTime: "17:00",
    cost: { estimatedMinor: 15000, currency: "EUR" },
  }),
  makeItem("eu:fork:if:item:colosseum", "Colosseum & Roman Forum", "SIGHTSEEING", "eu:fork:if:stop:rome", "2026-12-30", {
    startTime: "09:00", endTime: "12:00",
    cost: { estimatedMinor: 11000, currency: "EUR" },
  }),
  makeItem("eu:fork:if:item:eiffel-summit", "Eiffel Tower summit", "SIGHTSEEING", "eu:fork:if:stop:paris", "2027-01-05", {
    startTime: "14:00", endTime: "16:00",
    cost: { estimatedMinor: 7400, currency: "EUR" },
  }),
  makeItem("eu:fork:if:item:nye-cruise", "New Year's Eve dinner cruise on the Seine", "NIGHTLIFE", "eu:fork:if:stop:paris", "2027-01-05", {
    startTime: "20:00", endTime: "23:30",
    cost: { estimatedMinor: 34000, currency: "EUR" },
  }),
];

const FORK_ITALY_FIRST: DemoFork = {
  key: "eu:fork:italy-first",
  name: "Italy first",
  sortOrder: 0,
  createdBy: "you",
  chapters: [],
  stops: [
    // All stops get fork-scoped keys; chapterKey: null (forks have chapters: [])
    {
      key: "eu:fork:if:stop:rovaniemi",
      name: "Rovaniemi (Lapland)",
      country: "Finland",
      countryCode: "fi",
      lat: 66.5039,
      lng: 25.7294,
      timezone: "Europe/Helsinki",
      arriveDate: "2026-12-07",
      departDate: "2026-12-11",
      notes: "Arctic Circle. Expect −15°C and only ~3h of daylight.",
      pinned: true,
      chapterKey: null,
      sortOrder: 0,
    },
    {
      key: "eu:fork:if:stop:munich",
      name: "Munich",
      country: "Germany",
      countryCode: "de",
      lat: 48.1351,
      lng: 11.582,
      timezone: "Europe/Berlin",
      arriveDate: "2026-12-11",
      departDate: "2026-12-15",
      notes: "Bavaria + Christmas markets.",
      chapterKey: null,
      sortOrder: 1,
    },
    {
      key: "eu:fork:if:stop:london",
      name: "London",
      country: "United Kingdom",
      countryCode: "gb",
      lat: 51.5074,
      lng: -0.1278,
      timezone: "Europe/London",
      arriveDate: "2026-12-15",
      departDate: "2026-12-21",
      chapterKey: null,
      sortOrder: 2,
    },
    {
      key: "eu:fork:if:stop:dublin",
      name: "Dublin",
      country: "Ireland",
      countryCode: "ie",
      lat: 53.3498,
      lng: -6.2603,
      timezone: "Europe/Dublin",
      arriveDate: "2026-12-21",
      departDate: "2026-12-29",
      notes: "Christmas in Ireland — 8 nights.",
      chapterKey: null,
      sortOrder: 3,
    },
    // Rome before Paris
    {
      key: "eu:fork:if:stop:rome",
      name: "Rome",
      country: "Italy",
      countryCode: "it",
      lat: 41.9028,
      lng: 12.4964,
      timezone: "Europe/Rome",
      arriveDate: "2026-12-29",
      departDate: "2027-01-04",
      notes: "Finale first — 6 nights.",
      chapterKey: null,
      sortOrder: 4,
    },
    {
      key: "eu:fork:if:stop:paris",
      name: "Paris",
      country: "France",
      countryCode: "fr",
      lat: 48.8566,
      lng: 2.3522,
      timezone: "Europe/Paris",
      arriveDate: "2027-01-04",
      departDate: "2027-01-09",
      notes: "New Year's Eve in Paris.",
      chapterKey: null,
      sortOrder: 5,
    },
  ],
  transports: [
    // Outbound: Brisbane → Rovaniemi
    {
      key: "eu:fork:if:tr:bne-rvn",
      mode: "FLIGHT",
      fromStopKey: null,
      toStopKey: "eu:fork:if:stop:rovaniemi",
      depIsHome: true,
      depPlace: "Brisbane (BNE)",
      depAt: "2026-12-06T11:00:00Z",
      arrPlace: "Rovaniemi (RVN)",
      arrAt: "2026-12-07T15:30:00Z",
      reference: "QF / AY (via HEL)",
      notes: "Brisbane → Helsinki → Rovaniemi. ~24h door to door.",
      sortOrder: 0,
      cost: { estimatedMinor: 220000, actualMinor: 226400, currency: "AUD" },
    },
    // Rovaniemi → Munich
    {
      key: "eu:fork:if:tr:rvn-muc",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:if:stop:rovaniemi",
      toStopKey: "eu:fork:if:stop:munich",
      depPlace: "Rovaniemi (RVN)",
      depAt: "2026-12-11T08:00:00Z",
      arrPlace: "Munich (MUC)",
      arrAt: "2026-12-11T12:30:00Z",
      reference: "AY1234 / LH (via HEL)",
      sortOrder: 1,
      cost: { estimatedMinor: 46000, currency: "EUR" },
    },
    // Munich → London
    {
      key: "eu:fork:if:tr:muc-lhr",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:if:stop:munich",
      toStopKey: "eu:fork:if:stop:london",
      depPlace: "Munich (MUC)",
      depAt: "2026-12-15T10:00:00Z",
      arrPlace: "London (LHR)",
      arrAt: "2026-12-15T12:00:00Z",
      reference: "LH2476",
      sortOrder: 2,
      cost: { estimatedMinor: 32000, currency: "EUR" },
    },
    // London → Dublin
    {
      key: "eu:fork:if:tr:lhr-dub",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:if:stop:london",
      toStopKey: "eu:fork:if:stop:dublin",
      depPlace: "London (LHR)",
      depAt: "2026-12-21T09:30:00Z",
      arrPlace: "Dublin (DUB)",
      arrAt: "2026-12-21T10:55:00Z",
      reference: "EI155",
      sortOrder: 3,
      cost: { estimatedMinor: 18000, currency: "GBP" },
    },
    // Dublin → Rome (reordered)
    {
      key: "eu:fork:if:tr:dub-fco",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:if:stop:dublin",
      toStopKey: "eu:fork:if:stop:rome",
      depPlace: "Dublin (DUB)",
      depAt: "2026-12-29T12:00:00Z",
      arrPlace: "Rome (FCO)",
      arrAt: "2026-12-29T17:00:00Z",
      reference: "EI / AZ",
      sortOrder: 4,
      cost: { estimatedMinor: 27000, currency: "EUR" },
    },
    // Rome → Paris
    {
      key: "eu:fork:if:tr:fco-cdg",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:if:stop:rome",
      toStopKey: "eu:fork:if:stop:paris",
      depPlace: "Rome (FCO)",
      depAt: "2027-01-04T08:00:00Z",
      arrPlace: "Paris (CDG)",
      arrAt: "2027-01-04T10:30:00Z",
      reference: "AF1003",
      sortOrder: 5,
      cost: { estimatedMinor: 29000, currency: "EUR" },
    },
    // Homeward from Paris
    {
      key: "eu:fork:if:tr:cdg-bne",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:if:stop:paris",
      toStopKey: null,
      arrIsHome: true,
      depPlace: "Paris (CDG)",
      depAt: "2027-01-09T13:00:00Z",
      arrPlace: "Brisbane (BNE)",
      arrAt: "2027-01-10T13:00:00Z",
      reference: "EK / QF (via DXB)",
      notes: "Home via Dubai.",
      sortOrder: 99,
      cost: { estimatedMinor: 240000, currency: "AUD" },
    },
  ],
  accommodations: [
    // Rovaniemi
    {
      key: "eu:fork:if:acc:igloo",
      stopKey: "eu:fork:if:stop:rovaniemi",
      name: "Arctic Glass Igloo (Santa's Resort)",
      address: "Tähtikuja 2, 96930 Rovaniemi, Finland",
      checkIn: "2026-12-07",
      checkOut: "2026-12-11",
      confirmation: "IGLOO-7741",
      lat: 66.5436,
      lng: 25.8472,
      notes: "Glass roof for aurora-watching from bed.",
      cost: { estimatedMinor: 185000, actualMinor: 189000, currency: "EUR" },
    },
    // Munich
    {
      key: "eu:fork:if:acc:platzl",
      stopKey: "eu:fork:if:stop:munich",
      name: "Platzl Hotel",
      address: "Sparkassenstraße 10, 80331 München, Germany",
      checkIn: "2026-12-11",
      checkOut: "2026-12-15",
      confirmation: "PLATZL-3392",
      lat: 48.1374,
      lng: 11.5786,
      cost: { estimatedMinor: 88000, actualMinor: 88000, currency: "EUR" },
    },
    // London
    {
      key: "eu:fork:if:acc:bloomsbury",
      stopKey: "eu:fork:if:stop:london",
      name: "The Bloomsbury Hotel",
      address: "16-22 Great Russell St, London WC1B 3NN, UK",
      checkIn: "2026-12-15",
      checkOut: "2026-12-21",
      confirmation: "BLM-44192",
      lat: 51.5169,
      lng: -0.1267,
      cost: { estimatedMinor: 156000, actualMinor: 160500, currency: "GBP" },
    },
    // Dublin
    {
      key: "eu:fork:if:acc:westbury",
      stopKey: "eu:fork:if:stop:dublin",
      name: "The Westbury",
      address: "Balfe St, Dublin 2, D02 H924, Ireland",
      checkIn: "2026-12-21",
      checkOut: "2026-12-29",
      confirmation: "WST-55120",
      lat: 53.3412,
      lng: -6.2603,
      cost: { estimatedMinor: 176000, actualMinor: 181200, currency: "EUR" },
    },
    // Rome first (Dec 29 – Jan 4)
    {
      key: "eu:fork:if:acc:artemide",
      stopKey: "eu:fork:if:stop:rome",
      name: "Hotel Artemide",
      address: "Via Nazionale, 22, 00184 Roma RM, Italy",
      checkIn: "2026-12-29",
      checkOut: "2027-01-04",
      confirmation: "ART-IF-30551",
      lat: 41.9009,
      lng: 12.4925,
      cost: { estimatedMinor: 114000, currency: "EUR" },
    },
    // Paris (Jan 4 – Jan 9)
    {
      key: "eu:fork:if:acc:grands-boulevards",
      stopKey: "eu:fork:if:stop:paris",
      name: "Hôtel des Grands Boulevards",
      address: "17 Boulevard Poissonnière, 75002 Paris, France",
      checkIn: "2027-01-04",
      checkOut: "2027-01-09",
      confirmation: "HGB-IF-7781",
      lat: 48.8709,
      lng: 2.3453,
      cost: { estimatedMinor: 165000, currency: "EUR" },
    },
  ],
  items: FORK_ITALY_FIRST_ITEMS,
  costs: COSTS,
};

// ---------------------------------------------------------------------------
// "+ Switzerland" fork — Paris SCHEDULED, then rough Zermatt (4n) + Interlaken (4n)
// + rough Rome (6n); projected end Jan 17 > hardEndDate 2027-01-16
// ---------------------------------------------------------------------------

// Items for the +Switzerland fork. All stopKeys use fork-scoped keys only.
const FORK_PLUS_CH_ITEMS: DemoItem[] = [
  makeItem("eu:fork:ch:item:husky-safari", "Husky sled safari", "ACTIVITY", "eu:fork:ch:stop:rovaniemi", "2026-12-08", {
    startTime: "09:00", endTime: "12:00",
    cost: { estimatedMinor: 32000, currency: "EUR" },
  }),
  makeItem("eu:fork:ch:item:eiffel-summit", "Eiffel Tower summit", "SIGHTSEEING", "eu:fork:ch:stop:paris", "2026-12-31", {
    startTime: "14:00", endTime: "16:00",
    cost: { estimatedMinor: 7400, currency: "EUR" },
  }),
  makeItem("eu:fork:ch:item:zermatt-ski", "Ski Zermatt — Matterhorn panorama run", "ACTIVITY", "eu:fork:ch:stop:zermatt", null, {
    notes: "Full-day ski with gondola pass.",
    cost: { estimatedMinor: 22000, currency: "CHF" },
  }),
  makeItem("eu:fork:ch:item:interlaken-paraglide", "Tandem paragliding over Interlaken", "ACTIVITY", "eu:fork:ch:stop:interlaken", null, {
    notes: "Weather-dependent — check forecast the night before.",
    cost: { estimatedMinor: 19000, currency: "CHF" },
  }),
  makeItem("eu:fork:ch:item:colosseum", "Colosseum & Roman Forum", "SIGHTSEEING", "eu:fork:ch:stop:rome", null, {
    notes: "Book skip-the-line entry in advance.",
    cost: { estimatedMinor: 11000, currency: "EUR" },
  }),
];

const FORK_PLUS_CH: DemoFork = {
  key: "eu:fork:plus-ch",
  name: "+ Switzerland",
  sortOrder: 1,
  createdBy: "partner",
  chapters: [],
  stops: [
    // All stops get fork-scoped keys; chapterKey: null (forks have chapters: [])
    {
      key: "eu:fork:ch:stop:rovaniemi",
      name: "Rovaniemi (Lapland)",
      country: "Finland",
      countryCode: "fi",
      lat: 66.5039,
      lng: 25.7294,
      timezone: "Europe/Helsinki",
      arriveDate: "2026-12-07",
      departDate: "2026-12-11",
      notes: "Arctic Circle. Expect −15°C and only ~3h of daylight.",
      pinned: true,
      chapterKey: null,
      sortOrder: 0,
    },
    {
      key: "eu:fork:ch:stop:munich",
      name: "Munich",
      country: "Germany",
      countryCode: "de",
      lat: 48.1351,
      lng: 11.582,
      timezone: "Europe/Berlin",
      arriveDate: "2026-12-11",
      departDate: "2026-12-15",
      notes: "Bavaria + Christmas markets.",
      chapterKey: null,
      sortOrder: 1,
    },
    {
      key: "eu:fork:ch:stop:london",
      name: "London",
      country: "United Kingdom",
      countryCode: "gb",
      lat: 51.5074,
      lng: -0.1278,
      timezone: "Europe/London",
      arriveDate: "2026-12-15",
      departDate: "2026-12-21",
      chapterKey: null,
      sortOrder: 2,
    },
    {
      key: "eu:fork:ch:stop:dublin",
      name: "Dublin",
      country: "Ireland",
      countryCode: "ie",
      lat: 53.3498,
      lng: -6.2603,
      timezone: "Europe/Dublin",
      arriveDate: "2026-12-21",
      departDate: "2026-12-29",
      notes: "Christmas in Ireland — 8 nights.",
      chapterKey: null,
      sortOrder: 3,
    },
    // Paris scheduled (departs 2027-01-03)
    {
      key: "eu:fork:ch:stop:paris",
      name: "Paris",
      country: "France",
      countryCode: "fr",
      lat: 48.8566,
      lng: 2.3522,
      timezone: "Europe/Paris",
      arriveDate: "2026-12-29",
      departDate: "2027-01-03",
      notes: "New Year's Eve in Paris.",
      pinned: true,
      chapterKey: null,
      sortOrder: 4,
    },
    // Rough Swiss extension: Zermatt ~4 nights
    {
      key: "eu:fork:ch:stop:zermatt",
      name: "Zermatt",
      country: "Switzerland",
      countryCode: "ch",
      lat: 46.0207,
      lng: 7.7491,
      timezone: "Europe/Zurich",
      arriveDate: null,
      departDate: null,
      nights: 4,
      sortOrder: 5,
    },
    // Rough Swiss extension: Interlaken ~4 nights
    {
      key: "eu:fork:ch:stop:interlaken",
      name: "Interlaken",
      country: "Switzerland",
      countryCode: "ch",
      lat: 46.6863,
      lng: 7.8632,
      timezone: "Europe/Zurich",
      arriveDate: null,
      departDate: null,
      nights: 4,
      sortOrder: 6,
    },
    // Rome is rough (no dates) in this fork — ~6 nights is realistic.
    // Projected tail flows from Paris depart (2027-01-03): +4+4+6 = 2027-01-17 > hardEndDate 2027-01-16
    {
      key: "eu:fork:ch:stop:rome",
      name: "Rome",
      country: "Italy",
      countryCode: "it",
      lat: 41.9028,
      lng: 12.4964,
      timezone: "Europe/Rome",
      arriveDate: null,
      departDate: null,
      nights: 6,
      sortOrder: 7,
    },
  ],
  transports: [
    // Outbound: Brisbane → Rovaniemi
    {
      key: "eu:fork:ch:tr:bne-rvn",
      mode: "FLIGHT",
      fromStopKey: null,
      toStopKey: "eu:fork:ch:stop:rovaniemi",
      depIsHome: true,
      depPlace: "Brisbane (BNE)",
      depAt: "2026-12-06T11:00:00Z",
      arrPlace: "Rovaniemi (RVN)",
      arrAt: "2026-12-07T15:30:00Z",
      reference: "QF / AY (via HEL)",
      notes: "Brisbane → Helsinki → Rovaniemi. ~24h door to door.",
      sortOrder: 0,
      cost: { estimatedMinor: 220000, actualMinor: 226400, currency: "AUD" },
    },
    // Rovaniemi → Munich
    {
      key: "eu:fork:ch:tr:rvn-muc",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:ch:stop:rovaniemi",
      toStopKey: "eu:fork:ch:stop:munich",
      depPlace: "Rovaniemi (RVN)",
      depAt: "2026-12-11T08:00:00Z",
      arrPlace: "Munich (MUC)",
      arrAt: "2026-12-11T12:30:00Z",
      reference: "AY1234 / LH (via HEL)",
      sortOrder: 1,
      cost: { estimatedMinor: 46000, currency: "EUR" },
    },
    // Munich → London
    {
      key: "eu:fork:ch:tr:muc-lhr",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:ch:stop:munich",
      toStopKey: "eu:fork:ch:stop:london",
      depPlace: "Munich (MUC)",
      depAt: "2026-12-15T10:00:00Z",
      arrPlace: "London (LHR)",
      arrAt: "2026-12-15T12:00:00Z",
      reference: "LH2476",
      sortOrder: 2,
      cost: { estimatedMinor: 32000, currency: "EUR" },
    },
    // London → Dublin
    {
      key: "eu:fork:ch:tr:lhr-dub",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:ch:stop:london",
      toStopKey: "eu:fork:ch:stop:dublin",
      depPlace: "London (LHR)",
      depAt: "2026-12-21T09:30:00Z",
      arrPlace: "Dublin (DUB)",
      arrAt: "2026-12-21T10:55:00Z",
      reference: "EI155",
      sortOrder: 3,
      cost: { estimatedMinor: 18000, currency: "GBP" },
    },
    // Dublin → Paris
    {
      key: "eu:fork:ch:tr:dub-cdg",
      mode: "FLIGHT",
      fromStopKey: "eu:fork:ch:stop:dublin",
      toStopKey: "eu:fork:ch:stop:paris",
      depPlace: "Dublin (DUB)",
      depAt: "2026-12-29T12:00:00Z",
      arrPlace: "Paris (CDG)",
      arrAt: "2026-12-29T14:10:00Z",
      reference: "EI520",
      sortOrder: 4,
      cost: { estimatedMinor: 24000, currency: "EUR" },
    },
  ],
  accommodations: [
    // Rovaniemi
    {
      key: "eu:fork:ch:acc:igloo",
      stopKey: "eu:fork:ch:stop:rovaniemi",
      name: "Arctic Glass Igloo (Santa's Resort)",
      address: "Tähtikuja 2, 96930 Rovaniemi, Finland",
      checkIn: "2026-12-07",
      checkOut: "2026-12-11",
      confirmation: "IGLOO-7741",
      lat: 66.5436,
      lng: 25.8472,
      notes: "Glass roof for aurora-watching from bed.",
      cost: { estimatedMinor: 185000, actualMinor: 189000, currency: "EUR" },
    },
    // Munich
    {
      key: "eu:fork:ch:acc:platzl",
      stopKey: "eu:fork:ch:stop:munich",
      name: "Platzl Hotel",
      address: "Sparkassenstraße 10, 80331 München, Germany",
      checkIn: "2026-12-11",
      checkOut: "2026-12-15",
      confirmation: "PLATZL-3392",
      lat: 48.1374,
      lng: 11.5786,
      cost: { estimatedMinor: 88000, actualMinor: 88000, currency: "EUR" },
    },
    // London
    {
      key: "eu:fork:ch:acc:bloomsbury",
      stopKey: "eu:fork:ch:stop:london",
      name: "The Bloomsbury Hotel",
      address: "16-22 Great Russell St, London WC1B 3NN, UK",
      checkIn: "2026-12-15",
      checkOut: "2026-12-21",
      confirmation: "BLM-44192",
      lat: 51.5169,
      lng: -0.1267,
      cost: { estimatedMinor: 156000, actualMinor: 160500, currency: "GBP" },
    },
    // Dublin
    {
      key: "eu:fork:ch:acc:westbury",
      stopKey: "eu:fork:ch:stop:dublin",
      name: "The Westbury",
      address: "Balfe St, Dublin 2, D02 H924, Ireland",
      checkIn: "2026-12-21",
      checkOut: "2026-12-29",
      confirmation: "WST-55120",
      lat: 53.3412,
      lng: -6.2603,
      cost: { estimatedMinor: 176000, actualMinor: 181200, currency: "EUR" },
    },
    // Paris
    {
      key: "eu:fork:ch:acc:grands-boulevards",
      stopKey: "eu:fork:ch:stop:paris",
      name: "Hôtel des Grands Boulevards",
      address: "17 Boulevard Poissonnière, 75002 Paris, France",
      checkIn: "2026-12-29",
      checkOut: "2027-01-03",
      confirmation: "HGB-7781",
      lat: 48.8709,
      lng: 2.3453,
      notes: "NYE rates — booked early.",
      cost: { estimatedMinor: 165000, actualMinor: 168000, currency: "EUR" },
    },
  ],
  items: FORK_PLUS_CH_ITEMS,
  costs: [
    ...COSTS,
    // CHF costs specific to this fork
    {
      ownerType: "OTHER",
      label: "Zermatt ski pass & gondola",
      category: "Activity",
      currency: "CHF",
      estimatedMinor: 45000,
    },
    {
      ownerType: "OTHER",
      label: "Interlaken adventure activities",
      category: "Activity",
      currency: "CHF",
      estimatedMinor: 32000,
    },
  ],
};

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildEuTrip(): DemoTrip {
  return {
    key: "eu:trip:christmas-2026",
    name: "EU Christmas 2026",
    createdBy: "you",
    startDate: "2026-12-06",
    endDate: "2027-01-09",
    hardEndDate: "2027-01-16",
    homeCurrency: "AUD",
    home: { name: "Brisbane", lat: -27.4698, lng: 153.0251, countryCode: "au" },
    roundTrip: true,
    coverGradient: ["#0ea5e9", "#1e3a8a"],

    stops: STOPS,
    chapters: CHAPTERS,
    transports: TRANSPORTS,
    accommodations: ACCOMMODATIONS,
    items: ITEMS,
    costs: COSTS,

    exchangeRates: [
      { base: "EUR", quote: "AUD", rate: 1.63, manual: false, fetchedAt: "2026-06-20T00:00:00Z" },
      { base: "GBP", quote: "AUD", rate: 1.91, manual: true, fetchedAt: "2026-06-21T00:00:00Z" },
      { base: "CHF", quote: "AUD", rate: 1.72, manual: true, fetchedAt: "2026-06-21T00:00:00Z" },
    ],

    forks: [FORK_ITALY_FIRST, FORK_PLUS_CH],

    // --- Notes ------------------------------------------------------------
    notes: [
      {
        author: "partner",
        targetType: "STOP",
        targetKey: SK.rovaniemi,
        body: "Pack proper thermals — it'll be around −15°C and barely 3 hours of daylight!",
      },
      {
        author: "you",
        targetType: "ITEM",
        targetKey: "eu:item:lion-king",
        body: "Booked row F, aisle seats. Doors 19:00.",
      },
      {
        author: "partner",
        targetType: "ITEM",
        targetKey: "eu:item:cliffs-of-moher",
        body: "Coach picks up at 07:30 sharp from the hotel — set an alarm.",
      },
      {
        author: "you",
        targetType: "ITEM",
        targetKey: "eu:item:vatican-museums",
        body: "Dress code is strict: shoulders and knees covered.",
      },
      {
        author: "partner",
        targetType: "ACCOMMODATION",
        targetKey: "eu:acc:igloo",
        body: "Confirmation says aurora wake-up call is opt-in at reception.",
      },
    ],

    // --- Checklist --------------------------------------------------------
    checklist: [
      // Pre-trip
      { kind: "PRETRIP", text: "Renew passports (6-month validity rule)", done: true, dueDate: "2026-09-01", assignedTo: "you" },
      { kind: "PRETRIP", text: "Apply for ETIAS travel authorisation (×2)", done: false, dueDate: "2026-10-15", assignedTo: "partner" },
      { kind: "PRETRIP", text: "Travel insurance with winter-sports cover", done: true, dueDate: "2026-10-01", assignedTo: "you" },
      { kind: "PRETRIP", text: "Book Lapland igloo + husky safari", done: true, assignedTo: "partner" },
      { kind: "PRETRIP", text: "Order euros & pounds cash", done: false, dueDate: "2026-11-20", assignedTo: "you" },
      { kind: "PRETRIP", text: "Set up EU + UK eSIM", done: false, assignedTo: "partner" },
      { kind: "PRETRIP", text: "Notify bank of travel dates", done: false, dueDate: "2026-12-01", assignedTo: "you" },
      { kind: "PRETRIP", text: "Download offline maps & boarding passes", done: false, dueDate: "2026-12-05" },
      // Packing (lifted from Brisbane stop "Pack, weigh bags & head to BNE airport")
      { kind: "PRETRIP", text: "Pack, weigh bags & head to BNE airport", done: false, dueDate: "2026-12-06", assignedTo: "you" },
      // Packing items
      { kind: "PACKING", text: "Thermal base layers (×4)", done: true, assignedTo: "you" },
      { kind: "PACKING", text: "Heavy insulated winter coat", done: true, assignedTo: "partner" },
      { kind: "PACKING", text: "Waterproof snow boots", done: false, assignedTo: "you" },
      { kind: "PACKING", text: "Gloves, beanie & scarf", done: false, assignedTo: "partner" },
      { kind: "PACKING", text: "Power adapters (EU + UK type G)", done: false },
      { kind: "PACKING", text: "Reusable water bottle", done: true },
      { kind: "PACKING", text: "Christmas gifts for each other", done: false, assignedTo: "you" },
      { kind: "PACKING", text: "Medications + copies of prescriptions", done: false, assignedTo: "partner" },
    ],

    // --- Packing template -------------------------------------------------
    packingTemplates: [
      {
        name: "Winter Europe",
        owner: "you",
        items: [
          "Thermal base layers",
          "Insulated winter coat",
          "Waterproof snow boots",
          "Gloves, beanie & scarf",
          "Hand & toe warmers",
          "Lip balm & heavy moisturiser",
          "EU + UK power adapters",
          "Portable battery pack",
        ],
      },
    ],

    // --- Reminders --------------------------------------------------------
    reminders: [
      { title: "Pay the balance on the Lapland igloo", fireAt: "2026-11-01T23:00:00Z" },
      { title: "Apply for ETIAS authorisation", fireAt: "2026-10-15T23:00:00Z" },
      {
        title: "Check in online for the flight to Helsinki",
        fireAt: "2026-12-05T09:00:00Z",
        targetType: "TRANSPORT",
        targetKey: "eu:tr:bne-rvn",
      },
      {
        title: "Husky safari pickup — be at reception 08:45",
        fireAt: "2026-12-08T06:30:00Z",
        targetType: "ITEM",
        targetKey: "eu:item:husky-safari",
      },
      {
        title: "Eiffel summit tickets — arrive 30 min early",
        fireAt: "2026-12-31T12:30:00Z",
        targetType: "ITEM",
        targetKey: "eu:item:eiffel-summit",
      },
    ],

    // --- Journal ----------------------------------------------------------
    journal: [
      {
        date: "2026-12-07",
        author: "you",
        body: "Made it to the Arctic Circle after ~24 hours of flying. Stepped outside and the cold genuinely takes your breath away. The igloo is unreal — lying in bed looking up at the stars through the glass roof.",
      },
      {
        date: "2026-12-09",
        author: "partner",
        body: "AURORA. We almost gave up around 10pm and then the whole sky turned green and rippled for twenty minutes. No photo does it justice. Best night of my life, easily.",
      },
      {
        date: "2026-12-25",
        author: "you",
        body: "Christmas morning in Dublin. The whole city is shut and silent — we walked through St Stephen's Green with takeaway coffees and had it almost to ourselves. Quiet and perfect.",
      },
      {
        date: "2026-12-31",
        author: "partner",
        body: "New Year's Eve on the Seine. Midnight on the deck, freezing, the Eiffel Tower sparkling. Counting down in French with strangers. What a way to end the year.",
      },
    ],

    // --- Attachments ------------------------------------------------------
    attachments: [
      {
        targetType: "TRIP",
        targetKey: "TRIP",
        filename: "trip-overview.txt",
        mime: "text/plain",
        body: "AI TRIP - EU Christmas\n6 Dec 2026 – 9 Jan 2027\nBrisbane → Lapland → Munich → London → Dublin → Paris → Rome → home.\nHome currency: AUD. Two travellers.",
      },
      {
        targetType: "TRANSPORT",
        targetKey: "eu:tr:bne-rvn",
        filename: "eticket-BNE-HEL-RVN.txt",
        mime: "text/plain",
        body: "E-TICKET / booking QF-AY via HEL\nPassengers: You, Partner\nBNE 21:00 06DEC → HEL → RVN 17:30 07DEC\nBaggage: 2 x 23kg checked.",
      },
      {
        targetType: "ACCOMMODATION",
        targetKey: "eu:acc:igloo",
        filename: "igloo-confirmation.txt",
        mime: "text/plain",
        body: "Arctic Glass Igloo — confirmation IGLOO-7741\nCheck-in 07 Dec, check-out 11 Dec (4 nights)\nIncludes breakfast + optional aurora wake-up call.",
      },
    ],

    // --- Activities -------------------------------------------------------
    activities: [
      // Created events (by you) — older
      {
        actor: "you",
        verb: "CREATED",
        entityType: "STOP",
        entityKey: SK.rovaniemi,
        entityLabel: "Rovaniemi (Lapland)",
        at: "2026-06-01T09:00:00Z",
      },
      {
        actor: "you",
        verb: "CREATED",
        entityType: "STOP",
        entityKey: SK.munich,
        entityLabel: "Munich",
        at: "2026-06-01T09:05:00Z",
      },
      {
        actor: "you",
        verb: "CREATED",
        entityType: "STOP",
        entityKey: SK.london,
        entityLabel: "London",
        at: "2026-06-01T09:10:00Z",
      },
      {
        actor: "you",
        verb: "CREATED",
        entityType: "STOP",
        entityKey: SK.dublin,
        entityLabel: "Dublin",
        at: "2026-06-01T09:15:00Z",
      },
      {
        actor: "you",
        verb: "CREATED",
        entityType: "STOP",
        entityKey: SK.paris,
        entityLabel: "Paris",
        at: "2026-06-01T09:20:00Z",
      },
      {
        actor: "you",
        verb: "CREATED",
        entityType: "STOP",
        entityKey: SK.rome,
        entityLabel: "Rome",
        at: "2026-06-01T09:25:00Z",
      },
      {
        actor: "you",
        verb: "CREATED",
        entityType: "TRANSPORT",
        entityKey: "eu:tr:bne-rvn",
        entityLabel: "Brisbane → Rovaniemi",
        at: "2026-06-02T10:00:00Z",
      },
      {
        actor: "you",
        verb: "UPDATED",
        entityType: "COST",
        entityKey: "eu:tr:bne-rvn",
        entityLabel: "Outbound flight",
        changes: [{ field: "actualMinor", label: "Actual", from: "", to: "$2,264.00" }],
        at: "2026-06-10T14:30:00Z",
      },
      {
        actor: "you",
        verb: "UPDATED",
        entityType: "ITEM",
        entityKey: "eu:item:husky-safari",
        entityLabel: "Husky sled safari",
        changes: [{ field: "startTime", label: "Start time", from: "08:00", to: "09:00" }],
        at: "2026-06-15T11:00:00Z",
      },
      // Notes — mirroring the 5 notes
      {
        actor: "partner",
        verb: "NOTED",
        entityType: "STOP",
        entityKey: SK.rovaniemi,
        entityLabel: "Rovaniemi (Lapland)",
        changes: { excerpt: "Pack proper thermals — it'll be around −15°C and barely 3 hours of daylight!" },
        at: "2026-06-20T08:00:00Z",
      },
      {
        actor: "you",
        verb: "NOTED",
        entityType: "ITEM",
        entityKey: "eu:item:lion-king",
        entityLabel: "The Lion King — Lyceum Theatre",
        changes: { excerpt: "Booked row F, aisle seats. Doors 19:00." },
        at: "2026-06-22T09:00:00Z",
      },
      {
        actor: "partner",
        verb: "NOTED",
        entityType: "ITEM",
        entityKey: "eu:item:cliffs-of-moher",
        entityLabel: "Cliffs of Moher & Galway day trip",
        changes: { excerpt: "Coach picks up at 07:30 sharp from the hotel — set an alarm." },
        at: "2026-06-25T10:00:00Z",
      },
      {
        actor: "you",
        verb: "NOTED",
        entityType: "ITEM",
        entityKey: "eu:item:vatican-museums",
        entityLabel: "Vatican Museums & Sistine Chapel",
        changes: { excerpt: "Dress code is strict: shoulders and knees covered." },
        at: "2026-07-01T09:00:00Z",
      },
      {
        actor: "partner",
        verb: "NOTED",
        entityType: "ACCOMMODATION",
        entityKey: "eu:acc:igloo",
        entityLabel: "Arctic Glass Igloo",
        changes: { excerpt: "Confirmation says aurora wake-up call is opt-in at reception." },
        at: "2026-07-05T11:00:00Z",
      },
      // Fork created
      {
        actor: "you",
        verb: "CREATED",
        entityType: "FORK",
        entityKey: "eu:fork:italy-first",
        entityLabel: "Italy first",
        at: "2026-07-10T14:00:00Z",
      },
      // Two newest activities — by partner, unread for "you"
      {
        actor: "partner",
        verb: "CREATED",
        entityType: "ITEM",
        entityKey: "eu:item:snowhotel-kemi",
        entityLabel: "Overnight at the SnowHotel, Kemi",
        at: "2026-07-15T16:00:00Z",
      },
      {
        actor: "partner",
        verb: "CREATED",
        entityType: "FORK",
        entityKey: "eu:fork:plus-ch",
        entityLabel: "+ Switzerland fork",
        at: "2026-07-16T09:00:00Z",
      },
    ],

    // --- Share & feed -----------------------------------------------------
    shareLink: true,
    calendarFeed: { includeActivities: false },
    invites: [{ email: "friend@example.com", role: "member" }],
    unreadFor: "you",
  };
}
