import { describe, it, expect, vi, beforeEach } from "vitest";

// getDay() runs the Day view's queries against per-model db mocks (mirrors
// app/(app)/trips/[tripId]/day/[date]/page.test.tsx). The itinerary, the
// Day view helpers, nearby and date arithmetic stay real — the assertions
// are about what the loader assembles from them.

const {
  tripFindUniqueMock,
  stopFindManyMock,
  itemFindManyMock,
  itemGroupByMock,
  transportFindManyMock,
  accommodationFindManyMock,
  journalEntryFindManyMock,
  attachmentFindManyMock,
  costFindManyMock,
  dayTitleFindManyMock,
  chapterFindManyMock,
  todayISOInZoneMock,
  tripTodayISOMock,
  getDayWeatherMock,
} = vi.hoisted(() => ({
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  itemGroupByMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  journalEntryFindManyMock: vi.fn(),
  attachmentFindManyMock: vi.fn(),
  costFindManyMock: vi.fn(),
  dayTitleFindManyMock: vi.fn(),
  chapterFindManyMock: vi.fn(),
  todayISOInZoneMock: vi.fn(),
  tripTodayISOMock: vi.fn(),
  getDayWeatherMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock, groupBy: itemGroupByMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    journalEntry: { findMany: journalEntryFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
    cost: { findMany: costFindManyMock },
    dayTitle: { findMany: dayTitleFindManyMock },
    chapter: { findMany: chapterFindManyMock },
  },
}));
vi.mock("@/lib/tz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tz")>();
  return { ...actual, todayISOInZone: todayISOInZoneMock };
});
vi.mock("@/lib/trip-today", () => ({ tripTodayISO: tripTodayISOMock }));
vi.mock("@/lib/weather", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/weather")>();
  return { ...actual, getDayWeather: getDayWeatherMock };
});

import { getDay, getDayWeatherView } from "@/lib/day-view-loader";
import { zoneLabel } from "@/lib/time-display";

const TRIP_ID = "trip-xmas";
const VIEWER = "u-cam";
const CO = "u-sam";

const TRIP = {
  name: "Christmas in Europe",
  startDate: "2026-12-04",
  endDate: "2027-01-08",
  homeCurrency: "AUD",
  homeName: "Brisbane",
  chaptersEnabled: true,
};

const stop = (o: { id: string; name: string; arriveDate: string; departDate: string; sortOrder: number; lat: number; lng: number }) => ({
  country: "France",
  countryCode: "FR",
  timezone: "Europe/Paris",
  ...o,
});
const PARIS = stop({ id: "s-paris", name: "Paris", arriveDate: "2026-12-06", departDate: "2026-12-10", sortOrder: 0, lat: 48.8566, lng: 2.3522 });
const STRASBOURG = stop({ id: "s-stras", name: "Strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-13", sortOrder: 1, lat: 48.5734, lng: 7.7521 });
const COLMAR = stop({ id: "s-colmar", name: "Colmar", arriveDate: "2026-12-13", departDate: "2026-12-16", sortOrder: 2, lat: 48.0794, lng: 7.3585 });

const HOTEL = {
  id: "a-corbeau",
  stopId: STRASBOURG.id,
  name: "Hôtel Cour du Corbeau",
  address: "6 Rue des Couples, Strasbourg",
  checkIn: "2026-12-10",
  checkOut: "2026-12-14",
  checkInTime: null,
  checkOutTime: null,
  confirmation: null,
  notes: null,
  lat: 48.5795,
  lng: 7.7498,
};

const datedItem = (id: string, date: string, startTime: string | null) => ({
  id,
  title: `Item ${id}`,
  category: "SIGHTSEEING",
  date,
  startTime,
  endTime: null,
  sortOrder: 0,
  stopId: STRASBOURG.id,
  lat: null,
  lng: null,
  address: null,
  link: null,
  booking: null,
  notes: null,
  hiddenFromShares: false,
  photoAttachmentId: null,
});
const DATED_ITEMS = [datedItem("i1", "2026-12-11", "09:00"), datedItem("i2", "2026-12-11", "12:00"), datedItem("i3", "2026-12-11", null)];

const THINGS_TO_DO = [
  { id: "t-cathedral", title: "Cathédrale Notre-Dame", category: "SIGHTSEEING", startTime: null },
  { id: "t-market", title: "Christkindelsmärik", category: "SHOPPING", startTime: "17:00" },
];
const WISHLIST = [
  { id: "w-petite", title: "Petite France walk", category: "SIGHTSEEING", lat: 48.5809, lng: 7.7406, countryCode: "FR" },
  { id: "w-tarte", title: "Tarte flambée", category: "FOOD", lat: null, lng: null, countryCode: "FR" },
];

