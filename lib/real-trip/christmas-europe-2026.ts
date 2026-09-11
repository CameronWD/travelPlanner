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
 * Rome, home via Doha. Chapters are off.
 *
 * TRANSPORT TIMES ARE TRUE UTC INSTANTS — not wall-clock text with a `Z` glued
 * on. This is the app's own semantic: the write path converts a typed wall time
 * in the endpoint Stop's zone via `wallTimeToInstant`
 * (`server/actions/transport.ts`), and `transportTimeDisplay`
 * (`lib/time-display.ts`) renders that instant back in the same Stop's zone. So
 * a booking's printed wall time is stored here as the real moment it happens:
 * Munich Hbf 06:51 (Europe/Berlin, +1 in December) is `05:51:00Z`. Storing the
 * wall clock verbatim is exactly the defect `docs/things-to-fix.md` P0-1 fixed,
 * and any production row that still looks that way is that bug's output.
 * `christmas-europe-2026.test.ts` pins every leg's rendered wall time.
 *
 * One documented exception, deliberately accepted: the two home-base legs have
 * no Stop at the home end and therefore no timezone of their own, so
 * `resolveEndpointZones` falls back to the far endpoint's zone. Ticket wall
 * time → stored UTC instant → what the card renders, for each leg:
 *   - Gold Coast departure: ticket 17:50 Brisbane (UTC+10) → stored
 *     `2026-12-04T07:50:00Z` → renders 15:50 (Asia/Makassar).
 *   - Brisbane arrival: ticket 17:30 Brisbane (UTC+10) → stored
 *     `2027-01-08T07:30:00Z` → renders 08:30 (Europe/Rome).
 * True-instant correctness was chosen over the card reading; do not "fix"
 * these stored instants back to match the card — they are already correct.
 *
 * Pure module — no Prisma, no React, no network, no clock.
 */

