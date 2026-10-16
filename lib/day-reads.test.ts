import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, loadSurpriseVisibilityMock } = vi.hoisted(() => ({
  db: {
    trip: { findUnique: vi.fn() },
    stop: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    transport: { findMany: vi.fn() },
    accommodation: { findMany: vi.fn() },
    attachment: { findMany: vi.fn() },
    chapter: { findMany: vi.fn() },
    dayTitle: { findMany: vi.fn() },
  },
  loadSurpriseVisibilityMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { readDayRows } from "@/lib/day-reads";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, placeholderItem, MARKER_WHERE, SURPRISED_VIEW } from "@/test/helpers/surprise-visibility";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

type Where = Record<string, unknown>;
const TRIP = { name: "Paris week", startDate: "2026-12-04", endDate: "2026-12-10", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: null, chaptersEnabled: true, roundTrip: true };
const PARIS = { id: "s-paris", name: "Paris", country: "France", countryCode: "FR", timezone: "Europe/Paris", arriveDate: "2026-12-04", departDate: "2026-12-10", sortOrder: 0, lat: 48.8566, lng: 2.3522 };
const LOUVRE = {
  id: "i-louvre", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-05", startTime: "10:00", endTime: null, sortOrder: 0,
  stopId: PARIS.id, lat: null, lng: null, address: null, link: null, booking: null, notes: "Book ahead", hiddenFromShares: false, photoAttachmentId: null,
};
const none = async () => null;
const whereOf = (m: { mock: { calls: unknown[][] } }) => m.mock.calls.map(([a]) => (a as { where: Where }).where);

beforeEach(() => {
  vi.clearAllMocks();
  db.trip.findUnique.mockResolvedValue(TRIP);
  db.stop.findMany.mockResolvedValue([PARIS]);
  for (const m of [db.item.findMany, db.transport.findMany, db.accommodation.findMany, db.attachment.findMany, db.chapter.findMany, db.dayTitle.findMany]) m.mockResolvedValue([]);
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
});

describe("readDayRows (card 3.M)", () => {
  it("a missing Trip, and a Trip with no start, read nothing more", async () => {
    db.trip.findUnique.mockResolvedValueOnce(null);
    expect(await readDayRows("trip-1", "u-1", none)).toBe("missing");
    db.trip.findUnique.mockResolvedValueOnce({ ...TRIP, startDate: null, endDate: null });
    expect(await readDayRows("trip-1", "u-1", none)).toBe("dateless");
    expect(loadSurpriseVisibilityMock).not.toHaveBeenCalled();
    expect(db.stop.findMany).not.toHaveBeenCalled();
  });

  it("a Trip with a start and no end runs to its start", async () => {
    db.trip.findUnique.mockResolvedValueOnce({ ...TRIP, endDate: null });
    const read = await readDayRows("trip-1", "u-1", none);
    if (typeof read === "string") throw new Error(read);
    expect([read.rows.startDate, read.rows.endDate, read.rows.trip.endDate]).toEqual(["2026-12-04", "2026-12-04", null]);
  });

  it("selects Day titles and things to do by the Trip, not by a list of Stop ids", async () => {
    await readDayRows("trip-1", "u-1", none);
    expect(db.dayTitle.findMany).toHaveBeenCalledWith({
      where: { stop: { tripId: "trip-1", forkId: null } },
      select: { stopId: true, dayIndex: true, title: true },
    });
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", forkId: null, stopId: { not: null }, date: null } }),
    );
  });

  it("skips the Chapters read when Chapters are off", async () => {
    db.trip.findUnique.mockResolvedValueOnce({ ...TRIP, chaptersEnabled: false });
    const read = await readDayRows("trip-1", "u-1", none);
    expect(db.chapter.findMany).not.toHaveBeenCalled();
    expect(typeof read !== "string" && read.rows.chapters).toEqual([]);
  });

  it("asks the visibility loader for this viewer first, and spreads its fragments into every Item, Accommodation, Attachment and Day title read", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ viewerId: "u-1" }));
    await readDayRows("trip-1", "u-1", none);
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("trip-1", "u-1");
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, db.stop.findMany);
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, db.item.findMany);
    expect(whereOf(db.item.findMany)).toHaveLength(3); // dated, Wishlist ideas, things to do — in that order
    for (const w of whereOf(db.item.findMany)) expect(w).toMatchObject({ tripId: "trip-1", forkId: null, ...MARKER_WHERE.item });
    expect(whereOf(db.accommodation.findMany)[0]).toMatchObject({ forkId: null, ...MARKER_WHERE.accommodation });
    expect(whereOf(db.attachment.findMany)[0]).toEqual({ tripId: "trip-1", ...MARKER_WHERE.attachment });
    expect(whereOf(db.dayTitle.findMany)[0]).toMatchObject(MARKER_WHERE.dayTitle);
    expect(JSON.stringify(db.stop.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
    expect(JSON.stringify(db.transport.findMany.mock.calls[0][0])).not.toContain("surpriseMarker");
  });

  it("runs the caller's reads in the same wave, handing them the Trip, its range and the viewer's fragments", async () => {
    let release!: (v: unknown[]) => void;
    db.stop.findMany.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const seen: unknown[] = [];
    const pending = readDayRows("trip-1", "u-1", async (ctx) => {
      seen.push({ tripId: ctx.tripId, start: ctx.startDate, end: ctx.endDate, where: ctx.visibility.where });
      return (await ctx.stopRows).length;
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(db.dayTitle.findMany).toHaveBeenCalled();
    expect(db.item.findMany).toHaveBeenCalledTimes(3);
    release([PARIS]);
    const read = await pending;
    if (typeof read === "string") throw new Error(read);
    expect(read.alongside).toBe(1);
    expect(seen[0]).toEqual({ tripId: "trip-1", start: "2026-12-04", end: "2026-12-10", where: NO_SURPRISES.where });
  });

  it("Surprise: a hidden Stop keeps its shell with its view; a hidden dated real-plan Item becomes a placeholder; a Fork's or an undated one does not", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        viewerId: "u-1",
        hiddenStopIds: [PARIS.id],
        placeholders: [
          placeholderItem({ id: "i-dinner", stopId: PARIS.id, date: "2026-12-06", startTime: "19:30" }),
          placeholderItem({ id: "i-fork", stopId: PARIS.id, date: "2026-12-06", forkId: "fork-1" }),
          placeholderItem({ id: "i-todo", stopId: PARIS.id, date: null }),
        ],
      }),
    );
    db.item.findMany.mockImplementation(async ({ where }: { where: Where }) => (where.date !== null ? [LOUVRE] : []));
    const read = await readDayRows("trip-1", "u-1", none);
    if (typeof read === "string") throw new Error(read);
    expect(read.rows.stops[0]).toMatchObject({ id: PARIS.id, name: "Paris", surprise: SURPRISED_VIEW });
    expect(read.rows.items.map((i) => i.id)).toEqual(["i-louvre", "i-dinner"]);
    expect(read.rows.items[0].surprise).toBeNull();
    expect(read.rows.items[1]).toMatchObject({ title: "Surprise", category: "OTHER", date: "2026-12-06", startTime: "19:30", notes: null, surprise: SURPRISED_VIEW });
    expect(read.visibility.hiddenStopIds).toEqual([PARIS.id]);
  });
});