const TRAIN = {
  id: "tr-colmar",
  mode: "TRAIN",
  fromStopId: STRASBOURG.id,
  toStopId: COLMAR.id,
  depPlace: null,
  arrPlace: null,
  depAt: new Date("2026-12-13T09:00:00Z"),
  arrAt: new Date("2026-12-13T09:40:00Z"),
  depLat: null,
  depLng: null,
  arrLat: null,
  arrLng: null,
  reference: null,
  notes: null,
  sortOrder: 0,
  anchorStopId: null,
  depIsHome: false,
  arrIsHome: false,
};

const traveller = (id: string, name: string) => ({ id, name, image: null, displayName: null, photoKey: null, photoUpdatedAt: null });

type Where = Record<string, unknown>;

function setup(opts: { today?: string; transports?: unknown[]; thingsToDo?: unknown[]; journal?: unknown[]; photos?: unknown[] } = {}) {
  tripTodayISOMock.mockReturnValue(opts.today ?? "2026-09-27");
  todayISOInZoneMock.mockReturnValue(opts.today ?? "2026-09-27");
  tripFindUniqueMock.mockResolvedValue(TRIP);
  stopFindManyMock.mockResolvedValue([PARIS, STRASBOURG, COLMAR]);
  itemFindManyMock.mockImplementation(async ({ where }: { where: Where }) => {
    if (where.date === null && where.stopId === null) return WISHLIST;
    if (where.date === null && typeof where.stopId === "string") return opts.thingsToDo ?? THINGS_TO_DO;
    return DATED_ITEMS;
  });
  itemGroupByMock.mockResolvedValue([{ date: "2026-12-11", _count: { _all: 3 } }]);
  transportFindManyMock.mockResolvedValue(opts.transports ?? []);
  accommodationFindManyMock.mockResolvedValue([HOTEL]);
  journalEntryFindManyMock.mockResolvedValue(opts.journal ?? []);
  attachmentFindManyMock.mockImplementation(async ({ where }: { where: Where }) =>
    where.targetType === "JOURNAL" ? (opts.photos ?? []) : [],
  );
  costFindManyMock.mockResolvedValue([]);
  dayTitleFindManyMock.mockResolvedValue([]);
  chapterFindManyMock.mockResolvedValue([
    { id: "c-europe", name: "Europe", colour: "sky", startDate: "2026-12-06", endDate: "2027-01-06", sortOrder: 0 },
  ]);
}

