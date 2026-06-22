/**
 * Rich demo-trip seeder — "AI TRIP - EU Christmas".
 *
 * Standalone from the small `prisma/seed.ts` smoke-trip: this one exercises
 * (almost) every feature in the app so the whole capability set lights up in
 * one place — multi-stop itinerary across 6 countries + the Brisbane origin,
 * timezone-aware transport, accommodation, ~45 scheduled Items spanning all
 * categories, a voted Wishlist, multi-currency Costs (estimated vs actual, FX
 * snapshots, Other costs), exchange rates (incl. a manual override), Notes,
 * pre-trip + packing Checklists, a packing Template, Reminders, Journal
 * entries, real file Attachments, a public Share link and a Calendar feed.
 *
 * Idempotent: it deletes any prior trip(s) of the same name (and their
 * attachment blobs) before recreating everything fresh.
 *
 *   Run with:  npx tsx prisma/seed-ai-trip.ts
 */

import { pathToFileURL } from "node:url";
import { db } from "../lib/db";
import { getStorage, generateKey } from "../lib/storage";

const TRIP_NAME = "AI TRIP - EU Christmas";
const HOME = "AUD";

// Snapshot FX rates: 1 unit of currency = N home (AUD) units.
const RATE: Record<string, number> = { EUR: 1.63, GBP: 1.91 };
const rateToHome = (currency: string): number | null =>
  currency === HOME ? null : (RATE[currency] ?? null);

// ---------------------------------------------------------------------------
// Data: stops, each carrying its transport-in, accommodation and items.
// Dates are "YYYY-MM-DD"; transport instants are explicit UTC chosen so the
// tz-aware day lands inside the relevant stop's stay (keeps Flags clean).
// ---------------------------------------------------------------------------

interface ItemSeed {
  title: string;
  category: "SIGHTSEEING" | "FOOD" | "ACTIVITY" | "NIGHTLIFE" | "SHOPPING" | "OTHER";
  date?: string; // omit => unscheduled (Wishlist)
  startTime?: string;
  endTime?: string;
  lat?: number;
  lng?: number;
  address?: string;
  link?: string;
  booking?: string;
  notes?: string;
  cost?: { currency: string; est: number; actual?: number };
  /** Wishlist votes — [you, partner]; omit a slot with null. */
  votes?: { you?: "MUST" | "KEEN" | "MEH"; partner?: "MUST" | "KEEN" | "MEH" };
}

interface StopSeed {
  name: string;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
  arriveDate: string;
  departDate: string;
  notes?: string;
  accommodation?: {
    name: string;
    address: string;
    confirmation: string;
    lat?: number;
    lng?: number;
    notes?: string;
    cost: { currency: string; est: number; actual?: number };
  };
  /** Transport that BRINGS YOU to this stop (from the previous one). */
  transportIn?: {
    mode: "FLIGHT" | "TRAIN" | "BUS" | "CAR" | "FERRY" | "OTHER";
    depPlace: string;
    depAt: string; // ISO UTC
    arrPlace: string;
    arrAt: string; // ISO UTC
    reference: string;
    notes?: string;
    cost: { currency: string; est: number; actual?: number };
  };
  items: ItemSeed[];
}

