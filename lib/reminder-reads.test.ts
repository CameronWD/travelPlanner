import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";
import { REMINDER_ITEM_SELECT } from "@/lib/reminder-about";
import { reminderItem } from "@/test/helpers/reminder-item";

const {
  requireTripAccessMock, reminderFindManyMock, loadSurpriseVisibilityMock, stopFindManyMock, itemFindManyMock, transportFindManyMock,
  requireRowAccess, reminderFindFirst,
} = vi.hoisted(() => ({
  requireRowAccess: vi.fn(),
  reminderFindFirst: vi.fn(),
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "user-1" }, membership: { role: "owner" } }),
  reminderFindManyMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock, requireRowAccess }));
vi.mock("@/lib/db", () => ({
  db: {
    reminder: { findMany: reminderFindManyMock, findFirst: reminderFindFirst },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
  },
}));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  loadSurpriseVisibilityMock.mockImplementation(async () => actual.NO_SURPRISES);
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { listRemindersForTrip, readReminderAboutOptions, readReminderItem, readRemindersAbout } from "./reminder-reads";

const TRIP_ID = "trip-1";
beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// listRemindersForTrip
// ---------------------------------------------------------------------------

describe("listRemindersForTrip", () => {
  it("checks trip access before reading anything", async () => {
    reminderFindManyMock.mockResolvedValue([]);
    await listRemindersForTrip(TRIP_ID, "2026-07-01");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("returns reminders dated on or after fromDate, soonest first, capped at 20", async () => {
    reminderFindManyMock.mockResolvedValue([
      { id: "r1", title: "Print docs", date: "2026-07-02", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null, dismissedAt: null },
    ]);

    const result = await listRemindersForTrip(TRIP_ID, "2026-07-01");

    expect(reminderFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, date: { gte: "2026-07-01" }, dismissedAt: null },
      orderBy: { date: "asc" },
      take: 20,
      select: REMINDER_ITEM_SELECT,
    });
    expect(result).toEqual([reminderItem({ id: "r1", title: "Print docs", date: "2026-07-02" })]);
  });

  // Task 7: a Reminder may be about a Stop — the card renders a chip from the
  // related Stop's name.
  it("returns stopName from the related Stop when the reminder is about one", async () => {
    reminderFindManyMock.mockResolvedValue([
      {
        id: "r1",
        title: "Reconfirm the tour",
        date: "2026-07-02",
        notes: null,
        stopId: "s1",
        stop: { name: "Denpasar" },
        itemId: null,
        item: null,
        transportId: null,
        transport: null,
      },
    ]);

    const result = await listRemindersForTrip(TRIP_ID, "2026-07-01");

    expect(result).toEqual([
      reminderItem({ id: "r1", title: "Reconfirm the tour", date: "2026-07-02", stopId: "s1", stopName: "Denpasar" }),
    ]);
  });

  it("returns notes and what the Reminder is about — an Item or a leg — by name (F8)", async () => {
    reminderFindManyMock.mockResolvedValue([
      { id: "r2", title: "Book table", date: "2026-07-03", notes: "window seat", stopId: null, stop: null, itemId: "i1", item: { title: "Bouchon" }, transportId: null, transport: null, dismissedAt: null },
      { id: "r3", title: "Seats", date: "2026-07-04", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: "t1",
        transport: { mode: "TRAIN", depPlace: "Paris", arrPlace: "Lyon", depIsHome: false, arrIsHome: false, fromStop: null, toStop: null, trip: { homeName: null } } },
    ]);
    const result = await listRemindersForTrip(TRIP_ID, "2026-07-01");
    expect(result).toEqual([
      reminderItem({ id: "r2", title: "Book table", date: "2026-07-03", notes: "window seat", itemId: "i1", itemTitle: "Bouchon" }),
      reminderItem({ id: "r3", title: "Seats", date: "2026-07-04", transportId: "t1", transportLabel: "Train Paris → Lyon" }),
    ]);
  });

  it("a Reminder about a Stop hidden from the viewer stays in the database (ADR 0051)", async () => {
    loadSurpriseVisibilityMock.mockResolvedValueOnce(hiddenVisibility({ viewerId: "user-1", hiddenStopIds: ["s1"] }));
    reminderFindManyMock.mockResolvedValue([]);
    await listRemindersForTrip(TRIP_ID, "2026-07-01");
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith(TRIP_ID, "user-1");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, loadSurpriseVisibilityMock);
    expect(reminderFindManyMock.mock.calls[0][0].where).toEqual({
      tripId: TRIP_ID,
      date: { gte: "2026-07-01" },
      dismissedAt: null,
      ...MARKER_WHERE.reminder,
    });
  });
});

