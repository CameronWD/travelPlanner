/**
 * Today-relative phase-demo trip builders.
 *
 * Four small trips that light up the Home's other phase states:
 *   - buildSketchTrip      — "Japan someday"          (Sketching phase)
 *   - buildFinalPrepTrip   — "Blue Mountains by rail" (Final-prep phase)
 *   - buildTravellingTrip  — "Great Ocean Road"       (Travelling phase)
 *   - buildPastTrip        — "Spirit of Tassie"       (Past phase)
 *
 * Pure module — no Prisma, no React, no network.
 */

import type { DemoTrip, DemoStop, DemoTransport, DemoAccommodation, DemoItem, DemoCost, DemoChecklistItem, DemoReminder, DemoJournalEntry } from "./types";
import { phaseDates } from "./phase-dates";
import { addDays } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Sketch Trip: "Japan someday"
// Phase: sketching (no startDate)
// ---------------------------------------------------------------------------

export function buildSketchTrip(): DemoTrip {
  const stops: DemoStop[] = [
    {
      key: "jp:stop:tokyo",
      name: "Tokyo",
      country: "Japan",
      countryCode: "jp",
      lat: 35.6762,
      lng: 139.6503,
      nights: 5,
      notes: "Shinjuku, Shibuya, Akihabara. Start here.",
      sortOrder: 0,
    },
    {
      key: "jp:stop:kyoto",
      name: "Kyoto",
      country: "Japan",
      countryCode: "jp",
      lat: 35.0116,
      lng: 135.7681,
      nights: 4,
      notes: "Temples, geisha districts, bamboo groves.",
      sortOrder: 1,
    },
    {
      key: "jp:stop:osaka",
      name: "Osaka",
      country: "Japan",
      countryCode: "jp",
      lat: 34.6937,
      lng: 135.5023,
      nights: 3,
      notes: "Street food, Dotonbori, day trip to Nara.",
      sortOrder: 2,
    },
    {
      key: "jp:stop:hakone",
      name: "Hakone",
      country: "Japan",
      countryCode: "jp",
      lat: 35.2327,
      lng: 139.1069,
      nights: 2,
      notes: "Mt Fuji views, ryokan stay, onsen.",
      sortOrder: 3,
    },
  ];

  const items: DemoItem[] = [
    {
      key: "jp:item:teamlab",
      title: "teamLab Borderless digital art museum",
      category: "ACTIVITY",
      stopKey: "jp:stop:tokyo",
      date: null,
      lat: 35.6248,
      lng: 139.7745,
      votes: [
        { user: "you", level: "MUST" },
        { user: "partner", level: "MUST" },
      ],
    },
    {
      key: "jp:item:fushimi-inari",
      title: "Fushimi Inari — thousand torii gates at dawn",
      category: "SIGHTSEEING",
      stopKey: "jp:stop:kyoto",
      date: null,
      lat: 34.9671,
      lng: 135.7727,
      votes: [
        { user: "you", level: "MUST" },
        { user: "partner", level: "KEEN" },
      ],
    },
  ];

  return {
    key: "jp:trip",
    name: "Japan someday",
    createdBy: "you",
    startDate: null,
    endDate: null,
    homeCurrency: "AUD",
    stops,
    chapters: [],
    transports: [],
    accommodations: [],
    items,
    costs: [],
  };
}

// ---------------------------------------------------------------------------
// Final Prep Trip: "Blue Mountains by rail"
// Phase: final-prep (today+3 … today+5)
// ---------------------------------------------------------------------------

