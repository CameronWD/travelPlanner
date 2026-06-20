import { db } from "../lib/db";

/**
 * Idempotent demo seed. Re-running it must not create duplicates, so every
 * row is upserted by a stable key: users by email; everything else by a
 * deterministic, human-readable id derived from the trip. This lets the whole
 * demo trip be re-seeded cleanly with `npm run db:seed`.
 */

const TRIP_ID = "seed-trip-europe-2026";

// Deterministic ids so upserts are stable across runs.
const ids = {
  stopLondon: "seed-stop-london",
  stopParis: "seed-stop-paris",
  stopRome: "seed-stop-rome",
  trLondonParis: "seed-tr-london-paris",
  trParisRome: "seed-tr-paris-rome",
  accLondon: "seed-acc-london",
  accParis: "seed-acc-paris",
  accRome: "seed-acc-rome",
  itemTower: "seed-item-tower",
  itemEiffel: "seed-item-eiffel",
  itemColosseum: "seed-item-colosseum",
  itemDinner: "seed-item-dinner",
  itemMuseumWish: "seed-item-museum-wish",
  itemGelatoWish: "seed-item-gelato-wish",
  costEiffel: "seed-cost-eiffel",
  costColosseum: "seed-cost-colosseum",
  costAccLondon: "seed-cost-acc-london",
  costInsurance: "seed-cost-insurance",
};