describe("listRemindersForTrip includeDismissed", () => {
  it("drops the dismissed filter, and the rows say dismissed", async () => {
    reminderFindManyMock.mockResolvedValue([
      { id: "d", title: "d", date: "2026-07-02", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null, dismissedAt: new Date("2026-06-30") },
    ]);
    const out = await listRemindersForTrip(TRIP_ID, "2026-07-01", { includeDismissed: true });
    expect(reminderFindManyMock.mock.calls[0][0].where).not.toHaveProperty("dismissedAt");
    expect(out.map((r) => r.dismissed)).toEqual([true]);
  });
});

describe("listRemindersForTrip includePast", () => {
  const raw = (id: string, date: string) => ({ id, title: id, date, notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null, dismissedAt: null });

  it("adds the 20 most recent earlier Reminders, newest first, flagged past, behind the same Surprise filter", async () => {
    loadSurpriseVisibilityMock.mockResolvedValueOnce(hiddenVisibility({ viewerId: "user-1", hiddenStopIds: ["s1"] }));
    reminderFindManyMock.mockResolvedValueOnce([raw("up", "2026-07-02")]).mockResolvedValueOnce([raw("p2", "2026-06-30"), raw("p1", "2026-06-01")]);

    const result = await listRemindersForTrip(TRIP_ID, "2026-07-01", { includePast: true });

    expect(reminderFindManyMock.mock.calls[1][0]).toEqual({
      where: { tripId: TRIP_ID, date: { lt: "2026-07-01" }, dismissedAt: null, ...MARKER_WHERE.reminder },
      orderBy: { date: "desc" },
      take: 20,
      select: REMINDER_ITEM_SELECT,
    });
    expect(result.map((r) => [r.id, r.past])).toEqual([["up", undefined], ["p2", true], ["p1", true]]);
  });

  it("reads no earlier ones unless asked", async () => {
    reminderFindManyMock.mockResolvedValue([]);
    await listRemindersForTrip(TRIP_ID, "2026-07-01");
    expect(reminderFindManyMock).toHaveBeenCalledTimes(1);
  });
});

describe("readRemindersAbout", () => {
  it("flags a Reminder dated before `today` as past", async () => {
    const row = (id: string, date: string) => ({ id, title: id, date, notes: null, stopId: "s1", stop: { name: "Lyon" }, itemId: null, item: null, transportId: null, transport: null, dismissedAt: null });
    reminderFindManyMock.mockResolvedValue([row("old", "2026-06-01"), row("new", "2026-08-01")]);
    const out = await readRemindersAbout(TRIP_ID, hiddenVisibility({}), "2026-07-01");
    expect(out.byStopId.get("s1")?.map((r) => r.past)).toEqual([true, undefined]);
  });

  it("keeps a dismissed Reminder on the thing it is about, flagged dismissed", async () => {
    reminderFindManyMock.mockResolvedValue([
      { id: "d", title: "d", date: "2026-07-01", notes: null, stopId: "s1", stop: { name: "Lyon" }, itemId: null, item: null, transportId: null, transport: null, dismissedAt: new Date("2026-06-30") },
    ]);
    const out = await readRemindersAbout(TRIP_ID, hiddenVisibility({}));
    expect(out.byStopId.get("s1")?.map((r) => r.dismissed)).toEqual([true]);
  });

  it("reads every Reminder about a thing, whatever its date, behind the viewer's Surprise filter, grouped by the thing", async () => {
    const row = (id: string, o: object) => ({ id, title: id, date: "2026-07-01", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null, dismissedAt: null, ...o });
    reminderFindManyMock.mockResolvedValue([
      row("a", { stopId: "s1", stop: { name: "Lyon" } }),
      row("b", { itemId: "i1", item: { title: "Bouchon" } }),
      row("c", { stopId: "s1", stop: { name: "Lyon" } }),
    ]);
    const v = hiddenVisibility({});
    const out = await readRemindersAbout(TRIP_ID, v);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expect(reminderFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, OR: [{ stopId: { not: null } }, { itemId: { not: null } }, { transportId: { not: null } }], ...MARKER_WHERE.reminder },
      orderBy: { date: "asc" },
      select: REMINDER_ITEM_SELECT,
    });
    expect(out.byStopId.get("s1")?.map((r) => r.id)).toEqual(["a", "c"]);
    expect(out.byItemId.get("i1")?.map((r) => r.itemTitle)).toEqual(["Bouchon"]);
    expect(out.byTransportId.size).toBe(0);
  });
});

