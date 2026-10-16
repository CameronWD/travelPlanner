import { describe, it, expect, vi, beforeEach } from "vitest";

// getDays() runs the Day view's reads (lib/day-reads.ts + its own Costs and
// Journal window) against per-model db mocks (mirrors
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
  loadSurpriseVisibilityMock,
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
  loadSurpriseVisibilityMock: vi.fn(),
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

vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { getDays, getDayWeatherView } from "@/lib/day-view-loader";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, placeholderItem, MARKER_WHERE, SURPRISED_VIEW } from "@/test/helpers/surprise-visibility";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
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
  { id: "t-cathedral", title: "Cathédrale Notre-Dame", category: "SIGHTSEEING", startTime: null, stopId: STRASBOURG.id },
  { id: "t-market", title: "Christkindelsmärik", category: "SHOPPING", startTime: "17:00", stopId: STRASBOURG.id },
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
    if (where.date === null && typeof where.stopId === "object" && where.stopId !== null) return opts.thingsToDo ?? THINGS_TO_DO;
    return DATED_ITEMS;
  });
  transportFindManyMock.mockResolvedValue(opts.transports ?? []);
  accommodationFindManyMock.mockResolvedValue([HOTEL]);
  journalEntryFindManyMock.mockResolvedValue(opts.journal ?? []);
  attachmentFindManyMock.mockImplementation(async ({ where }: { where: Where }) =>
    where.targetType === "JOURNAL" ? (opts.photos ?? []) : [],
  );
  costFindManyMock.mockResolvedValue([]);
  dayTitleFindManyMock.mockResolvedValue([]);
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
  chapterFindManyMock.mockResolvedValue([
    { id: "c-europe", name: "Europe", colour: "sky", startDate: "2026-12-06", endDate: "2027-01-06", sortOrder: 0 },
  ]);
}