export function buildFinalPrepTrip(today: string): DemoTrip {
  const d = phaseDates(today);

  const stops: DemoStop[] = [
    {
      key: "fp:stop:katoomba",
      name: "Katoomba",
      country: "Australia",
      countryCode: "au",
      lat: -33.7141,
      lng: 150.3116,
      timezone: "Australia/Sydney",
      arriveDate: d.finalPrep.start,
      departDate: d.finalPrep.end,
      nights: 2,
      notes: "Three Sisters, Scenic World, bush walks.",
      sortOrder: 0,
    },
  ];

  const transports: DemoTransport[] = [
    {
      key: "fp:tr:syd-katoomba",
      mode: "TRAIN",
      fromStopKey: null,
      toStopKey: "fp:stop:katoomba",
      depIsHome: true,
      depPlace: "Sydney Central Station",
      depAt: `${d.finalPrep.start}T07:13:00+10:00`,
      arrPlace: "Katoomba Station",
      arrAt: `${d.finalPrep.start}T09:18:00+10:00`,
      reference: "Blue Mountains Line",
      notes: "Direct — 2h 5m. Buy Opal card at Central.",
      sortOrder: 0,
      cost: { estimatedMinor: 860, currency: "AUD" },
    },
    {
      key: "fp:tr:katoomba-syd",
      mode: "TRAIN",
      fromStopKey: "fp:stop:katoomba",
      toStopKey: null,
      arrIsHome: true,
      depPlace: "Katoomba Station",
      depAt: `${d.finalPrep.end}T16:55:00+10:00`,
      arrPlace: "Sydney Central Station",
      arrAt: `${d.finalPrep.end}T19:01:00+10:00`,
      reference: "Blue Mountains Line",
      sortOrder: 1,
      cost: { estimatedMinor: 860, currency: "AUD" },
    },
  ];

  const accommodations: DemoAccommodation[] = [
    {
      key: "fp:acc:hydro-majestic",
      stopKey: "fp:stop:katoomba",
      name: "Hydro Majestic Hotel",
      address: "Great Western Hwy, Medlow Bath NSW 2780",
      checkIn: d.finalPrep.start,
      checkOut: d.finalPrep.end,
      confirmation: "HM-44821",
      lat: -33.6814,
      lng: 150.2827,
      notes: "Heritage hotel overlooking the Megalong Valley.",
      cost: { estimatedMinor: 42000, currency: "AUD" },
    },
  ];

  const items: DemoItem[] = [
    {
      key: "fp:item:three-sisters",
      title: "Three Sisters lookout & Echo Point",
      category: "SIGHTSEEING",
      stopKey: "fp:stop:katoomba",
      date: d.finalPrep.start,
      startTime: "10:00",
      endTime: "11:30",
      lat: -33.7382,
      lng: 150.3118,
      notes: "Best light in the morning.",
      sortOrder: 0,
    },
    {
      key: "fp:item:scenic-world",
      title: "Scenic World — Skyway, Railway & Cableway",
      category: "ACTIVITY",
      stopKey: "fp:stop:katoomba",
      date: d.finalPrep.start,
      startTime: "13:00",
      endTime: "16:00",
      lat: -33.7274,
      lng: 150.3001,
      booking: "SW-2291",
      cost: { estimatedMinor: 7400, currency: "AUD" },
      sortOrder: 1,
    },
    {
      key: "fp:item:grand-canyon-walk",
      title: "Grand Canyon track loop",
      category: "ACTIVITY",
      stopKey: "fp:stop:katoomba",
      date: addDays(d.finalPrep.start, 1),
      startTime: "08:30",
      endTime: "12:00",
      lat: -33.6973,
      lng: 150.2868,
      notes: "Wear good shoes — creek crossings.",
      sortOrder: 2,
    },
  ];

  const checklist: DemoChecklistItem[] = [
    { kind: "PRETRIP", text: "Check train timetable & buy Opal credit", done: true },
    { kind: "PRETRIP", text: "Confirm Hydro Majestic booking (ref HM-44821)", done: true },
    { kind: "PRETRIP", text: "Download AllTrails maps offline", done: true },
    { kind: "PRETRIP", text: "Pack rain jacket & waterproof boots", done: false },
    { kind: "PRETRIP", text: "Check weather forecast closer to departure", done: false },
    { kind: "PACKING", text: "Hiking boots", done: true },
    { kind: "PACKING", text: "Rain jacket", done: false },
    { kind: "PACKING", text: "Opal card", done: true },
    { kind: "PACKING", text: "Camera + spare battery", done: true },
    { kind: "PACKING", text: "Snacks for the trail", done: false },
  ];

  // Reminder firing ~2 days from today (i.e., the day before departure)
  const reminders: DemoReminder[] = [
    {
      title: "Check in online & confirm train times for Blue Mountains trip",
      fireAt: `${addDays(today, 2)}T08:00:00+10:00`,
      sent: false,
    },
    {
      title: "Pack bag tonight — departure tomorrow morning",
      fireAt: `${addDays(today, 2)}T19:00:00+10:00`,
      sent: false,
    },
  ];

  return {
    key: "fp:trip",
    name: "Blue Mountains by rail",
    createdBy: "you",
    startDate: d.finalPrep.start,
    endDate: d.finalPrep.end,
    homeCurrency: "AUD",
    coverGradient: ["#4ade80", "#16a34a"],
    stops,
    chapters: [],
    transports,
    accommodations,
    items,
    costs: [],
    checklist,
    reminders,
  };
}