async function loadDay(date: string) {
  const out = await getDay(TRIP_ID, date, VIEWER);
  if (typeof out === "string") throw new Error(`expected DayViewData, got ${out}`);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe("getDay", () => {
  it("returns 'invalid' for a malformed date and 'dateless' for a trip without dates", async () => {
    expect(await getDay(TRIP_ID, "12-12-2026", VIEWER)).toBe("invalid");
    expect(await getDay(TRIP_ID, "2026-12-1", VIEWER)).toBe("invalid");
    tripFindUniqueMock.mockResolvedValue({ ...TRIP, startDate: null, endDate: null });
    expect(await getDay(TRIP_ID, "2026-12-12", VIEWER)).toBe("dateless");
  });

  it("clamps a date inside the 2-day buffer to the trip range and returns 'out-of-range' beyond it", async () => {
    expect((await loadDay("2026-12-02")).date).toBe("2026-12-04");
    expect((await loadDay("2027-01-10")).date).toBe("2027-01-08");
    expect(await getDay(TRIP_ID, "2026-12-01", VIEWER)).toBe("out-of-range");
    expect(await getDay(TRIP_ID, "2027-01-11", VIEWER)).toBe("out-of-range");
  });

  it("Strasbourg 2026-12-12: heading, eyebrow with the chapter, sub line with night 3 of 4, tonight card, strip of 9 with counts from groupBy", async () => {
    const d = await loadDay("2026-12-12");
    const cet = zoneLabel("Europe/Paris", "2026-12-12");

    expect(d.date).toBe("2026-12-12");
    expect(d.heading).toBe("Sat 12 Dec");
    expect(d.dayNumber).toBe(9);
    expect(d.totalDays).toBe(36);
    expect(d.eyebrow).toBe("DAY 9 OF 36 · EUROPE");
    expect(d.subLine).toBe(`Strasbourg, France · ${cet} · night 3 of 4`);
    expect(d.subLineCompact).toBe(`Strasbourg · ${cet} · night 3 of 4`);
    expect(d.travelDay).toBe(false);
    expect(d.stop).toMatchObject({ id: STRASBOURG.id, name: "Strasbourg", country: "France", timezone: "Europe/Paris" });
    expect(d.tonight).toEqual({ id: HOTEL.id, name: "Hôtel Cour du Corbeau", nightOf: { night: 3, of: 4 }, checkOut: "2026-12-14" });
    expect(d.weatherInput).toEqual({ lat: STRASBOURG.lat, lng: STRASBOURG.lng, timezone: "Europe/Paris" });

    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: TRIP_ID, forkId: null } }),
    );

    expect(d.strip.dates).toHaveLength(9);
    expect(d.strip.dates[0].iso).toBe("2026-12-08");
    expect(d.strip.dates[8].iso).toBe("2026-12-16");
    expect(d.strip.dates.find((s) => s.iso === "2026-12-11")?.count).toBe(3);
    expect(d.strip.dates.find((s) => s.iso === "2026-12-12")).toEqual({ iso: "2026-12-12", count: 0, isCurrent: true, isToday: false });
    expect(d.strip.dates.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(itemGroupByMock).toHaveBeenCalledWith({
      by: ["date"],
      where: { tripId: TRIP_ID, forkId: null, date: { in: d.strip.dates.map((s) => s.iso) } },
      _count: { _all: true },
    });
    expect(d.strip.segments.map((s) => s.name)).toEqual(["Paris", "Strasbourg", "Colmar"]);

    expect(d.isFirst).toBe(false);
    expect(d.isLast).toBe(false);
    expect(d.prevDate).toBe("2026-12-11");
    expect(d.nextDate).toBe("2026-12-13");
  });

  it("uses the Stop's country in the eyebrow when chapters are off, and marks the first/last day", async () => {
    tripFindUniqueMock.mockResolvedValue({ ...TRIP, chaptersEnabled: false });
    const d = await loadDay("2026-12-12");
    expect(chapterFindManyMock).not.toHaveBeenCalled();
    expect(d.eyebrow).toBe("DAY 9 OF 36 · FRANCE");

    const first = await loadDay("2026-12-04");
    expect(first.isFirst).toBe(true);
    expect(first.prevDate).toBeNull();
    const last = await loadDay("2027-01-08");
    expect(last.isLast).toBe(true);
    expect(last.nextDate).toBeNull();
    expect(last.heading).toBe("Fri 8 Jan 2027");
  });

  it("a travel day (transport departing that date) sets travelDay and the → sub line", async () => {
    setup({ transports: [TRAIN] });
    const d = await loadDay("2026-12-13");
    const cet = zoneLabel("Europe/Paris", "2026-12-13");
    expect(d.travelDay).toBe(true);
    expect(d.eyebrow).toBe("DAY 10 OF 36 · TRAVEL DAY");
    expect(d.subLine).toBe(`Strasbourg → Colmar · ${cet}`);
    expect(d.subLineCompact).toBe(`Strasbourg → Colmar · ${cet}`);
    // A changeover day belongs to the arriving Stop.
    expect(d.stop?.id).toBe(COLMAR.id);
    expect(d.hasEntries).toBe(true);
    expect(d.planCount).toBe(1);
  });

  it("a leg home (no toStop) names the trip's home and shows no zone arrow", async () => {
    const home = { ...TRAIN, id: "tr-home", toStopId: null, arrIsHome: true, depAt: new Date("2026-12-12T09:00:00Z"), arrAt: new Date("2026-12-13T09:00:00Z") };
    setup({ transports: [home] });
    const d = await loadDay("2026-12-12");
    const cet = zoneLabel("Europe/Paris", "2026-12-12");
    expect(d.travelDay).toBe(true);
    expect(d.subLine).toBe(`Strasbourg → ${TRIP.homeName} · ${cet}`);
    expect(d.subLine).not.toContain("UTC");
  });

  it("a Stop without a timezone shows no zone in the sub line but keeps UTC for weather", async () => {
    stopFindManyMock.mockResolvedValue([PARIS, { ...STRASBOURG, timezone: null }, COLMAR]);
    const d = await loadDay("2026-12-12");
    expect(d.subLine).toBe("Strasbourg, France · night 3 of 4");
    expect(d.stop?.timezone).toBe("UTC");
    expect(d.weatherInput?.timezone).toBe("UTC");
  });

  it("Day ideas in every phase: planning-phase free-form day fetches things to do and returns three rows (ADR 0044 amendment)", async () => {
    const d = await loadDay("2026-12-12");
    expect(d.phase).toBe("planning");
    expect(d.freeForm).toBe(true);
    expect(itemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: TRIP_ID, forkId: null, stopId: STRASBOURG.id, date: null }),
      }),
    );
    expect(d.ideas.rows.map((r) => r.id)).toEqual(["t-cathedral", "t-market", "w-petite"]);
    expect(d.ideas.more).toBe(1);
    expect(d.ideas.eyebrow).toBe("IDEAS FOR STRASBOURG");
  });

  it("a gap day (no stop) has stop null, weatherInput null, ideas empty (review focus 2)", async () => {
    const d = await loadDay("2026-12-20");
    expect(d.stop).toBeNull();
    expect(d.weatherInput).toBeNull();
    expect(d.ideas).toEqual({ rows: [], more: 0, eyebrow: null });
    expect(d.tonight).toBeNull();
    expect(d.subLine).toBe("");
    expect(d.eyebrow).toBe("DAY 17 OF 36 · EUROPE");
  });

  it("journal is closed on a future date and open on the day", async () => {
    const coEntry = {
      id: "j-sam",
      body: "Mulled wine by the cathedral.",
      authorId: CO,
      updatedAt: new Date("2026-12-12T20:00:00Z"),
      hiddenFromShares: false,
      author: traveller(CO, "Sam"),
    };
    const myEntry = { id: "j-cam", body: "Snow!", authorId: VIEWER, updatedAt: new Date("2026-12-12T21:00:00Z"), hiddenFromShares: true, author: traveller(VIEWER, "Cam") };
    const coPhoto = { id: "p-sam", filename: "a.jpg", mime: "image/jpeg", size: 1, url: "/a.jpg", uploadedById: CO, createdAt: new Date("2026-12-12T19:00:00Z"), uploadedBy: traveller(CO, "Sam") };

    setup({ today: "2026-09-27", journal: [coEntry, myEntry], photos: [coPhoto] });
    const future = await loadDay("2026-12-12");
    expect(future.journal.open).toBe(false);
    expect(future.journal.mine).toBeNull();

    setup({ today: "2026-12-12", journal: [coEntry, myEntry], photos: [coPhoto] });
    const onTheDay = await loadDay("2026-12-12");
    expect(onTheDay.isToday).toBe(true);
    expect(onTheDay.phase).toBe("travelling");
    expect(onTheDay.journal.open).toBe(true);
    expect(onTheDay.journal.mine).toEqual({ body: "Snow!", updatedAt: myEntry.updatedAt, photo: null, extraPhotos: [], hiddenFromShares: true });
    expect(onTheDay.journal.others).toEqual([
      { authorId: CO, body: coEntry.body, updatedAt: coEntry.updatedAt, author: coEntry.author, photos: [coPhoto] },
    ]);
  });
});