import { transportTimeDisplay, dayDeltaSuffix } from "@/lib/time-display";
import type {
  DemoTrip,
  DemoStop,
  DemoTransport,
  DemoAccommodation,
  DemoCost,
  DemoInlineCost,
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

const ACCOMMODATIONS: DemoAccommodation[] = [
  { key: "xmas26:acc:denpasar", stopKey: SK.denpasar, name: "1 Bedroom private pool @Kuta", address: "758F+272, Jalan Bhineka Jati Jaya XI, Kuta, Kuta, Bali, 80361, Indonesia", checkIn: "2026-12-04", checkOut: "2026-12-05", confirmation: "HM2EDZ4CB5", notes: "Check-in after 2:00pm, check-out by 12:00pm.\nSelf check-in with building staff. 2 guests maximum.\nHost has not reported a smoke/carbon monoxide detector.\nBalance auto-debits 2026-11-25 (Visa 4190).", cost: { costMinor: 11520, currency: "AUD" } },
  { key: "xmas26:acc:munich", stopKey: SK.munich, name: "B&B Hotel München-Hbf", address: "Landwehrstraße 77, Ludwigsvorstadt, 80336 Munich, Germany", checkIn: "2026-12-06", checkOut: "2026-12-10", confirmation: "5201106083", notes: "Pin Code: 8460", cost: { costMinor: 80609, currency: "AUD" } },
  { key: "xmas26:acc:strasbourg", stopKey: SK.strasbourg, name: "B&B Hotel Kehl", address: "15 Allensteiner Straße, 77694 Kehl am Rhein, Germany", checkIn: "2026-12-10", checkOut: "2026-12-13", confirmation: "6031790255 PIN:4046", notes: "Staying in Kehl, across the Rhine from Strasbourg — tram back each night.", cost: { costMinor: 81000, currency: "AUD" } },
  { key: "xmas26:acc:frankfurt", stopKey: SK.frankfurt, name: "Premier Inn Frankfurt City Europaviertel", address: "Mainzer Landstr. 117+119, Gallusviertel, 60327 Frankfurt/Main, Germany", checkIn: "2026-12-13", checkOut: "2026-12-15", confirmation: "6925281379, PIN:8192", cost: { costMinor: 18700, currency: "AUD" } },
  { key: "xmas26:acc:paris", stopKey: SK.paris, name: "Villa Margaux Opéra Montmartre", address: "23, Rue Henry Monnier, 9th arr., 75009 Paris, France", checkIn: "2026-12-15", checkOut: "2026-12-19", confirmation: "5887236633, PIN:7856", notes: "Check in after 3pm\nCheckout before 11", cost: { costMinor: 91652, currency: "AUD" } },
  { key: "xmas26:acc:london", stopKey: SK.london, name: "Zedwell Underground Hotel Tottenham Court Rd", address: "112 Great Russell Street, Camden, London, WC1B 3NQ, United Kingdom", checkIn: "2026-12-19", checkOut: "2026-12-22", confirmation: "5012646116, PIN:8416", notes: "Check in after 3pm\nCheckout before 10am", cost: { costMinor: 54535, currency: "AUD" } },
  { key: "xmas26:acc:aghalee", stopKey: SK.aghalee, name: "Clenaghans", address: "48 Soldierstown Road, Aghalee", checkIn: "2026-12-22", checkOut: "2026-12-29", confirmation: "HM855WTW9F", cost: { costMinor: 130417, currency: "AUD" } },
  { key: "xmas26:acc:dublin", stopKey: SK.dublin, name: "Point A Dublin The Liberties", address: "Oliver Bond St, The Liberties, Dublin, Ireland", checkIn: "2026-12-29", checkOut: "2026-12-30", confirmation: "HMKSN99TRQ", notes: "Check-in from 3:00pm, check-out by 11:00am.\nCashless hotel — photo ID and credit card required at check-in.\nEarly check-in from 12:00pm for €15; late check-out €25.\n100% non-smoking.", cost: { costMinor: 15642, currency: "AUD", paid: true, paidMinor: 15642, paidAt: "2026-08-11" } },
  { key: "xmas26:acc:como", stopKey: SK.como, name: "attico capicci", address: "Via Fratelli Bronzetti, 21, 22100 Como CO, Italy", checkIn: "2026-12-30", checkOut: "2027-01-01", confirmation: "HMXAXCW8QE", notes: "Check-in after 3:00pm, check-out by 10:00am.\nItalian law requires the host to register passport/ID details.\nNo pets, no commercial photography.\nBalance auto-debits 2026-11-23 (Visa 4190).", cost: { costMinor: 116873, currency: "AUD" } },
  { key: "xmas26:acc:milan", stopKey: SK.milan, name: "Ibis Milano Centro", address: "Via Finocchiaro Aprile 2, Stazione Centrale, 20124 Milan, Italy", checkIn: "2027-01-01", checkOut: "2027-01-02", confirmation: "5622902959, PIN:1094", cost: { costMinor: 16900, currency: "AUD" } },
  { key: "xmas26:acc:rome", stopKey: SK.rome, name: "The Club Navona", address: "Corso Vittorio Emanuele II 184, Navona, Rome, 00186, Italy", checkIn: "2027-01-02", checkOut: "2027-01-07", confirmation: "6243212144 (PIN: 4820)", notes: "Check-in 14:00–23:30, check-out 00:00–10:00.\nCASH ONLY — full payment due on arrival, no credit cards accepted.\nLate-arrival surcharge: €10 (18:00–20:00), €15 (20:00–22:00), €20 (22:00–00:00).\nCity tax of €70 is collected separately at the property.", cost: { costMinor: 53610, currency: "EUR" } },
];

// --- transports (Task 4) ---------------------------------------------------

const TRANSPORTS: DemoTransport[] = [
  { key: "xmas26:tr:home-denpasar", mode: "FLIGHT", fromStopKey: null, toStopKey: SK.denpasar, depIsHome: true, depPlace: "Gold Coast (OOL)", depAt: "2026-12-04T07:50:00Z", arrPlace: "Denpasar (DPS)", arrAt: "2026-12-04T14:15:00Z", reference: "WNIQHG", sortOrder: 0, cost: { costMinor: 89559, currency: "AUD", paid: true, paidMinor: 89559, paidAt: "2026-07-13" } },
  { key: "xmas26:tr:denpasar-munich", mode: "FLIGHT", fromStopKey: SK.denpasar, toStopKey: SK.munich, depPlace: "Denpasar (DPS)", depAt: "2026-12-05T11:00:00Z", arrPlace: "Munich (MUC)", arrAt: "2026-12-06T05:45:00Z", reference: "DHZU24", notes: "Thai Airways via Bangkok.\nArrives BKK 22:15 on 5 Dec; onward TG924 lands Munich 06:45 on 6 Dec.\nOvernight in the air — no bed booked for the night of the 5th.", sortOrder: 1, cost: { costMinor: 163569, currency: "AUD", paid: true, paidMinor: 163569, paidAt: "2026-07-19" } },
  { key: "xmas26:tr:munich-strasbourg", mode: "TRAIN", fromStopKey: SK.munich, toStopKey: SK.strasbourg, depPlace: "Munich Hbf", depAt: "2026-12-10T05:51:00Z", arrPlace: "Strasbourg", arrAt: "2026-12-10T09:40:00Z", reference: "300186503818", notes: "1st Class\nCarriage 13 - Seat 350,351\nBring ID\nArrive at least 20 minutes early\nWill need to catch tram back to accom in Kehl", sortOrder: 2, cost: { costMinor: 23521, currency: "AUD", paid: true, paidMinor: 23521, paidAt: "2026-07-26" } },
  { key: "xmas26:tr:strasbourg-frankfurt", mode: "TRAIN", fromStopKey: SK.strasbourg, toStopKey: SK.frankfurt, notes: "Not booked yet — travelling 13 Dec.", sortOrder: 3 },
  { key: "xmas26:tr:frankfurt-paris", mode: "TRAIN", fromStopKey: SK.frankfurt, toStopKey: SK.paris, notes: "Not booked yet — travelling 15 Dec.", sortOrder: 4 },
  { key: "xmas26:tr:paris-london", mode: "TRAIN", fromStopKey: SK.paris, toStopKey: SK.london, depPlace: "Paris Gare du Nord", depAt: "2026-12-19T07:02:00Z", arrPlace: "London St Pancras", arrAt: "2026-12-19T09:30:00Z", reference: "WXFVKQ", notes: "Carriage 15\nSeats 53 and 54", sortOrder: 5, cost: { costMinor: 41438, currency: "AUD", paid: true, paidMinor: 41438, paidAt: "2026-07-26" } },
  { key: "xmas26:tr:london-aghalee", mode: "FLIGHT", fromStopKey: SK.london, toStopKey: SK.aghalee, depPlace: "London Heathrow (LHR)", depAt: "2026-12-22T09:15:00Z", arrPlace: "Belfast City (BHD)", arrAt: "2026-12-22T10:40:00Z", reference: "XHARUZ", notes: "British Airways\nHeathrow (LHR) - Terminal 5\n1hr 25 mins\nBelfast City Airport (BHD)", sortOrder: 6 },
  { key: "xmas26:tr:aghalee-dublin", mode: "TRAIN", fromStopKey: SK.aghalee, toStopKey: SK.dublin, notes: "Not booked yet — travelling 29 Dec. Train or coach.", sortOrder: 7 },
  { key: "xmas26:tr:dublin-como", mode: "FLIGHT", fromStopKey: SK.dublin, toStopKey: SK.como, depPlace: "Dublin (DUB)", depAt: "2026-12-30T08:15:00Z", arrPlace: "Milan Malpensa (MXP)", arrAt: "2026-12-30T10:45:00Z", reference: "FR7799 · H4WP7Q", notes: "Ryanair.\n2x 20kg checked bags included. Seats 16A and 16B.\nMust use the Ryanair app for boarding passes — printed passes are not accepted.\nOnward transfer to Como is a separate leg.", sortOrder: 8, cost: { costMinor: 35862, currency: "EUR", paid: true, paidMinor: 35862, paidAt: "2026-08-11" } },
  { key: "xmas26:tr:mxp-como", mode: "TRAIN", fromStopKey: null, toStopKey: SK.como, depPlace: "Milan Malpensa (MXP)", arrPlace: "Como", notes: "Not booked yet — airport transfer on arrival, 30 Dec.", sortOrder: 9 },
  { key: "xmas26:tr:como-milan", mode: "TRAIN", fromStopKey: SK.como, toStopKey: SK.milan, notes: "Not booked yet — travelling 1 Jan.", sortOrder: 10 },
  { key: "xmas26:tr:milan-rome", mode: "TRAIN", fromStopKey: SK.milan, toStopKey: SK.rome, notes: "Not booked yet — travelling 2 Jan.", sortOrder: 11 },
  { key: "xmas26:tr:rome-home", mode: "FLIGHT", fromStopKey: SK.rome, toStopKey: null, arrIsHome: true, depPlace: "Rome (FCO)", depAt: "2027-01-07T07:55:00Z", arrPlace: "Brisbane (BNE)", arrAt: "2027-01-08T07:30:00Z", reference: "8QPEWK", notes: "Leave Rome 8:55am 7th Jan\n5 hours 10 minutes\nArrive Doha 4:05pm 7th Jan\nLeave Doha 8:25pm\n14 hours 5 minutes\nArrive Brisbane 5:30pm 8th Jan", sortOrder: 12 },
];

// --- standalone costs (Task 4) ---------------------------------------------

const COSTS: DemoCost[] = [
  { ownerType: "OTHER", label: "Rome city tax", costMinor: 7000, currency: "EUR" },
];

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

/** "895.59 AUD · paid 2026-07-13" / "536.10 EUR · unpaid" / "no cost". */
function describeCost(cost: DemoInlineCost | null | undefined): string {
  if (!cost) return "no cost";
  const amount = `${(cost.costMinor / 100).toFixed(2)} ${cost.currency}`;
  if (!cost.paid) return `${amount} · unpaid`;
  const paidAmount = `${((cost.paidMinor ?? cost.costMinor) / 100).toFixed(2)}`;
  // A paid cost with no paidAt is a real hazard, not a cosmetic one: the
  // persister stamps the seed *run date* in its place, and lib/budget.ts
  // treats paidAt as the sole signal that money has left the account.
  const when = cost.paidAt ? `paid ${cost.paidAt}` : "paid ⚠️ NO DATE — seed will stamp today";
  return `${amount} · ${when} (${paidAmount} ${cost.currency})`;
}

/**
 * Render the trip as a human-readable printout for the dry-run. Pure: it reads
 * the same descriptor the persister consumes, so what it prints is exactly
 * what would be written. There is no local Postgres in this project's sandbox,
 * so this is the last line of defence before a production write.
 *
 * Transport times are printed through `transportTimeDisplay` — the same pure
 * helper the transport card uses — rather than as raw instants, so the printout
 * shows the wall clock a human can check against a booking confirmation. A leg
 * whose stored instant is wrong shows up here as a wrong time, which a table of
 * `Z` strings never would.
 */
export function summariseRealTrip(trip: DemoTrip): string {
  const allCosts = [
    ...trip.transports.map((x) => x.cost),
    ...trip.accommodations.map((a) => a.cost),
    ...trip.items.map((i) => i.cost),
    ...trip.costs,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  const totals = new Map<string, number>();
  for (const c of allCosts) totals.set(c.currency, (totals.get(c.currency) ?? 0) + c.costMinor);

  const bedByStop = new Map(trip.accommodations.map((a) => [a.stopKey, a]));
  const lines: string[] = [];

  // Exchange rates get their own count in the printout: a rate that failed to
  // appear is exactly the kind of thing this preview should surface, since a
  // missing rate means the persister silently leaves that currency's costs
  // unconverted (see rateToHome's console.warn in prisma/real/persist.ts).
  const rateCount = trip.exchangeRates?.length ?? 0;

  lines.push(`${trip.name}  ${trip.startDate} → ${trip.endDate}  (${trip.homeCurrency})`);
  lines.push(`home base: ${trip.home?.name ?? "none"} · round trip: ${trip.roundTrip ?? true} · chapters: ${trip.chapters.length}`);
  lines.push("");
  lines.push(
    `${trip.stops.length} stops, ${trip.accommodations.length} accommodations, ${trip.transports.length} transports, ` +
      `${allCosts.length} costs, ${rateCount} exchange rate${rateCount === 1 ? "" : "s"}`,
  );
  lines.push("");

  for (const s of [...trip.stops].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const bed = bedByStop.get(s.key);
    lines.push(`  ${s.arriveDate} → ${s.departDate}  ${s.name} (${s.nights}n)  ${bed ? bed.name : "NO BED"}`);
  }

  // --- Transports, timed exactly as the app will render them ---------------
  const stopByKey = new Map(trip.stops.map((s) => [s.key, s]));
  const tzOf = (key: string | null | undefined) =>
    (key ? stopByKey.get(key)?.timezone : null) ?? null;
  const endpointLabel = (
    place: string | null | undefined,
    stopKey: string | null | undefined,
    isHome: boolean | undefined,
  ) => {
    const base = place ?? (stopKey ? stopByKey.get(stopKey)?.name : null) ?? trip.home?.name ?? "?";
    return isHome ? `${base} [home]` : base;
  };

  lines.push("");
  lines.push("transports:");
  let anyHomeEndpoint = false;
  for (const x of [...trip.transports].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const { dep, arr, dayDelta } = transportTimeDisplay({
      depAt: x.depAt ? new Date(x.depAt) : null,
      arrAt: x.arrAt ? new Date(x.arrAt) : null,
      fromTimezone: tzOf(x.fromStopKey),
      toTimezone: tzOf(x.toStopKey),
    });
    if (x.depIsHome || x.arrIsHome) anyHomeEndpoint = true;
    const when =
      dep || arr
        ? `${dep ? `${dep.dateISO} ${dep.time} ${dep.zone}` : "—"} → ` +
          `${arr ? `${arr.dateISO} ${arr.time} ${arr.zone}${dayDeltaSuffix(dayDelta)}` : "—"}`
        : "not booked — no times";
    lines.push(
      `  #${x.sortOrder} ${x.mode.padEnd(6)} ` +
        `${endpointLabel(x.depPlace, x.fromStopKey, x.depIsHome)} → ` +
        `${endpointLabel(x.arrPlace, x.toStopKey, x.arrIsHome)}`,
    );
    lines.push(`        ${when}  ·  ref ${x.reference ?? "—"}  ·  ${describeCost(x.cost)}`);
  }
  if (anyHomeEndpoint) {
    // Documented, accepted behaviour — see the module docblock. Spelling it out
    // in the printout stops a future reader "correcting" a correct instant.
    lines.push(
      "  note: a [home] endpoint has no Stop and therefore no timezone of its own, so its " +
        "time renders in the other endpoint's zone. The stored instants are the true moments.",
    );
  }

  lines.push("");
  for (const [cur, minor] of [...totals].sort()) {
    lines.push(`  total ${(minor / 100).toFixed(2)} ${cur}`);
  }

  return lines.join("\n");
}