const STOPS: StopSeed[] = [
  // -------------------------------------------------------------------------
  {
    name: "Brisbane / Gold Coast",
    country: "Australia",
    lat: -27.4698,
    lng: 153.0251,
    timezone: "Australia/Brisbane",
    arriveDate: "2026-12-06",
    departDate: "2026-12-06", // same-day origin — fly out tonight
    notes: "Home. Long-haul out tonight via Helsinki.",
    items: [
      {
        title: "Pack, weigh bags & head to BNE airport",
        category: "OTHER",
        date: "2026-12-06",
        startTime: "16:00",
        endTime: "18:00",
        notes: "Allow 3h for an international long-haul check-in.",
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    name: "Rovaniemi (Lapland)",
    country: "Finland",
    lat: 66.5039,
    lng: 25.7294,
    timezone: "Europe/Helsinki",
    arriveDate: "2026-12-07",
    departDate: "2026-12-11",
    notes: "Arctic Circle. Expect −15°C and only ~3h of daylight.",
    transportIn: {
      mode: "FLIGHT",
      depPlace: "Brisbane (BNE)",
      depAt: "2026-12-06T11:00:00Z", // 21:00 Brisbane
      arrPlace: "Rovaniemi (RVN)",
      arrAt: "2026-12-07T15:30:00Z", // 17:30 Helsinki
      reference: "QF / AY (via HEL)",
      notes: "Brisbane → Helsinki → Rovaniemi. ~24h door to door.",
      cost: { currency: "AUD", est: 220000, actual: 226400 },
    },
    accommodation: {
      name: "Arctic Glass Igloo (Santa's Resort)",
      address: "Tähtikuja 2, 96930 Rovaniemi, Finland",
      confirmation: "IGLOO-7741",
      lat: 66.5436,
      lng: 25.8472,
      notes: "Glass roof for aurora-watching from bed.",
      cost: { currency: "EUR", est: 185000, actual: 189000 },
    },
    items: [
      {
        title: "Santa Claus Village & cross the Arctic Circle",
        category: "SIGHTSEEING",
        date: "2026-12-07",
        startTime: "18:30",
        endTime: "20:00",
        lat: 66.5436,
        lng: 25.8472,
        link: "https://santaclausvillage.info",
        notes: "Get the official Arctic Circle crossing certificate.",
      },
      {
        title: "Husky sled safari",
        category: "ACTIVITY",
        date: "2026-12-08",
        startTime: "09:00",
        endTime: "12:00",
        booking: "HUSKY-2208",
        notes: "Meeting point pickup 08:45 from the resort.",
        cost: { currency: "EUR", est: 32000 },
      },
      {
        title: "Reindeer farm visit & sleigh ride",
        category: "ACTIVITY",
        date: "2026-12-08",
        startTime: "14:00",
        endTime: "16:00",
        cost: { currency: "EUR", est: 9000 },
      },
      {
        title: "Arktikum — Arctic science & Lapland museum",
        category: "SIGHTSEEING",
        date: "2026-12-09",
        startTime: "11:00",
        endTime: "13:00",
        lat: 66.5108,
        lng: 25.7242,
        cost: { currency: "EUR", est: 3600 },
      },
      {
        title: "Northern Lights snowmobile hunt",
        category: "ACTIVITY",
        date: "2026-12-09",
        startTime: "20:00",
        endTime: "23:00",
        booking: "AURORA-1209",
        notes: "Thermal suits provided. Cross fingers for clear skies.",
        cost: { currency: "EUR", est: 26000 },
      },
      {
        title: "Snowshoe trek through the boreal forest",
        category: "ACTIVITY",
        date: "2026-12-10",
        startTime: "10:00",
        endTime: "13:00",
        cost: { currency: "EUR", est: 11000 },
      },
      {
        title: "Smoke sauna & ice-hole swim",
        category: "ACTIVITY",
        date: "2026-12-10",
        startTime: "18:00",
        endTime: "20:00",
        notes: "Very Finnish. Very cold. Very worth it.",
        cost: { currency: "EUR", est: 7000 },
      },
      // Wishlist
      {
        title: "Overnight at the SnowHotel, Kemi",
        category: "ACTIVITY",
        lat: 65.7362,
        lng: 24.5638,
        notes: "Sleep in an actual ice room — if we can squeeze it in.",
        votes: { you: "MUST", partner: "KEEN" },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    name: "Munich",
    country: "Germany",
    lat: 48.1351,
    lng: 11.582,
    timezone: "Europe/Berlin",
    arriveDate: "2026-12-11",
    departDate: "2026-12-15",
    notes: "Bavaria + Christmas markets.",
    transportIn: {
      mode: "FLIGHT",
      depPlace: "Rovaniemi (RVN)",
      depAt: "2026-12-11T08:00:00Z", // 10:00 Helsinki
      arrPlace: "Munich (MUC)",
      arrAt: "2026-12-11T12:30:00Z", // 13:30 Munich
      reference: "AY1234 / LH (via HEL)",
      cost: { currency: "EUR", est: 46000 },
    },
    accommodation: {
      name: "Platzl Hotel",
      address: "Sparkassenstraße 10, 80331 München, Germany",
      confirmation: "PLATZL-3392",
      lat: 48.1374,
      lng: 11.5786,
      cost: { currency: "EUR", est: 88000, actual: 88000 },
    },
    items: [
      {
        title: "Marienplatz Christkindlmarkt & Glühwein",
        category: "FOOD",
        date: "2026-12-11",
        startTime: "17:00",
        endTime: "19:00",
        lat: 48.1374,
        lng: 11.5755,
        notes: "Keep the Glühwein mug as a souvenir (pfand refundable).",
      },
      {
        title: "Neuschwanstein Castle day trip",
        category: "SIGHTSEEING",
        date: "2026-12-12",
        startTime: "08:30",
        endTime: "17:00",
        lat: 47.5576,
        lng: 10.7498,
        booking: "NEU-1212",
        link: "https://neuschwanstein.de",
        notes: "Snow-covered fairytale castle. Book the timed entry slot.",
        cost: { currency: "EUR", est: 15000 },
      },
      {
        title: "Glockenspiel, Viktualienmarkt & Frauenkirche",
        category: "SIGHTSEEING",
        date: "2026-12-13",
        startTime: "10:00",
        endTime: "12:30",
        lat: 48.1352,
        lng: 11.5762,
      },
      {
        title: "Christmas gift shopping — Kaufingerstraße",
        category: "SHOPPING",
        date: "2026-12-13",
        startTime: "13:30",
        endTime: "15:30",
      },
      {
        title: "Hofbräuhaus dinner & a stein",
        category: "FOOD",
        date: "2026-12-13",
        startTime: "19:00",
        endTime: "21:00",
        lat: 48.1376,
        lng: 11.5797,
        cost: { currency: "EUR", est: 11000 },
      },
      {
        title: "Dachau Memorial Site",
        category: "SIGHTSEEING",
        date: "2026-12-14",
        startTime: "10:00",
        endTime: "13:00",
        notes: "Sobering but important. Free entry; audio guide recommended.",
      },
      {
        title: "BMW Welt & Museum",
        category: "ACTIVITY",
        date: "2026-12-14",
        startTime: "15:00",
        endTime: "17:00",
        lat: 48.1772,
        lng: 11.5562,
      },
      // Wishlist
      {
        title: "Zugspitze cable car (Germany's highest peak)",
        category: "ACTIVITY",
        lat: 47.4211,
        lng: 10.9853,
        votes: { you: "KEEN", partner: "MUST" },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    name: "London",
    country: "United Kingdom",
    lat: 51.5074,
    lng: -0.1278,
    timezone: "Europe/London",
    arriveDate: "2026-12-15",
    departDate: "2026-12-21",
    transportIn: {
      mode: "FLIGHT",
      depPlace: "Munich (MUC)",
      depAt: "2026-12-15T10:00:00Z", // 11:00 Munich
      arrPlace: "London (LHR)",
      arrAt: "2026-12-15T12:00:00Z", // 12:00 London
      reference: "LH2476",
      cost: { currency: "EUR", est: 32000 },
    },
    accommodation: {
      name: "The Bloomsbury Hotel",
      address: "16-22 Great Russell St, London WC1B 3NN, UK",
      confirmation: "BLM-44192",
      lat: 51.5169,
      lng: -0.1267,
      cost: { currency: "GBP", est: 156000, actual: 160500 },
    },
    items: [
      {
        title: "Winter Wonderland, Hyde Park",
        category: "ACTIVITY",
        date: "2026-12-15",
        startTime: "18:00",
        endTime: "21:00",
        lat: 51.5073,
        lng: -0.1657,
      },
      {
        title: "Tower of London & the Crown Jewels",
        category: "SIGHTSEEING",
        date: "2026-12-16",
        startTime: "10:00",
        endTime: "12:30",
        lat: 51.5081,
        lng: -0.0759,
        booking: "TOL-1216",
        cost: { currency: "GBP", est: 7800 },
      },
      {
        title: "The Lion King — Lyceum Theatre",
        category: "NIGHTLIFE",
        date: "2026-12-16",
        startTime: "19:30",
        endTime: "22:00",
        lat: 51.5115,
        lng: -0.1199,
        booking: "WE-LK-882",
        notes: "Booked row F, aisle seats.",
        cost: { currency: "GBP", est: 18000, actual: 18000 },
      },
      {
        title: "British Museum (Rosetta Stone, Egypt)",
        category: "SIGHTSEEING",
        date: "2026-12-17",
        startTime: "10:00",
        endTime: "13:00",
        lat: 51.5194,
        lng: -0.127,
        notes: "Free entry — donation suggested.",
      },
      {
        title: "Borough Market lunch crawl",
        category: "FOOD",
        date: "2026-12-17",
        startTime: "13:30",
        endTime: "14:45",
        lat: 51.5055,
        lng: -0.0905,
      },
      {
        title: "Harry Potter Warner Bros. Studio Tour",
        category: "ACTIVITY",
        date: "2026-12-18",
        startTime: "09:00",
        endTime: "13:00",
        lat: 51.6907,
        lng: -0.4197,
        booking: "WB-HP-1218",
        cost: { currency: "GBP", est: 11000 },
      },
      {
        title: "Churchill War Rooms",
        category: "SIGHTSEEING",
        date: "2026-12-19",
        startTime: "11:00",
        endTime: "13:00",
        lat: 51.5021,
        lng: -0.1291,
      },
      {
        title: "Oxford & Regent Street Christmas lights walk",
        category: "SIGHTSEEING",
        date: "2026-12-19",
        startTime: "17:00",
        endTime: "18:30",
      },
      {
        title: "Bath & Stonehenge day trip",
        category: "SIGHTSEEING",
        date: "2026-12-20",
        startTime: "08:00",
        endTime: "18:00",
        lat: 51.1789,
        lng: -1.8262,
        booking: "BATH-1220",
        cost: { currency: "GBP", est: 16000 },
      },
      // Wishlist
      {
        title: "Afternoon tea at The Ritz",
        category: "FOOD",
        lat: 51.5074,
        lng: -0.1419,
        notes: "Smart dress code — jackets for gents.",
        votes: { you: "MUST", partner: "MUST" },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    name: "Dublin",
    country: "Ireland",
    lat: 53.3498,
    lng: -6.2603,
    timezone: "Europe/Dublin",
    arriveDate: "2026-12-21",
    departDate: "2026-12-29",
    notes: "Christmas in Ireland — 8 nights.",
    transportIn: {
      mode: "FLIGHT",
      depPlace: "London (LHR)",
      depAt: "2026-12-21T09:30:00Z",
      arrPlace: "Dublin (DUB)",
      arrAt: "2026-12-21T10:55:00Z",
      reference: "EI155",
      cost: { currency: "GBP", est: 18000 },
    },
    accommodation: {
      name: "The Westbury",
      address: "Balfe St, Dublin 2, D02 H924, Ireland",
      confirmation: "WST-55120",
      lat: 53.3412,
      lng: -6.2603,
      cost: { currency: "EUR", est: 176000, actual: 181200 },
    },
    items: [
      {
        title: "Temple Bar — live trad music & a pint",
        category: "NIGHTLIFE",
        date: "2026-12-21",
        startTime: "19:00",
        endTime: "22:00",
        lat: 53.3455,
        lng: -6.2649,
      },
      {
        title: "Guinness Storehouse & Gravity Bar",
        category: "SIGHTSEEING",
        date: "2026-12-22",
        startTime: "11:00",
        endTime: "13:00",
        lat: 53.3419,
        lng: -6.2867,
        booking: "GUIN-1222",
        cost: { currency: "EUR", est: 6000 },
      },
      {
        title: "Trinity College & the Book of Kells",
        category: "SIGHTSEEING",
        date: "2026-12-22",
        startTime: "14:30",
        endTime: "16:00",
        lat: 53.3438,
        lng: -6.2546,
        booking: "TCD-1222",
        cost: { currency: "EUR", est: 5000 },
      },
      {
        title: "Cliffs of Moher & Galway day trip",
        category: "SIGHTSEEING",
        date: "2026-12-23",
        startTime: "07:30",
        endTime: "19:00",
        lat: 52.9719,
        lng: -9.4262,
        booking: "MOHER-1223",
        notes: "Long coach day; includes a stop in Galway.",
        cost: { currency: "EUR", est: 13000 },
      },
      {
        title: "Christmas Eve dinner",
        category: "FOOD",
        date: "2026-12-24",
        startTime: "19:00",
        endTime: "21:30",
        notes: "Book ahead — most kitchens close early on the 24th.",
        cost: { currency: "EUR", est: 16000 },
      },
      {
        title: "Christmas morning stroll — St Stephen's Green",
        category: "SIGHTSEEING",
        date: "2026-12-25",
        startTime: "11:00",
        endTime: "12:30",
        lat: 53.3382,
        lng: -6.2591,
        notes: "Almost everything is shut on Christmas Day — keep it gentle.",
      },
      {
        title: "Dublin Castle & Chester Beatty Library",
        category: "SIGHTSEEING",
        date: "2026-12-26",
        startTime: "11:00",
        endTime: "13:00",
        lat: 53.3429,
        lng: -6.2674,
      },
      {
        title: "Jameson Distillery tour & tasting",
        category: "ACTIVITY",
        date: "2026-12-26",
        startTime: "15:00",
        endTime: "16:30",
        lat: 53.3486,
        lng: -6.2784,
        booking: "JAM-1226",
        cost: { currency: "EUR", est: 5600 },
      },
      {
        title: "Howth cliff walk & seafood lunch",
        category: "ACTIVITY",
        date: "2026-12-27",
        startTime: "10:00",
        endTime: "14:00",
        lat: 53.3877,
        lng: -6.0664,
      },
      {
        title: "Kilmainham Gaol",
        category: "SIGHTSEEING",
        date: "2026-12-28",
        startTime: "10:00",
        endTime: "11:30",
        lat: 53.3419,
        lng: -6.3098,
        booking: "KIL-1228",
        cost: { currency: "EUR", est: 1600 },
      },
      {
        title: "Farewell-to-Ireland pub crawl",
        category: "NIGHTLIFE",
        date: "2026-12-28",
        startTime: "20:00",
        endTime: "23:00",
      },
      // Wishlist
      {
        title: "Game of Thrones tour, Northern Ireland",
        category: "ACTIVITY",
        notes: "Full-day from Dublin — might be too much on top of Moher.",
        votes: { you: "MEH", partner: "MUST" },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    name: "Paris",
    country: "France",
    lat: 48.8566,
    lng: 2.3522,
    timezone: "Europe/Paris",
    arriveDate: "2026-12-29",
    departDate: "2027-01-03",
    notes: "New Year's Eve in Paris.",
    transportIn: {
      mode: "FLIGHT",
      depPlace: "Dublin (DUB)",
      depAt: "2026-12-29T12:00:00Z",
      arrPlace: "Paris (CDG)",
      arrAt: "2026-12-29T14:10:00Z", // 15:10 Paris
      reference: "EI520",
      cost: { currency: "EUR", est: 24000 },
    },
    accommodation: {
      name: "Hôtel des Grands Boulevards",
      address: "17 Boulevard Poissonnière, 75002 Paris, France",
      confirmation: "HGB-7781",
      lat: 48.8709,
      lng: 2.3453,
      notes: "NYE rates — booked early.",
      cost: { currency: "EUR", est: 165000, actual: 168000 },
    },
    items: [
      {
        title: "Seine evening walk & Eiffel sparkle",
        category: "SIGHTSEEING",
        date: "2026-12-29",
        startTime: "19:00",
        endTime: "20:30",
        lat: 48.8584,
        lng: 2.2945,
        notes: "Tower sparkles for 5 min on the hour after dark.",
      },
      {
        title: "Louvre Museum",
        category: "SIGHTSEEING",
        date: "2026-12-30",
        startTime: "10:00",
        endTime: "13:00",
        lat: 48.8606,
        lng: 2.3376,
        booking: "LOUVRE-1230",
        cost: { currency: "EUR", est: 4400 },
      },
      {
        title: "Champs-Élysées Christmas lights & Arc de Triomphe",
        category: "SIGHTSEEING",
        date: "2026-12-30",
        startTime: "18:00",
        endTime: "19:30",
        lat: 48.8698,
        lng: 2.3078,
      },
      {
        title: "Eiffel Tower summit",
        category: "SIGHTSEEING",
        date: "2026-12-31",
        startTime: "14:00",
        endTime: "16:00",
        lat: 48.8584,
        lng: 2.2945,
        booking: "ET-558210",
        cost: { currency: "EUR", est: 7400 },
      },
      {
        title: "New Year's Eve dinner cruise on the Seine",
        category: "NIGHTLIFE",
        date: "2026-12-31",
        startTime: "20:00",
        endTime: "23:30",
        lat: 48.8635,
        lng: 2.314,
        booking: "NYE-CRUISE-31",
        notes: "Bring a warm coat for the open deck at midnight.",
        cost: { currency: "EUR", est: 34000, actual: 34000 },
      },
      {
        title: "Sacré-Cœur & Montmartre (New Year's recovery)",
        category: "SIGHTSEEING",
        date: "2027-01-01",
        startTime: "12:00",
        endTime: "14:00",
        lat: 48.8867,
        lng: 2.3431,
      },
      {
        title: "Musée d'Orsay",
        category: "SIGHTSEEING",
        date: "2027-01-02",
        startTime: "10:00",
        endTime: "12:00",
        lat: 48.86,
        lng: 2.3266,
        booking: "ORSAY-0102",
      },
      {
        title: "Le Marais food & pastry tour",
        category: "FOOD",
        date: "2027-01-02",
        startTime: "16:00",
        endTime: "18:00",
        lat: 48.8575,
        lng: 2.3622,
        cost: { currency: "EUR", est: 13000 },
      },
      // Wishlist
      {
        title: "Day trip to the Palace of Versailles",
        category: "SIGHTSEEING",
        lat: 48.8049,
        lng: 2.1204,
        votes: { you: "MUST", partner: "KEEN" },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    name: "Rome",
    country: "Italy",
    lat: 41.9028,
    lng: 12.4964,
    timezone: "Europe/Rome",
    arriveDate: "2027-01-03",
    departDate: "2027-01-09",
    notes: "Finale — 6 nights, then the long haul home.",
    transportIn: {
      mode: "FLIGHT",
      depPlace: "Paris (CDG)",
      depAt: "2027-01-03T09:30:00Z", // 10:30 Paris
      arrPlace: "Rome (FCO)",
      arrAt: "2027-01-03T11:35:00Z", // 12:35 Rome
      reference: "AF1004",
      cost: { currency: "EUR", est: 29000 },
    },
    accommodation: {
      name: "Hotel Artemide",
      address: "Via Nazionale, 22, 00184 Roma RM, Italy",
      confirmation: "ART-30551",
      lat: 41.9009,
      lng: 12.4925,
      cost: { currency: "EUR", est: 114000, actual: 114000 },
    },
    items: [
      {
        title: "Trevi Fountain & Spanish Steps by night",
        category: "SIGHTSEEING",
        date: "2027-01-03",
        startTime: "18:00",
        endTime: "20:00",
        lat: 41.9009,
        lng: 12.4833,
        notes: "Toss a coin to guarantee a return to Rome.",
      },
      {
        title: "Colosseum, Roman Forum & Palatine guided tour",
        category: "SIGHTSEEING",
        date: "2027-01-04",
        startTime: "09:00",
        endTime: "12:00",
        lat: 41.8902,
        lng: 12.4922,
        booking: "COL-91002",
        cost: { currency: "EUR", est: 11000 },
      },
      {
        title: "Gelato in Trastevere",
        category: "FOOD",
        date: "2027-01-04",
        startTime: "16:00",
        endTime: "16:45",
        lat: 41.8896,
        lng: 12.4696,
      },
      {
        title: "Vatican Museums & Sistine Chapel",
        category: "SIGHTSEEING",
        date: "2027-01-05",
        startTime: "09:00",
        endTime: "12:30",
        lat: 41.9065,
        lng: 12.4536,
        booking: "VAT-0105",
        cost: { currency: "EUR", est: 9000 },
      },
      {
        title: "St Peter's Basilica & the dome climb",
        category: "SIGHTSEEING",
        date: "2027-01-05",
        startTime: "14:00",
        endTime: "15:30",
        lat: 41.9022,
        lng: 12.4539,
      },
      {
        title: "Piazza Navona — La Befana Epiphany market",
        category: "SIGHTSEEING",
        date: "2027-01-06",
        startTime: "11:00",
        endTime: "12:30",
        lat: 41.8992,
        lng: 12.4731,
      },
      {
        title: "Roman evening food tour",
        category: "FOOD",
        date: "2027-01-06",
        startTime: "18:00",
        endTime: "20:30",
        booking: "FOOD-0106",
        cost: { currency: "EUR", est: 16000 },
      },
      {
        title: "Pompeii day trip",
        category: "SIGHTSEEING",
        date: "2027-01-07",
        startTime: "07:30",
        endTime: "18:00",
        lat: 40.7497,
        lng: 14.4869,
        booking: "POMP-0107",
        cost: { currency: "EUR", est: 24000 },
      },
      {
        title: "Borghese Gallery & Gardens",
        category: "SIGHTSEEING",
        date: "2027-01-08",
        startTime: "10:00",
        endTime: "12:00",
        lat: 41.9142,
        lng: 12.4922,
        booking: "BORG-0108",
      },
      {
        title: "Final Roman dinner — cacio e pepe",
        category: "FOOD",
        date: "2027-01-08",
        startTime: "19:30",
        endTime: "21:30",
        cost: { currency: "EUR", est: 14000 },
      },
      // Wishlist
      {
        title: "Cooking class: pasta & tiramisù",
        category: "ACTIVITY",
        votes: { you: "MUST", partner: "MUST" },
      },
      {
        title: "Aperitivo evening in Monti",
        category: "FOOD",
        lat: 41.8946,
        lng: 12.4917,
        votes: { you: "KEEN", partner: "KEEN" },
      },
    ],
  },
];

// Homeward long-haul (no destination stop — toStopId stays null).
const HOMEWARD = {
  mode: "FLIGHT" as const,
  depPlace: "Rome (FCO)",
  depAt: "2027-01-09T13:00:00Z", // 14:00 Rome
  arrPlace: "Brisbane (BNE)",
  arrAt: "2027-01-10T13:00:00Z", // 23:00 Brisbane, next day
  reference: "EK / QF (via DXB)",
  notes: "The long way home. Rome → Dubai → Brisbane.",
  cost: { currency: "AUD", est: 240000 },
};

// Standalone "Other" costs (not attached to any timeline thing).
const OTHER_COSTS: {
  label: string;
  category: string;
  currency: string;
  est: number;
  actual?: number;
}[] = [
  { label: "Travel insurance (winter-sports add-on)", category: "Insurance", currency: "AUD", est: 48000, actual: 48000 },
  { label: "eSIM data — EU + UK", category: "Connectivity", currency: "AUD", est: 12000 },
  { label: "ETIAS authorisation (×2)", category: "Visas & docs", currency: "EUR", est: 1400, actual: 1400 },
  { label: "Airport transfers & local transit", category: "Transport", currency: "AUD", est: 40000 },
  { label: "Spending money / meals buffer", category: "Food & misc", currency: "AUD", est: 150000 },
  { label: "Christmas gifts for each other 🎁", category: "Gifts", currency: "AUD", est: 30000 },
];

export async function seedAiTrip() {
  const storage = getStorage();

  // --- Users -------------------------------------------------------------
  const you = await db.user.upsert({
    where: { email: "you@example.com" },
    update: { name: "You" },
    create: { email: "you@example.com", name: "You" },
  });
  const partner = await db.user.upsert({
    where: { email: "partner@example.com" },
    update: { name: "Partner" },
    create: { email: "partner@example.com", name: "Partner" },
  });

  // --- Wipe any prior copy (idempotent re-seed) --------------------------
  const prior = await db.trip.findMany({ where: { name: TRIP_NAME }, select: { id: true } });
  for (const t of prior) {
    const atts = await db.attachment.findMany({
      where: { tripId: t.id, storageKey: { not: null } },
      select: { storageKey: true },
    });
    for (const a of atts) if (a.storageKey) await storage.delete(a.storageKey);
    await db.trip.delete({ where: { id: t.id } }); // cascades to all children
  }

  // --- Trip --------------------------------------------------------------
  const trip = await db.trip.create({
    data: {
      name: TRIP_NAME,
      startDate: "2026-12-06",
      endDate: "2027-01-09",
      homeCurrency: HOME,
      createdById: you.id,
      members: {
        create: [
          { userId: you.id, role: "owner" },
          { userId: partner.id, role: "member" },
        ],
      },
    },
  });

  // --- Exchange rates (one fetched, one manual override) -----------------
  await db.exchangeRate.create({
    data: { tripId: trip.id, base: "EUR", quote: HOME, rate: RATE.EUR, fetchedAt: new Date("2026-06-20T00:00:00Z"), manual: false },
  });
  await db.exchangeRate.create({
    data: { tripId: trip.id, base: "GBP", quote: HOME, rate: RATE.GBP, fetchedAt: new Date("2026-06-21T00:00:00Z"), manual: true },
  });

  // Helper: create a cost row attached to an owner.
  const addCost = (
    ownerType: "TRANSPORT" | "ACCOMMODATION" | "ITEM" | "OTHER",
    ownerId: string | null,
    c: { currency: string; est: number; actual?: number },
    extra: { label?: string; category?: string } = {},
  ) =>
    db.cost.create({
      data: {
        tripId: trip.id,
        estimatedMinor: c.est,
        actualMinor: c.actual ?? null,
        currency: c.currency,
        rateToHome: rateToHome(c.currency),
        ownerType,
        ownerId,
        paidAt: c.actual !== undefined ? new Date("2026-11-15T00:00:00Z") : null,
        label: extra.label ?? null,
        category: extra.category ?? null,
      },
    });

  // --- Stops, transport, accommodation, items, votes, costs --------------
  let prevStopId: string | null = null;
  let stopSort = 0;

  // Keep some created entities to hang notes / attachments / reminders off.
  const ref: Record<string, string> = {};

  for (const s of STOPS) {
    const stop = await db.stop.create({
      data: {
        tripId: trip.id,
        name: s.name,
        country: s.country,
        lat: s.lat,
        lng: s.lng,
        timezone: s.timezone,
        arriveDate: s.arriveDate,
        departDate: s.departDate,
        notes: s.notes ?? null,
        sortOrder: stopSort++,
      },
    });
    ref[`stop:${s.name}`] = stop.id;

    if (s.transportIn) {
      const t = await db.transport.create({
        data: {
          tripId: trip.id,
          fromStopId: prevStopId,
          toStopId: stop.id,
          mode: s.transportIn.mode,
          depPlace: s.transportIn.depPlace,
          depAt: new Date(s.transportIn.depAt),
          arrPlace: s.transportIn.arrPlace,
          arrAt: new Date(s.transportIn.arrAt),
          reference: s.transportIn.reference,
          notes: s.transportIn.notes ?? null,
          sortOrder: stopSort,
        },
      });
      await addCost("TRANSPORT", t.id, s.transportIn.cost);
      if (s.name === "Rovaniemi (Lapland)") ref["transport:outbound"] = t.id;
    }

    if (s.accommodation) {
      const a = await db.accommodation.create({
        data: {
          tripId: trip.id,
          stopId: stop.id,
          name: s.accommodation.name,
          address: s.accommodation.address,
          checkIn: s.arriveDate,
          checkOut: s.departDate,
          confirmation: s.accommodation.confirmation,
          notes: s.accommodation.notes ?? null,
          lat: s.accommodation.lat ?? null,
          lng: s.accommodation.lng ?? null,
        },
      });
      await addCost("ACCOMMODATION", a.id, s.accommodation.cost);
      if (s.name === "Rovaniemi (Lapland)") ref["accom:igloo"] = a.id;
    }

    let itemSort = 0;
    for (const it of s.items) {
      const item = await db.item.create({
        data: {
          tripId: trip.id,
          stopId: stop.id,
          title: it.title,
          category: it.category,
          date: it.date ?? null,
          startTime: it.startTime ?? null,
          endTime: it.endTime ?? null,
          lat: it.lat ?? null,
          lng: it.lng ?? null,
          address: it.address ?? null,
          link: it.link ?? null,
          booking: it.booking ?? null,
          notes: it.notes ?? null,
          sortOrder: itemSort++,
        },
      });
      ref[`item:${it.title}`] = item.id;

      if (it.cost) await addCost("ITEM", item.id, it.cost, { category: it.category });

      if (it.votes?.you) {
        await db.vote.create({ data: { tripId: trip.id, itemId: item.id, userId: you.id, level: it.votes.you } });
      }
      if (it.votes?.partner) {
        await db.vote.create({ data: { tripId: trip.id, itemId: item.id, userId: partner.id, level: it.votes.partner } });
      }
    }

    prevStopId = stop.id;
  }

  // --- Homeward transport (no toStop) ------------------------------------
  const home = await db.transport.create({
    data: {
      tripId: trip.id,
      fromStopId: prevStopId,
      toStopId: null,
      mode: HOMEWARD.mode,
      depPlace: HOMEWARD.depPlace,
      depAt: new Date(HOMEWARD.depAt),
      arrPlace: HOMEWARD.arrPlace,
      arrAt: new Date(HOMEWARD.arrAt),
      reference: HOMEWARD.reference,
      notes: HOMEWARD.notes,
      sortOrder: 99,
    },
  });
  await addCost("TRANSPORT", home.id, HOMEWARD.cost);

  // --- Other (standalone) costs ------------------------------------------
  for (const oc of OTHER_COSTS) {
    await addCost("OTHER", null, { currency: oc.currency, est: oc.est, actual: oc.actual }, { label: oc.label, category: oc.category });
  }

  // --- Notes (collaboration between the two travellers) ------------------
  const notes: { author: string; targetType: string; targetId: string; body: string }[] = [
    { author: partner.id, targetType: "STOP", targetId: ref["stop:Rovaniemi (Lapland)"], body: "Pack proper thermals — it'll be around −15°C and barely 3 hours of daylight!" },
    { author: you.id, targetType: "ITEM", targetId: ref["item:The Lion King — Lyceum Theatre"], body: "Booked row F, aisle seats. Doors 19:00." },
    { author: partner.id, targetType: "ITEM", targetId: ref["item:Cliffs of Moher & Galway day trip"], body: "Coach picks up at 07:30 sharp from the hotel — set an alarm." },
    { author: you.id, targetType: "ITEM", targetId: ref["item:Vatican Museums & Sistine Chapel"], body: "Dress code is strict: shoulders and knees covered." },
    { author: partner.id, targetType: "ACCOMMODATION", targetId: ref["accom:igloo"], body: "Confirmation says aurora wake-up call is opt-in at reception." },
  ];
  for (const n of notes) {
    if (!n.targetId) continue;
    await db.note.create({ data: { tripId: trip.id, authorId: n.author, targetType: n.targetType, targetId: n.targetId, body: n.body } });
  }

  // --- Checklists: pre-trip + packing ------------------------------------
  const pretrip: { text: string; done: boolean; due?: string; who?: string }[] = [
    { text: "Renew passports (6-month validity rule)", done: true, due: "2026-09-01", who: you.id },
    { text: "Apply for ETIAS travel authorisation (×2)", done: false, due: "2026-10-15", who: partner.id },
    { text: "Travel insurance with winter-sports cover", done: true, due: "2026-10-01", who: you.id },
    { text: "Book Lapland igloo + husky safari", done: true, who: partner.id },
    { text: "Order euros & pounds cash", done: false, due: "2026-11-20", who: you.id },
    { text: "Set up EU + UK eSIM", done: false, who: partner.id },
    { text: "Notify bank of travel dates", done: false, due: "2026-12-01", who: you.id },
    { text: "Download offline maps & boarding passes", done: false, due: "2026-12-05" },
  ];
  const packing: { text: string; done: boolean; who?: string }[] = [
    { text: "Thermal base layers (×4)", done: true, who: you.id },
    { text: "Heavy insulated winter coat", done: true, who: partner.id },
    { text: "Waterproof snow boots", done: false, who: you.id },
    { text: "Gloves, beanie & scarf", done: false, who: partner.id },
    { text: "Power adapters (EU + UK type G)", done: false },
    { text: "Reusable water bottle", done: true },
    { text: "Christmas gifts for each other 🎁", done: false, who: you.id },
    { text: "Medications + copies of prescriptions", done: false, who: partner.id },
  ];
  let clSort = 0;
  for (const c of pretrip) {
    await db.checklistItem.create({
      data: { tripId: trip.id, kind: "PRETRIP", text: c.text, done: c.done, dueDate: c.due ?? null, assignedToId: c.who ?? null, sortOrder: clSort++ },
    });
  }
  clSort = 0;
  for (const c of packing) {
    await db.checklistItem.create({
      data: { tripId: trip.id, kind: "PACKING", text: c.text, done: c.done, assignedToId: c.who ?? null, sortOrder: clSort++ },
    });
  }

  // --- Reusable packing template (owned by "you") ------------------------
  await db.packingTemplate.create({
    data: {
      ownerId: you.id,
      name: "Winter Europe",
      itemsJson: JSON.stringify([
        "Thermal base layers",
        "Insulated winter coat",
        "Waterproof snow boots",
        "Gloves, beanie & scarf",
        "Hand & toe warmers",
        "Lip balm & heavy moisturiser",
        "EU + UK power adapters",
        "Portable battery pack",
      ]),
    },
  });

  // --- Reminders (web-push targets; all in the future) -------------------
  const reminders: { title: string; fireAt: string; targetType?: string; targetId?: string }[] = [
    { title: "Pay the balance on the Lapland igloo", fireAt: "2026-11-01T23:00:00Z" },
    { title: "Apply for ETIAS authorisation", fireAt: "2026-10-15T23:00:00Z" },
    { title: "Check in online for the flight to Helsinki", fireAt: "2026-12-05T09:00:00Z", targetType: "TRANSPORT", targetId: ref["transport:outbound"] },
    { title: "Husky safari pickup — be at reception 08:45", fireAt: "2026-12-08T06:30:00Z", targetType: "ITEM", targetId: ref["item:Husky sled safari"] },
    { title: "Eiffel summit tickets — arrive 30 min early", fireAt: "2026-12-31T12:30:00Z", targetType: "ITEM", targetId: ref["item:Eiffel Tower summit"] },
  ];
  for (const r of reminders) {
    await db.reminder.create({
      data: { tripId: trip.id, title: r.title, fireAt: new Date(r.fireAt), sent: false, targetType: r.targetType ?? null, targetId: r.targetId ?? null },
    });
  }

  // --- Journal entries (a few, to show the feature) ----------------------
  const journal: { date: string; author: string; body: string }[] = [
    { date: "2026-12-07", author: you.id, body: "Made it to the Arctic Circle after ~24 hours of flying. Stepped outside and the cold genuinely takes your breath away. The igloo is unreal — lying in bed looking up at the stars through the glass roof." },
    { date: "2026-12-09", author: partner.id, body: "AURORA. We almost gave up around 10pm and then the whole sky turned green and rippled for twenty minutes. No photo does it justice. Best night of my life, easily." },
    { date: "2026-12-25", author: you.id, body: "Christmas morning in Dublin. The whole city is shut and silent — we walked through St Stephen's Green with takeaway coffees and had it almost to ourselves. Quiet and perfect." },
    { date: "2026-12-31", author: partner.id, body: "New Year's Eve on the Seine. Midnight on the deck, freezing, the Eiffel Tower sparkling. Counting down in French with strangers. What a way to end the year." },
  ];
  for (const j of journal) {
    await db.journalEntry.create({ data: { tripId: trip.id, date: j.date, body: j.body, authorId: j.author } });
  }

  // --- Attachments (real local files) ------------------------------------
  const attachments: { targetType: string; targetId: string | null; filename: string; body: string }[] = [
    {
      targetType: "TRIP",
      targetId: null,
      filename: "trip-overview.txt",
      body: "AI TRIP - EU Christmas\n6 Dec 2026 – 9 Jan 2027\nBrisbane → Lapland → Munich → London → Dublin → Paris → Rome → home.\nHome currency: AUD. Two travellers.",
    },
    {
      targetType: "TRANSPORT",
      targetId: ref["transport:outbound"] ?? null,
      filename: "eticket-BNE-HEL-RVN.txt",
      body: "E-TICKET / booking QF-AY via HEL\nPassengers: You, Partner\nBNE 21:00 06DEC → HEL → RVN 17:30 07DEC\nBaggage: 2 x 23kg checked.",
    },
    {
      targetType: "ACCOMMODATION",
      targetId: ref["accom:igloo"] ?? null,
      filename: "igloo-confirmation.txt",
      body: "Arctic Glass Igloo — confirmation IGLOO-7741\nCheck-in 07 Dec, check-out 11 Dec (4 nights)\nIncludes breakfast + optional aurora wake-up call.",
    },
  ];
  for (const at of attachments) {
    if (at.targetType !== "TRIP" && !at.targetId) continue;
    const created = await db.attachment.create({
      data: {
        tripId: trip.id,
        targetType: at.targetType,
        targetId: at.targetId,
        filename: at.filename,
        mime: "text/plain",
        size: Buffer.byteLength(at.body),
        url: "", // set below once we have the id
        uploadedById: you.id,
      },
    });
    const key = generateKey(trip.id, created.id, at.filename);
    await storage.save(key, Buffer.from(at.body), "text/plain");
    await db.attachment.update({
      where: { id: created.id },
      data: { storageKey: key, url: `/api/attachments/${created.id}` },
    });
  }

  // --- Public share link + calendar feed ---------------------------------
  await db.shareLink.create({ data: { tripId: trip.id, token: crypto.randomUUID() } });
  await db.calendarFeed.create({ data: { tripId: trip.id, token: crypto.randomUUID() } });

  // --- Summary -----------------------------------------------------------
  const counts = await Promise.all([
    db.stop.count({ where: { tripId: trip.id } }),
    db.transport.count({ where: { tripId: trip.id } }),
    db.accommodation.count({ where: { tripId: trip.id } }),
    db.item.count({ where: { tripId: trip.id } }),
    db.item.count({ where: { tripId: trip.id, date: null } }),
    db.cost.count({ where: { tripId: trip.id } }),
    db.vote.count({ where: { tripId: trip.id } }),
    db.note.count({ where: { tripId: trip.id } }),
    db.checklistItem.count({ where: { tripId: trip.id } }),
    db.reminder.count({ where: { tripId: trip.id } }),
    db.journalEntry.count({ where: { tripId: trip.id } }),
    db.attachment.count({ where: { tripId: trip.id } }),
  ]);
  const [stops, transports, accoms, items, wishlist, costs, votes, noteCount, checklist, reminderCount, journalCount, attachmentCount] = counts;

  console.log(`\n✅ Seeded "${TRIP_NAME}" (id ${trip.id})`);
  console.log(
    `   ${stops} stops · ${transports} transports · ${accoms} accommodation · ` +
      `${items} items (${wishlist} wishlist) · ${costs} costs · ${votes} votes`,
  );
  console.log(
    `   ${noteCount} notes · ${checklist} checklist items · ${reminderCount} reminders · ` +
      `${journalCount} journal entries · ${attachmentCount} attachments · share + feed tokens`,
  );
  console.log(`\n   Sign in as you@example.com and open the trip.\n`);
}

// Run standalone (e.g. `npm run db:seed:demo`) — manage the connection here.
// When imported by prisma/seed.ts, this guard is false so it won't double-run.
const isMain =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  seedAiTrip()
    .then(() => db.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await db.$disconnect();
      process.exit(1);
    });
}
