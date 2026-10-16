import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";
import { REMINDER_ITEM_SELECT } from "@/lib/reminder-about";
import { reminderItem } from "@/test/helpers/reminder-item";

const {
  requireTripAccessMock, reminderFindManyMock, loadSurpriseVisibilityMock, stopFindManyMock, itemFindManyMock, transportFindManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "user-1" }, membership: { role: "owner" } }),
  reminderFindManyMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({
  db: {
    reminder: { findMany: reminderFindManyMock },
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

import { listRemindersForTrip, readReminderAboutOptions, readRemindersAbout } from "./reminder-reads";

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
      { id: "r1", title: "Print docs", date: "2026-07-02", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null },
    ]);

    const result = await listRemindersForTrip(TRIP_ID, "2026-07-01");

    expect(reminderFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, date: { gte: "2026-07-01" } },
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
      { id: "r2", title: "Book table", date: "2026-07-03", notes: "window seat", stopId: null, stop: null, itemId: "i1", item: { title: "Bouchon" }, transportId: null, transport: null },
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
      ...MARKER_WHERE.reminder,
    });
  });
});

describe("readRemindersAbout", () => {
  it("reads every Reminder about a thing, whatever its date, behind the viewer's Surprise filter, grouped by the thing", async () => {
    const row = (id: string, o: object) => ({ id, title: id, date: "2026-07-01", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null, ...o });
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