describe("getDayWeatherView", () => {
  const base = { lat: STRASBOURG.lat, lng: STRASBOURG.lng, timezone: "Europe/Paris", placeName: "Strasbourg" };
  const snow = {
    source: "forecast" as const, highC: 1, lowC: -3, code: 73, label: "Snow", precipProbMax: 60, gustsKph: 20,
    uvMax: 1, snowfallCm: 4, current: { tempC: -2, isDay: true }, fetchedAt: Date.now(), stale: false,
  };

  it("today: asks for current conditions, themes the day and carries the local time and daylight", async () => {
    getDayWeatherMock.mockResolvedValue(snow);
    const v = await getDayWeatherView({ ...base, dateISO: "2026-12-12", today: "2026-12-12" });
    expect(getDayWeatherMock).toHaveBeenCalledWith(expect.objectContaining({ dateISO: "2026-12-12", today: "2026-12-12", withCurrent: true }));
    expect(v?.theme.key).toBe("snow");
    expect(v?.day).toBe(snow);
    expect(v?.nowLocal).toMatch(/^\d{2}:\d{2}$/);
    expect(v?.forecastOpensOn).toBeNull();
    expect(v?.dateLabel).toBe("Sat 12 Dec");
    expect(v?.placeName).toBe("Strasbourg");
    expect(v?.daylight.sunrise).toMatch(/^0[78]:\d{2}$/);
    expect(v?.daylight.dayLengthMin).toBeGreaterThan(400);
  });

  it("beyond the forecast with no data: too-far with the opening date, no current request", async () => {
    getDayWeatherMock.mockResolvedValue(null);
    const v = await getDayWeatherView({ ...base, dateISO: "2026-12-12", today: "2026-09-27" });
    expect(getDayWeatherMock).toHaveBeenCalledWith(expect.objectContaining({ withCurrent: false }));
    expect(v?.theme.key).toBe("too-far");
    expect(v?.nowLocal).toBeNull();
    expect(v?.forecastOpensOn).toBe("Fri 27 Nov");
  });

  it("typical data uses the month from the date label in the chip", async () => {
    getDayWeatherMock.mockResolvedValue({ ...snow, source: "typical", code: 3, current: null });
    const v = await getDayWeatherView({ ...base, dateISO: "2026-12-12", today: "2026-09-27" });
    expect(v?.theme.chip).toBe("Typical for Dec");
  });

  it("returns null when the fetch failed inside the forecast window", async () => {
    getDayWeatherMock.mockResolvedValue(null);
    expect(await getDayWeatherView({ ...base, dateISO: "2026-12-12", today: "2026-12-10" })).toBeNull();
  });
});