// ---------------------------------------------------------------------------
// Travelling Trip: "Great Ocean Road, right now"
// Phase: travelling (today-2 … today+4)
// TODAY: long CAR drive Torquay → Nelson (~291 km straight-line, ~327 min)
//        → flagLongDrivingDays fires WARNING (/driv/i)
// Tonight: Nelson Gateway Cabins (checkIn = today, at the drive's destination)
// Located item on today: Nelson estuary sunset walk (lat/lng set)
// ---------------------------------------------------------------------------

export function buildTravellingTrip(today: string): DemoTrip {
  const d = phaseDates(today);

  // Three stops along the Great Ocean Road.
  // Today is a long driving day: Torquay → Nelson (~291 km straight-line).
  // The traveller leaves Torquay today and arrives in Nelson tonight.
  const stops: DemoStop[] = [
    {
      key: "tv:stop:torquay",
      name: "Torquay",
      country: "Australia",
      countryCode: "au",
      lat: -38.3309,
      lng: 144.3234,
      timezone: "Australia/Melbourne",
      arriveDate: d.travelling.start,
      departDate: today,
      nights: 2,
      notes: "Bells Beach, surf scene. Start of the Great Ocean Road.",
      sortOrder: 0,
    },
    {
      // Apollo Bay was a scenic detour — already passed through on day 1.
      key: "tv:stop:apollo-bay",
      name: "Apollo Bay",
      country: "Australia",
      countryCode: "au",
      lat: -38.7612,
      lng: 143.6719,
      timezone: "Australia/Melbourne",
      arriveDate: addDays(d.travelling.start, 1),
      departDate: addDays(d.travelling.start, 1),
      nights: 0,
      notes: "Koalas, Mait's Rest rainforest walk, fresh crayfish.",
      sortOrder: 1,
    },
    {
      // Tonight's destination — traveller drives here today and sleeps here.
      key: "tv:stop:nelson",
      name: "Nelson",
      country: "Australia",
      countryCode: "au",
      lat: -38.0423,
      lng: 141.0103,
      timezone: "Australia/Melbourne",
      arriveDate: today,
      departDate: addDays(today, 4),
      nights: 4,
      notes: "Gateway to the Coorong — end of the Great Ocean Road journey.",
      sortOrder: 2,
    },
  ];

  // CAR leg on today: Torquay → Nelson
  // Haversine ≈ 291km → drive ≈ 291 × 1.5 / 80 × 60 = 327 min > 300 threshold
  const transports: DemoTransport[] = [
    {
      key: "tv:tr:airport-torquay",
      mode: "BUS",
      fromStopKey: null,
      toStopKey: "tv:stop:torquay",
      depIsHome: true,
      depPlace: "Melbourne Airport (MEL)",
      depAt: `${d.travelling.start}T09:00:00+10:00`,
      arrPlace: "Torquay Surf Beach car park",
      arrAt: `${d.travelling.start}T11:15:00+10:00`,
      reference: "Airport Shuttle",
      notes: "Pre-booked shuttle to Torquay — pick up rental car on arrival.",
      sortOrder: 0,
      cost: { estimatedMinor: 4500, currency: "AUD" },
    },
    {
      // Long CAR drive on today: Torquay → Nelson (~291km straight-line)
      // With default winding factor 1.5 and avg speed 80kph:
      // 291 × 1.5 / 80 × 60 ≈ 327 min — exceeds the 300-min threshold
      key: "tv:tr:torquay-nelson",
      mode: "CAR",
      fromStopKey: "tv:stop:torquay",
      toStopKey: "tv:stop:nelson",
      depPlace: "Torquay, VIC",
      arrPlace: "Nelson, VIC",
      depAt: `${today}T07:30:00+10:00`,
      arrAt: `${today}T15:00:00+10:00`,
      notes: "The full Great Ocean Road run — fuel up before departure.",
      sortOrder: 1,
    },
    {
      key: "tv:tr:nelson-home",
      mode: "CAR",
      fromStopKey: "tv:stop:nelson",
      toStopKey: null,
      arrIsHome: true,
      depPlace: "Nelson, VIC",
      arrPlace: "Melbourne, VIC",
      depAt: `${addDays(today, 4)}T09:00:00+10:00`,
      arrAt: `${addDays(today, 4)}T14:00:00+10:00`,
      notes: "Return drive to Melbourne for car drop-off.",
      sortOrder: 2,
    },
  ];

  const accommodations: DemoAccommodation[] = [
    {
      key: "tv:acc:torquay-bnb",
      stopKey: "tv:stop:torquay",
      name: "Torquay Beachside B&B",
      address: "45 The Esplanade, Torquay VIC 3228",
      checkIn: d.travelling.start,
      checkOut: today,
      lat: -38.3356,
      lng: 144.3278,
      cost: { estimatedMinor: 22000, currency: "AUD" },
    },
    {
      // Tonight's accommodation — at the drive's destination (Nelson).
      // checkIn=today matches the CAR leg arrPlace.
      key: "tv:acc:nelson-tonight",
      stopKey: "tv:stop:nelson",
      name: "Nelson Gateway Cabins",
      address: "1 Kellett St, Nelson VIC 3292",
      checkIn: today,
      checkOut: addDays(today, 4),
      lat: -38.0436,
      lng: 141.0156,
      cost: { estimatedMinor: 32000, currency: "AUD" },
    },
  ];

  // Located item on today (arrival evening in Nelson — the drive's destination)
  const items: DemoItem[] = [
    {
      key: "tv:item:bells-beach",
      title: "Bells Beach — watch the surf",
      category: "ACTIVITY",
      stopKey: "tv:stop:torquay",
      date: d.travelling.start,
      startTime: "15:00",
      endTime: "17:00",
      lat: -38.3713,
      lng: 144.2838,
      notes: "World famous point break — Rip Curl Pro held here.",
      sortOrder: 0,
    },
    {
      // Located item on today with lat/lng — required by acceptance test.
      // Nelson: arrival evening sunset walk after the long drive.
      key: "tv:item:nelson-estuary-sunset",
      title: "Nelson estuary — sunset walk after the long drive",
      category: "ACTIVITY",
      stopKey: "tv:stop:nelson",
      date: today,
      startTime: "17:30",
      endTime: "19:00",
      lat: -38.0423,
      lng: 141.0103,
      notes: "Stretch the legs after a big day behind the wheel.",
      sortOrder: 1,
    },
    {
      key: "tv:item:twelve-apostles",
      title: "Twelve Apostles at sunset",
      category: "SIGHTSEEING",
      stopKey: "tv:stop:apollo-bay",
      date: addDays(d.travelling.start, 1),
      startTime: "16:30",
      endTime: "18:30",
      lat: -38.6627,
      lng: 143.1051,
      notes: "Park at the visitor centre and walk across the bridge.",
      sortOrder: 2,
    },
    {
      key: "tv:item:coorong-canoe",
      title: "Coorong estuary canoe tour",
      category: "ACTIVITY",
      stopKey: "tv:stop:nelson",
      date: addDays(today, 3),
      startTime: "09:00",
      endTime: "13:00",
      lat: -38.0100,
      lng: 141.0300,
      booking: "COOR-881",
      cost: { estimatedMinor: 9500, currency: "AUD" },
      sortOrder: 3,
    },
  ];

  return {
    key: "tv:trip",
    name: "Great Ocean Road, right now",
    createdBy: "you",
    startDate: d.travelling.start,
    endDate: d.travelling.end,
    homeCurrency: "AUD",
    coverGradient: ["#38bdf8", "#0284c7"],
    stops,
    chapters: [],
    transports,
    accommodations,
    items,
    costs: [],
  };
}