async function one(date: string) {
  return (await getDays(TRIP_ID, [date], VIEWER))[0];
}
async function loadDay(date: string) {
  const out = await one(date);
  if (typeof out === "string") throw new Error(`expected DayViewData, got ${out}`);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe("getDays — one day", () => {
  it("returns 'invalid' for a malformed date and 'dateless' for a trip without dates", async () => {
    expect(await one("12-12-2026")).toBe("invalid");
    expect(await one("2026-12-1")).toBe("invalid");
    tripFindUniqueMock.mockResolvedValue({ ...TRIP, startDate: null, endDate: null });
    expect(await one("2026-12-12")).toBe("dateless");
  });

  it("clamps a date inside the 2-day buffer to the trip range and returns 'out-of-range' beyond it", async () => {
    expect((await loadDay("2026-12-02")).date).toBe("2026-12-04");
    expect((await loadDay("2027-01-10")).date).toBe("2027-01-08");
    expect(await one("2026-12-01")).toBe("out-of-range");
    expect(await one("2027-01-11")).toBe("out-of-range");
  });

  it("Strasbourg 2026-12-12: heading, eyebrow with the chapter, sub line with night 3 of 4, tonight card, strip of every day with counts from the dated Items", async () => {
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
    expect(d.tonight).toEqual({
      id: HOTEL.id,
      name: "Hôtel Cour du Corbeau",
      nightOf: { night: 3, of: 4 },
      checkOut: "2026-12-14",
      address: "6 Rue des Couples, Strasbourg",
      confirmation: null,
      checkInTime: null,
      checkOutTime: null,
      notes: null,
      lat: 48.5795,
      lng: 7.7498,
    });
    expect(d.weatherInput).toEqual({ lat: STRASBOURG.lat, lng: STRASBOURG.lng, timezone: "Europe/Paris" });

    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: TRIP_ID, forkId: null } }),
    );

    expect(d.strip.dates).toHaveLength(36);
    expect(d.strip.dates[0].iso).toBe("2026-12-04");
    expect(d.strip.dates[35].iso).toBe("2027-01-08");
    expect(d.strip.dates.find((s) => s.iso === "2026-12-11")?.count).toBe(3);
    expect(d.strip.dates.find((s) => s.iso === "2026-12-12")).toEqual({ iso: "2026-12-12", count: 0, isCurrent: true, isToday: false });
    expect(d.strip.dates.filter((s) => s.isCurrent)).toHaveLength(1);
    // The dot counts come from the dated Items already read (card 3.M) — no second grouped query.
    expect(itemGroupByMock).not.toHaveBeenCalled();
    expect(d.strip.line.homeStart).toBe("Brisbane");
    expect(d.strip.line.homeEnd).toBe("Brisbane"); // TRIP has no roundTrip field → defaults to a round trip
    expect(d.strip.line.segments.map((s) => (s.kind === "stop" ? s.name : "gap"))).toEqual(["gap", "Paris", "Strasbourg", "Colmar", "gap"]);

    expect(d.isFirst).toBe(false);
    expect(d.isLast).toBe(false);
    expect(d.prevDate).toBe("2026-12-11");
    expect(d.nextDate).toBe("2026-12-13");
  });

  it("strip dots count Transport legs and check-ins/outs as well as Items (what the plan card counts)", async () => {
    setup({ transports: [TRAIN] });
    const d = await loadDay("2026-12-12");
    if (typeof d === "string") throw new Error(d);
    const count = (iso: string) => d.strip.dates.find((s) => s.iso === iso)?.count;
    expect(count("2026-12-10")).toBe(1); // check-in
    expect(count("2026-12-11")).toBe(3); // grouped Items
    expect(count("2026-12-13")).toBe(1); // the train
    expect(count("2026-12-14")).toBe(1); // check-out
    expect(count("2026-12-12")).toBe(0);
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
        where: expect.objectContaining({ tripId: TRIP_ID, forkId: null, stopId: { not: null }, date: null }),
      }),
    );
    expect(d.ideas.rows.map((r) => r.id)).toEqual(["t-cathedral", "t-market", "w-petite"]);
    expect(d.ideas.more).toBe(1);
    expect(d.ideas.eyebrow).toBe("IDEAS FOR STRASBOURG");
  });

  it("a planned day (Items on it) shows no Day ideas, though its Stop has things to do and Wishlist ideas", async () => {
    const d = await loadDay("2026-12-11");
    expect(d.freeForm).toBe(false);
    expect(d.stop?.id).toBe(STRASBOURG.id);
    expect(d.ideas).toEqual({ rows: [], all: [], more: 0, eyebrow: null });
  });

  it("a gap day (no stop) has stop null, weatherInput null, ideas empty (review focus 2)", async () => {
    const d = await loadDay("2026-12-20");
    expect(d.stop).toBeNull();
    expect(d.weatherInput).toBeNull();
    expect(d.ideas).toEqual({ rows: [], all: [], more: 0, eyebrow: null });
    expect(d.tonight).toBeNull();
    expect(d.subLine).toBe("");
    expect(d.eyebrow).toBe("DAY 17 OF 36 · EUROPE");
  });

  it("journal is closed on a future date and open on the day", async () => {
    const coEntry = {
      id: "j-sam",
      body: "Mulled wine by the cathedral.",
      date: "2026-12-12",
      authorId: CO,
      updatedAt: new Date("2026-12-12T20:00:00Z"),
      hiddenFromShares: false,
      author: traveller(CO, "Sam"),
    };
    const myEntry = { id: "j-cam", body: "Snow!", date: "2026-12-12", authorId: VIEWER, updatedAt: new Date("2026-12-12T21:00:00Z"), hiddenFromShares: true, author: traveller(VIEWER, "Cam") };
    const coPhoto = { id: "p-sam", filename: "a.jpg", mime: "image/jpeg", size: 1, url: "/a.jpg", uploadedById: CO, createdAt: new Date("2026-12-12T19:00:00Z"), targetId: "2026-12-12", uploadedBy: traveller(CO, "Sam") };

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

  it("dayTitleStopId: the title's owner when one exists, else the day's Stop — the arriving one on a changeover day (spec 2026-09-28 D4)", async () => {
    // 2026-12-10 is Paris's depart date and Strasbourg's arrive date.
    expect((await loadDay("2026-12-10")).dayTitleStopId).toBe(STRASBOURG.id);
    // A title owned by Paris on that date reports Paris.
    dayTitleFindManyMock.mockResolvedValue([{ stopId: PARIS.id, dayIndex: 4, title: "Onward" }]);
    const titled = await loadDay("2026-12-10");
    expect(titled.dayTitle).toBe("Onward");
    expect(titled.dayTitleStopId).toBe(PARIS.id);
  });

  it("strip dots count a stay's check-in and check-out on their own days, whatever day is shown (TB-10)", async () => {
    const d = await loadDay("2026-12-04"); // the Hôtel's stay (12-10 → 12-14) does not touch this day
    const count = (iso: string) => d.strip.dates.find((s) => s.iso === iso)?.count;
    expect(count("2026-12-10")).toBe(1);
    expect(count("2026-12-14")).toBe(1);
  });
});