async function main() {
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

  // --- Trip --------------------------------------------------------------
  const trip = await db.trip.upsert({
    where: { id: TRIP_ID },
    update: {
      name: "Europe Summer 2026",
      startDate: "2026-07-01",
      endDate: "2026-07-12",
      homeCurrency: "AUD",
      createdById: you.id,
    },
    create: {
      id: TRIP_ID,
      name: "Europe Summer 2026",
      startDate: "2026-07-01",
      endDate: "2026-07-12",
      homeCurrency: "AUD",
      createdById: you.id,
    },
  });

  // --- Members (one owner, one member) -----------------------------------
  await db.tripMember.upsert({
    where: { tripId_userId: { tripId: trip.id, userId: you.id } },
    update: { role: "owner" },
    create: { tripId: trip.id, userId: you.id, role: "owner" },
  });
  await db.tripMember.upsert({
    where: { tripId_userId: { tripId: trip.id, userId: partner.id } },
    update: { role: "member" },
    create: { tripId: trip.id, userId: partner.id, role: "member" },
  });

  // --- Stops (London -> Paris -> Rome) -----------------------------------
  const london = await db.stop.upsert({
    where: { id: ids.stopLondon },
    update: {},
    create: {
      id: ids.stopLondon,
      tripId: trip.id,
      name: "London",
      country: "United Kingdom",
      lat: 51.5074,
      lng: -0.1278,
      timezone: "Europe/London",
      arriveDate: "2026-07-01",
      departDate: "2026-07-05",
      sortOrder: 0,
    },
  });
  const paris = await db.stop.upsert({
    where: { id: ids.stopParis },
    update: {},
    create: {
      id: ids.stopParis,
      tripId: trip.id,
      name: "Paris",
      country: "France",
      lat: 48.8566,
      lng: 2.3522,
      timezone: "Europe/Paris",
      arriveDate: "2026-07-05",
      departDate: "2026-07-09",
      sortOrder: 1,
    },
  });
  const rome = await db.stop.upsert({
    where: { id: ids.stopRome },
    update: {},
    create: {
      id: ids.stopRome,
      tripId: trip.id,
      name: "Rome",
      country: "Italy",
      lat: 41.9028,
      lng: 12.4964,
      timezone: "Europe/Rome",
      arriveDate: "2026-07-09",
      departDate: "2026-07-12",
      sortOrder: 2,
    },
  });

  // --- Transport between consecutive stops --------------------------------
  await db.transport.upsert({
    where: { id: ids.trLondonParis },
    update: {},
    create: {
      id: ids.trLondonParis,
      tripId: trip.id,
      fromStopId: london.id,
      toStopId: paris.id,
      mode: "TRAIN",
      depPlace: "London St Pancras",
      depAt: new Date("2026-07-05T09:24:00Z"),
      arrPlace: "Paris Gare du Nord",
      arrAt: new Date("2026-07-05T12:47:00Z"),
      reference: "ES9024",
      sortOrder: 0,
    },
  });
  await db.transport.upsert({
    where: { id: ids.trParisRome },
    update: {},
    create: {
      id: ids.trParisRome,
      tripId: trip.id,
      fromStopId: paris.id,
      toStopId: rome.id,
      mode: "FLIGHT",
      depPlace: "Paris CDG",
      depAt: new Date("2026-07-09T10:15:00Z"),
      arrPlace: "Rome FCO",
      arrAt: new Date("2026-07-09T12:25:00Z"),
      reference: "AF1104",
      sortOrder: 1,
    },
  });

  // --- One accommodation per stop ----------------------------------------
  await db.accommodation.upsert({
    where: { id: ids.accLondon },
    update: {},
    create: {
      id: ids.accLondon,
      tripId: trip.id,
      stopId: london.id,
      name: "The Bloomsbury Hotel",
      address: "16-22 Great Russell St, London WC1B 3NN",
      checkIn: "2026-07-01",
      checkOut: "2026-07-05",
      confirmation: "BLM-44192",
    },
  });
  await db.accommodation.upsert({
    where: { id: ids.accParis },
    update: {},
    create: {
      id: ids.accParis,
      tripId: trip.id,
      stopId: paris.id,
      name: "Hôtel des Grands Boulevards",
      address: "17 Boulevard Poissonnière, 75002 Paris",
      checkIn: "2026-07-05",
      checkOut: "2026-07-09",
      confirmation: "HGB-7781",
    },
  });
  await db.accommodation.upsert({
    where: { id: ids.accRome },
    update: {},
    create: {
      id: ids.accRome,
      tripId: trip.id,
      stopId: rome.id,
      name: "Hotel Artemide",
      address: "Via Nazionale, 22, 00184 Roma RM",
      checkIn: "2026-07-09",
      checkOut: "2026-07-12",
      confirmation: "ART-30551",
    },
  });

  // --- Items: some scheduled, some unscheduled (wishlist) -----------------
  await db.item.upsert({
    where: { id: ids.itemTower },
    update: {},
    create: {
      id: ids.itemTower,
      tripId: trip.id,
      stopId: london.id,
      title: "Tower of London",
      category: "SIGHTSEEING",
      date: "2026-07-02",
      startTime: "10:00",
      endTime: "12:30",
      lat: 51.5081,
      lng: -0.0759,
      sortOrder: 0,
    },
  });
  await db.item.upsert({
    where: { id: ids.itemDinner },
    update: {},
    create: {
      id: ids.itemDinner,
      tripId: trip.id,
      stopId: london.id,
      title: "Dinner in Soho",
      category: "FOOD",
      date: "2026-07-02",
      startTime: "19:30",
      sortOrder: 1,
    },
  });
  await db.item.upsert({
    where: { id: ids.itemEiffel },
    update: {},
    create: {
      id: ids.itemEiffel,
      tripId: trip.id,
      stopId: paris.id,
      title: "Eiffel Tower summit",
      category: "SIGHTSEEING",
      date: "2026-07-06",
      startTime: "14:00",
      endTime: "16:00",
      lat: 48.8584,
      lng: 2.2945,
      booking: "ET-558210",
      sortOrder: 0,
    },
  });
  await db.item.upsert({
    where: { id: ids.itemColosseum },
    update: {},
    create: {
      id: ids.itemColosseum,
      tripId: trip.id,
      stopId: rome.id,
      title: "Colosseum guided tour",
      category: "SIGHTSEEING",
      date: "2026-07-10",
      startTime: "09:30",
      endTime: "11:30",
      lat: 41.8902,
      lng: 12.4922,
      booking: "COL-91002",
      sortOrder: 0,
    },
  });
  // Unscheduled = wishlist (date == null)
  await db.item.upsert({
    where: { id: ids.itemMuseumWish },
    update: {},
    create: {
      id: ids.itemMuseumWish,
      tripId: trip.id,
      stopId: paris.id,
      title: "Musée d'Orsay",
      category: "SIGHTSEEING",
      sortOrder: 0,
    },
  });
  await db.item.upsert({
    where: { id: ids.itemGelatoWish },
    update: {},
    create: {
      id: ids.itemGelatoWish,
      tripId: trip.id,
      stopId: rome.id,
      title: "Best gelato in Trastevere",
      category: "FOOD",
      sortOrder: 1,
    },
  });

  // --- Sample costs (mixed currencies + one OTHER) -----------------------
  await db.cost.upsert({
    where: { id: ids.costEiffel },
    update: {},
    create: {
      id: ids.costEiffel,
      tripId: trip.id,
      estimatedMinor: 7400, // €74.00
      actualMinor: 7400,
      currency: "EUR",
      ownerType: "ITEM",
      ownerId: ids.itemEiffel,
      category: "SIGHTSEEING",
    },
  });
  await db.cost.upsert({
    where: { id: ids.costColosseum },
    update: {},
    create: {
      id: ids.costColosseum,
      tripId: trip.id,
      estimatedMinor: 6000, // €60.00
      currency: "EUR",
      ownerType: "ITEM",
      ownerId: ids.itemColosseum,
      category: "SIGHTSEEING",
    },
  });
  await db.cost.upsert({
    where: { id: ids.costAccLondon },
    update: {},
    create: {
      id: ids.costAccLondon,
      tripId: trip.id,
      estimatedMinor: 96000, // £960.00
      actualMinor: 98200, // £982.00
      currency: "GBP",
      ownerType: "ACCOMMODATION",
      ownerId: ids.accLondon,
    },
  });
  await db.cost.upsert({
    where: { id: ids.costInsurance },
    update: {},
    create: {
      id: ids.costInsurance,
      tripId: trip.id,
      estimatedMinor: 18000, // A$180.00
      currency: "AUD",
      ownerType: "OTHER",
      ownerId: null,
      label: "Travel insurance",
      category: "OTHER",
    },
  });

  console.log("Seed complete: trip", trip.name, "with 3 stops, 2 transports.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