describe("readReminderAboutOptions", () => {
  it("offers the real plan's Stops, Items and legs the viewer can see, labelled", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "s1", name: "Lyon" }]);
    itemFindManyMock.mockResolvedValue([{ id: "i1", title: "Bouchon" }]);
    transportFindManyMock.mockResolvedValue([
      { id: "t1", mode: "TRAIN", depPlace: "Paris", arrPlace: "Lyon", depIsHome: false, arrIsHome: false, fromStop: null, toStop: null, trip: { homeName: null } },
    ]);
    const v = hiddenVisibility({ hiddenStopIds: ["s-secret"] });
    loadSurpriseVisibilityMock.mockResolvedValueOnce(v);

    const out = await readReminderAboutOptions(TRIP_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expect(stopFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, forkId: null, id: { notIn: ["s-secret"] } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });
    expect(itemFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, forkId: null, ...MARKER_WHERE.item },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: { id: true, title: true },
    });
    expect(transportFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: TRIP_ID, forkId: null }, orderBy: { sortOrder: "asc" } }));
    expect(out).toEqual({
      stops: [{ id: "s1", name: "Lyon" }],
      items: [{ id: "i1", title: "Bouchon" }],
      transports: [{ id: "t1", label: "Train Paris → Lyon" }],
    });
  });
});

describe("readReminderItem", () => {
  it("reads one Reminder through the Reminder guard, in get_reminders' shape (notes and about-links included)", async () => {
    requireRowAccess.mockResolvedValue({ row: { id: "r1", tripId: "trip-1" }, user: { id: "u1" } });
    reminderFindFirst.mockResolvedValue({
      id: "r1", title: "Print tickets", date: "2027-05-30", notes: "Both legs", stopId: null, stop: null, itemId: null, item: null,
      transportId: "t1",
      transport: { mode: "TRAIN", depIsHome: false, arrIsHome: false, depPlace: null, arrPlace: null, fromStop: { name: "Paris" }, toStop: { name: "Lyon" }, trip: { homeName: null } },
    });
    const r = await readReminderItem("r1");
    expect(requireRowAccess).toHaveBeenCalledWith("reminder", "r1");
    expect(reminderFindFirst.mock.calls[0][0].where).toMatchObject({ id: "r1", tripId: "trip-1" });
    expect(reminderFindFirst.mock.calls[0][0].select).toBe(REMINDER_ITEM_SELECT);
    expect(r).toMatchObject({ id: "r1", title: "Print tickets", stopId: null, stopName: null, notes: "Both legs", itemId: null, transportId: "t1", transportLabel: "Train Paris → Lyon" });
  });

  it("carries the Surprise fragment, and is notFound when it filters the Reminder out", async () => {
    requireRowAccess.mockResolvedValue({ row: { id: "r1", tripId: "trip-1" }, user: { id: "u1" } });
    loadSurpriseVisibilityMock.mockResolvedValueOnce(hiddenVisibility({ hiddenStopIds: ["s-secret"] }));
    reminderFindFirst.mockResolvedValue(null);
    await expect(readReminderItem("r1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(reminderFindFirst.mock.calls[0][0].where).toMatchObject({ id: "r1", tripId: "trip-1", ...MARKER_WHERE.reminder });
  });
});