describe("getDays — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  function surprised() {
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        viewerId: VIEWER,
        hiddenStopIds: [STRASBOURG.id],
        placeholders: [
          placeholderItem({ id: "i-dinner", stopId: COLMAR.id, date: "2026-12-14", startTime: "19:30" }),
          placeholderItem({ id: "i-fork", stopId: COLMAR.id, date: "2026-12-14", forkId: "fork-1" }),
        ],
      }),
    );
  }
  const whereOf = (m: { mock: { calls: unknown[][] } }) => m.mock.calls.map(([a]) => (a as { where: Record<string, unknown> }).where);

  it("asks the visibility loader for this viewer before any query it filters", async () => {
    surprised();
    await loadDay("2026-12-14");
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith(TRIP_ID, VIEWER);
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, itemFindManyMock);
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, stopFindManyMock);
  });

  it("spreads the fragments into every Item read, Accommodations, Attachments, Costs and Day titles", async () => {
    surprised();
    await loadDay("2026-12-14");
    expect(whereOf(itemFindManyMock)).toHaveLength(3);
    for (const w of whereOf(itemFindManyMock)) expect(w).toMatchObject(MARKER_WHERE.item);
    expect(itemGroupByMock).not.toHaveBeenCalled();
    expect(whereOf(accommodationFindManyMock)[0]).toMatchObject(MARKER_WHERE.accommodation);
    const tripWideAttachments = whereOf(attachmentFindManyMock).filter((w) => w.targetType !== "JOURNAL");
    expect(tripWideAttachments[0]).toMatchObject(MARKER_WHERE.attachment);
    expect(whereOf(costFindManyMock)[0]).toMatchObject(MARKER_WHERE.cost);
    expect(whereOf(dayTitleFindManyMock)[0]).toMatchObject(MARKER_WHERE.dayTitle);
  });

  it("a real-plan placeholder shows on its day titled Surprise, counts in the strip, and real Items carry their badge", async () => {
    surprised();
    const d = await loadDay("2026-12-14");
    const items = [...d.plan.timedItems, ...d.plan.untimedItems].map((e) => e.item);
    expect(items.map((i) => i.id)).toEqual(["i-dinner"]); // the Fork's placeholder stays in its Fork
    expect(items[0]).toMatchObject({ title: "Surprise", category: "OTHER", startTime: "19:30", surprise: SURPRISED_VIEW });
    expect(d.strip.dates.find((s) => s.iso === "2026-12-14")?.count).toBe(2); // the placeholder + the check-out

    const day11 = await loadDay("2026-12-11");
    expect([...day11.plan.timedItems, ...day11.plan.untimedItems].map((e) => e.item.surprise)).toEqual([null, null, null]);
  });
});