// ---------------------------------------------------------------------------
// Past Trip: "Spirit of Tassie"
// Phase: past (today-21 … today-7)
// ---------------------------------------------------------------------------

export function buildPastTrip(today: string): DemoTrip {
  const d = phaseDates(today);

  const stops: DemoStop[] = [
    {
      key: "pa:stop:devonport",
      name: "Devonport",
      country: "Australia",
      countryCode: "au",
      lat: -41.1796,
      lng: 146.3558,
      timezone: "Australia/Hobart",
      arriveDate: d.past.start,
      departDate: addDays(d.past.start, 1),
      nights: 1,
      notes: "Ferry arrives early — grab breakfast and hit the road.",
      sortOrder: 0,
    },
    {
      key: "pa:stop:launceston",
      name: "Launceston",
      country: "Australia",
      countryCode: "au",
      lat: -41.4388,
      lng: 147.1347,
      timezone: "Australia/Hobart",
      arriveDate: addDays(d.past.start, 1),
      departDate: addDays(d.past.start, 4),
      nights: 3,
      notes: "Cataract Gorge, Tamar Valley wine country.",
      sortOrder: 1,
    },
    {
      key: "pa:stop:hobart",
      name: "Hobart",
      country: "Australia",
      countryCode: "au",
      lat: -42.8821,
      lng: 147.3272,
      timezone: "Australia/Hobart",
      arriveDate: addDays(d.past.start, 4),
      departDate: addDays(d.past.start, 9),
      nights: 5,
      notes: "MONA, Salamanca Markets, Bruny Island day trip.",
      sortOrder: 2,
    },
    {
      key: "pa:stop:port-arthur",
      name: "Port Arthur",
      country: "Australia",
      countryCode: "au",
      lat: -43.1454,
      lng: 147.8500,
      timezone: "Australia/Hobart",
      arriveDate: addDays(d.past.start, 9),
      departDate: addDays(d.past.start, 11),
      nights: 2,
      notes: "Historic convict site — day + ghost tour.",
      sortOrder: 3,
    },
    {
      key: "pa:stop:strahan",
      name: "Strahan",
      country: "Australia",
      countryCode: "au",
      lat: -42.1530,
      lng: 145.3315,
      timezone: "Australia/Hobart",
      arriveDate: addDays(d.past.start, 11),
      departDate: addDays(d.past.start, 13),
      nights: 2,
      notes: "Gordon River cruise, West Coast Wilderness Railway.",
      sortOrder: 4,
    },
    {
      key: "pa:stop:devonport-end",
      name: "Devonport (return)",
      country: "Australia",
      countryCode: "au",
      lat: -41.1796,
      lng: 146.3558,
      timezone: "Australia/Hobart",
      arriveDate: addDays(d.past.start, 13),
      departDate: d.past.end,
      nights: 1,
      notes: "Final night before the ferry home.",
      sortOrder: 5,
    },
  ];

  const transports: DemoTransport[] = [
    {
      // Ferry outbound: Melbourne → Devonport
      key: "pa:tr:mel-devonport",
      mode: "FERRY",
      fromStopKey: null,
      toStopKey: "pa:stop:devonport",
      depIsHome: true,
      depPlace: "Station Pier, Port Melbourne",
      depAt: `${addDays(d.past.start, -1)}T21:00:00+10:00`,
      arrPlace: "Devonport Ferry Terminal",
      arrAt: `${d.past.start}T06:30:00+11:00`,
      reference: "Spirit of Tasmania I",
      notes: "Overnight crossing — cabin booked. ~11h.",
      sortOrder: 0,
      cost: { estimatedMinor: 98000, actualMinor: 98000, currency: "AUD", paid: true },
    },
    {
      key: "pa:tr:devonport-launceston",
      mode: "CAR",
      fromStopKey: "pa:stop:devonport",
      toStopKey: "pa:stop:launceston",
      depPlace: "Devonport",
      arrPlace: "Launceston",
      depAt: `${addDays(d.past.start, 1)}T09:00:00+11:00`,
      arrAt: `${addDays(d.past.start, 1)}T11:00:00+11:00`,
      notes: "Pick up rental at Devonport Airport.",
      sortOrder: 1,
    },
    {
      key: "pa:tr:launceston-hobart",
      mode: "CAR",
      fromStopKey: "pa:stop:launceston",
      toStopKey: "pa:stop:hobart",
      depPlace: "Launceston",
      arrPlace: "Hobart",
      depAt: `${addDays(d.past.start, 4)}T10:00:00+11:00`,
      arrAt: `${addDays(d.past.start, 4)}T12:30:00+11:00`,
      notes: "Via Midland Hwy — stop at Ross for a pie.",
      sortOrder: 2,
    },
    {
      key: "pa:tr:hobart-port-arthur",
      mode: "CAR",
      fromStopKey: "pa:stop:hobart",
      toStopKey: "pa:stop:port-arthur",
      depPlace: "Hobart",
      arrPlace: "Port Arthur",
      depAt: `${addDays(d.past.start, 9)}T09:30:00+11:00`,
      arrAt: `${addDays(d.past.start, 9)}T11:15:00+11:00`,
      notes: "Via Eaglehawk Neck and the blowhole.",
      sortOrder: 3,
    },
    {
      key: "pa:tr:port-arthur-strahan",
      mode: "CAR",
      fromStopKey: "pa:stop:port-arthur",
      toStopKey: "pa:stop:strahan",
      depPlace: "Port Arthur",
      arrPlace: "Strahan",
      depAt: `${addDays(d.past.start, 11)}T08:00:00+11:00`,
      arrAt: `${addDays(d.past.start, 11)}T14:30:00+11:00`,
      notes: "Long drive across the island — fuel up in Hobart.",
      sortOrder: 4,
    },
    {
      key: "pa:tr:strahan-devonport",
      mode: "CAR",
      fromStopKey: "pa:stop:strahan",
      toStopKey: "pa:stop:devonport-end",
      depPlace: "Strahan",
      arrPlace: "Devonport",
      depAt: `${addDays(d.past.start, 13)}T09:00:00+11:00`,
      arrAt: `${addDays(d.past.start, 13)}T13:00:00+11:00`,
      notes: "Return north for the overnight ferry.",
      sortOrder: 5,
    },
    {
      // Ferry return: Devonport → Melbourne
      key: "pa:tr:devonport-mel",
      mode: "FERRY",
      fromStopKey: "pa:stop:devonport-end",
      toStopKey: null,
      arrIsHome: true,
      depPlace: "Devonport Ferry Terminal",
      depAt: `${addDays(d.past.end, -1)}T18:00:00+11:00`,
      arrPlace: "Station Pier, Port Melbourne",
      arrAt: `${d.past.end}T05:30:00+10:00`,
      reference: "Spirit of Tasmania II",
      notes: "Return crossing.",
      sortOrder: 6,
      cost: { estimatedMinor: 88000, actualMinor: 88000, currency: "AUD", paid: true },
    },
  ];

  const accommodations: DemoAccommodation[] = [
    {
      key: "pa:acc:devonport-inn",
      stopKey: "pa:stop:devonport",
      name: "Devonport Gateway Motor Inn",
      address: "16 Fenton St, Devonport TAS 7310",
      checkIn: d.past.start,
      checkOut: addDays(d.past.start, 1),
      lat: -41.1789,
      lng: 146.3561,
      cost: { estimatedMinor: 14000, actualMinor: 14000, currency: "AUD", paid: true },
    },
    {
      key: "pa:acc:launceston-hotel",
      stopKey: "pa:stop:launceston",
      name: "Peppers Silo Hotel Launceston",
      address: "89 Lindsay St, Launceston TAS 7250",
      checkIn: addDays(d.past.start, 1),
      checkOut: addDays(d.past.start, 4),
      confirmation: "PSH-91041",
      lat: -41.4350,
      lng: 147.1384,
      cost: { estimatedMinor: 57000, actualMinor: 57000, currency: "AUD", paid: true },
    },
    {
      key: "pa:acc:hobart-salamanca",
      stopKey: "pa:stop:hobart",
      name: "Salamanca Inn",
      address: "10 Gladstone St, Battery Point TAS 7004",
      checkIn: addDays(d.past.start, 4),
      checkOut: addDays(d.past.start, 9),
      confirmation: "SI-30214",
      lat: -42.8830,
      lng: 147.3305,
      cost: { estimatedMinor: 95000, actualMinor: 95000, currency: "AUD", paid: true },
    },
    {
      key: "pa:acc:port-arthur-lodge",
      stopKey: "pa:stop:port-arthur",
      name: "Port Arthur Motor Inn",
      address: "Arthur Hwy, Port Arthur TAS 7182",
      checkIn: addDays(d.past.start, 9),
      checkOut: addDays(d.past.start, 11),
      lat: -43.1460,
      lng: 147.8492,
      cost: { estimatedMinor: 28000, actualMinor: 28000, currency: "AUD", paid: true },
    },
    {
      key: "pa:acc:strahan-village",
      stopKey: "pa:stop:strahan",
      name: "Strahan Village",
      address: "The Esplanade, Strahan TAS 7468",
      checkIn: addDays(d.past.start, 11),
      checkOut: addDays(d.past.start, 13),
      confirmation: "SV-51028",
      lat: -42.1540,
      lng: 145.3320,
      cost: { estimatedMinor: 38000, actualMinor: 38000, currency: "AUD", paid: true },
    },
    {
      key: "pa:acc:devonport-end-inn",
      stopKey: "pa:stop:devonport-end",
      name: "Devonport Gateway Motor Inn",
      address: "16 Fenton St, Devonport TAS 7310",
      checkIn: addDays(d.past.start, 13),
      checkOut: d.past.end,
      lat: -41.1789,
      lng: 146.3561,
      cost: { estimatedMinor: 14000, actualMinor: 14000, currency: "AUD", paid: true },
    },
  ];

  const items: DemoItem[] = [
    {
      key: "pa:item:cataract-gorge",
      title: "Cataract Gorge & chairlift",
      category: "SIGHTSEEING",
      stopKey: "pa:stop:launceston",
      date: addDays(d.past.start, 2),
      startTime: "10:00",
      endTime: "12:30",
      lat: -41.4521,
      lng: 147.1188,
      sortOrder: 0,
    },
    {
      key: "pa:item:mona",
      title: "MONA — Museum of Old and New Art",
      category: "SIGHTSEEING",
      stopKey: "pa:stop:hobart",
      date: addDays(d.past.start, 5),
      startTime: "10:00",
      endTime: "14:00",
      lat: -42.8267,
      lng: 147.2824,
      cost: { estimatedMinor: 3600, actualMinor: 3600, currency: "AUD" },
      sortOrder: 1,
    },
    {
      key: "pa:item:salamanca-market",
      title: "Salamanca Market",
      category: "FOOD",
      stopKey: "pa:stop:hobart",
      date: addDays(d.past.start, 6),
      startTime: "08:30",
      endTime: "11:00",
      lat: -42.8833,
      lng: 147.3302,
      notes: "Every Saturday. Handmade crafts, Tasmanian produce.",
      sortOrder: 2,
    },
    {
      key: "pa:item:gordon-river",
      title: "Gordon River cruise",
      category: "ACTIVITY",
      stopKey: "pa:stop:strahan",
      date: addDays(d.past.start, 12),
      startTime: "09:00",
      endTime: "15:30",
      lat: -42.1530,
      lng: 145.3315,
      booking: "GRC-5512",
      cost: { estimatedMinor: 22000, actualMinor: 22000, currency: "AUD" },
      sortOrder: 3,
    },
  ];

  const costs: DemoCost[] = [
    {
      ownerType: "OTHER",
      label: "Rental car — 14 days",
      category: "Transport",
      currency: "AUD",
      estimatedMinor: 85000,
      actualMinor: 91500,
      paid: true,
    },
    {
      ownerType: "OTHER",
      label: "National park passes",
      category: "Entrance fees",
      currency: "AUD",
      estimatedMinor: 7200,
      actualMinor: 7200,
      paid: true,
    },
    {
      ownerType: "OTHER",
      label: "Meals & groceries",
      category: "Food",
      currency: "AUD",
      estimatedMinor: 60000,
      actualMinor: 67400,
      paid: true,
    },
  ];

  const journal: DemoJournalEntry[] = [
    {
      date: addDays(d.past.start, 1),
      author: "you",
      body: "Woke up as the ferry pulled into Devonport at dawn. The air tasted different — cleaner, colder. Picked up the Subaru and drove down through apple orchards to Launceston. Cataract Gorge before lunch. Tasmania doesn't waste any time.",
    },
    {
      date: addDays(d.past.start, 5),
      author: "you",
      body: "MONA destroyed us. Spent four hours in there and barely scratched the surface. The piece about time and decay in the basement — we stood in front of it for probably twenty minutes without speaking. This whole island feels like that.",
    },
    {
      date: addDays(d.past.start, 12),
      author: "partner",
      body: "Gordon River cruise was the best thing we've done all trip. Three hours of mirror-calm water, ancient Huon pines, total silence except for the engine. The wilderness railway back through the mountains was almost as good. Already talking about coming back.",
    },
  ];

  return {
    key: "pa:trip",
    name: "Spirit of Tassie",
    createdBy: "you",
    startDate: d.past.start,
    endDate: d.past.end,
    homeCurrency: "AUD",
    coverGradient: ["#f97316", "#c2410c"],
    shareLink: true,
    stops,
    chapters: [],
    transports,
    accommodations,
    items,
    costs,
    journal,
  };
}