describe("getDays — the carousel window in one read (NAV-05)", () => {
  const dateOf = (d: Awaited<ReturnType<typeof one>>) => (typeof d === "string" ? d : d.date);

  it("reads every query once for three dates, the Journal with one `in` list", async () => {
    const days = await getDays(TRIP_ID, ["2026-12-12", "2026-12-11", "2026-12-13"], VIEWER);
    expect(days.map(dateOf)).toEqual(["2026-12-12", "2026-12-11", "2026-12-13"]);
    for (const m of [tripFindUniqueMock, loadSurpriseVisibilityMock, stopFindManyMock, transportFindManyMock, accommodationFindManyMock, costFindManyMock, chapterFindManyMock, dayTitleFindManyMock, journalEntryFindManyMock])
      expect(m).toHaveBeenCalledTimes(1);
    expect(itemFindManyMock).toHaveBeenCalledTimes(3); // dated, Wishlist ideas, things to do
    expect(itemGroupByMock).not.toHaveBeenCalled();
    expect(journalEntryFindManyMock.mock.calls[0][0].where).toEqual({ tripId: TRIP_ID, date: { in: ["2026-12-12", "2026-12-11", "2026-12-13"] } });
    const photoReads = attachmentFindManyMock.mock.calls.map(([a]) => (a as { where: Where }).where).filter((w) => w.targetType === "JOURNAL");
    expect(photoReads).toEqual([{ tripId: TRIP_ID, targetType: "JOURNAL", targetId: { in: ["2026-12-12", "2026-12-11", "2026-12-13"] } }]);
  });

  it("answers each date on its own: malformed, beyond the buffer, clamped; clamped twins read one Journal date", async () => {
    const days = await getDays(TRIP_ID, ["nope", "2026-12-01", "2026-12-02", "2026-12-04"], VIEWER);
    expect(days.map(dateOf)).toEqual(["invalid", "out-of-range", "2026-12-04", "2026-12-04"]);
    expect(journalEntryFindManyMock.mock.calls[0][0].where.date).toEqual({ in: ["2026-12-04"] });
  });

  it("reads nothing when no date is well-formed", async () => {
    expect(await getDays(TRIP_ID, ["nope", "2026-12-1"], VIEWER)).toEqual(["invalid", "invalid"]);
    expect(tripFindUniqueMock).not.toHaveBeenCalled();
  });

  it("a missing Trip is invalid; a Trip with no end, or no dates, is dateless", async () => {
    tripFindUniqueMock.mockResolvedValueOnce(null);
    expect(await getDays(TRIP_ID, ["2026-12-12"], VIEWER)).toEqual(["invalid"]);
    tripFindUniqueMock.mockResolvedValueOnce({ ...TRIP, endDate: null });
    expect(await getDays(TRIP_ID, ["2026-12-12", "x"], VIEWER)).toEqual(["dateless", "invalid"]);
    tripFindUniqueMock.mockResolvedValueOnce({ ...TRIP, startDate: null, endDate: null });
    expect(await getDays(TRIP_ID, ["2026-12-12"], VIEWER)).toEqual(["dateless"]);
  });

  it("each day keeps its own Journal", async () => {
    const entry = (id: string, date: string, body: string) => ({ id, body, date, authorId: CO, updatedAt: new Date(`${date}T20:00:00Z`), hiddenFromShares: false, author: traveller(CO, "Sam") });
    setup({ today: "2026-12-12", journal: [entry("j-11", "2026-12-11", "Petite France"), entry("j-12", "2026-12-12", "Snow!")] });
    const [d11, d12, d13] = await getDays(TRIP_ID, ["2026-12-11", "2026-12-12", "2026-12-13"], VIEWER);
    if (typeof d11 === "string" || typeof d12 === "string" || typeof d13 === "string") throw new Error("expected three days");
    expect(d11.journal.others.map((o) => o.body)).toEqual(["Petite France"]);
    expect(d12.journal.others.map((o) => o.body)).toEqual(["Snow!"]);
    expect(d13.journal.others).toEqual([]);
  });

  it("Surprise holds on every day of the window: the placeholder on its own day only, counted on every strip", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        viewerId: VIEWER,
        hiddenStopIds: [STRASBOURG.id],
        placeholders: [placeholderItem({ id: "i-dinner", stopId: COLMAR.id, date: "2026-12-14", startTime: "19:30" })],
      }),
    );
    const days = await getDays(TRIP_ID, ["2026-12-13", "2026-12-14", "2026-12-15"], VIEWER);
    const ids = days.map((d) => (typeof d === "string" ? d : [...d.plan.timedItems, ...d.plan.untimedItems].map((e) => e.item.id)));
    expect(ids).toEqual([[], ["i-dinner"], []]);
    const d14 = days[1];
    if (typeof d14 === "string") throw new Error(d14);
    expect(d14.plan.timedItems[0].item).toMatchObject({ title: "Surprise", surprise: SURPRISED_VIEW });
    expect(d14.editor.items["i-dinner"]).toMatchObject({ title: "Surprise", notes: null });
    for (const d of days) if (typeof d !== "string") expect(d.strip.dates.find((s) => s.iso === "2026-12-14")?.count).toBe(2); // placeholder + check-out
    // A day outside the window still counts the dated Items (three on 12-11).
    for (const d of days) if (typeof d !== "string") expect(d.strip.dates.find((s) => s.iso === "2026-12-11")?.count).toBe(3);
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
