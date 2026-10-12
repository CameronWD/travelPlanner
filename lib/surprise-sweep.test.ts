import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Surprise (CONTEXT.md): the automatic reveal (the day after it is over, in
 * its Stop's zone) and the reveal when the planner leaves the Trip.
 */

const { stopFindManyMock, stopUpdateMock, itemFindManyMock, itemUpdateMock, activityCreateMock, surpriseRootForMock } = vi.hoisted(() => ({
  surpriseRootForMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  stopUpdateMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  itemUpdateMock: vi.fn(),
  activityCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock, update: stopUpdateMock },
    item: { findMany: itemFindManyMock, update: itemUpdateMock },
    activity: { create: activityCreateMock },
  },
}));

vi.mock("@/lib/surprise-guard", () => ({ surpriseRootFor: surpriseRootForMock }));

import { revealDueSurprises, revealSurprisesPlannedBy } from "./surprise-sweep";

const NOW = new Date("2026-10-12T12:00:00Z");
const LIVE_BY_CAM = { surprisePlannerId: "cam", surpriseForIds: '["alex","sam"]', surpriseRevealedAt: null };

function stop(id: string, over: Record<string, unknown> = {}) {
  return { id, tripId: "trip-1", forkId: null, name: "Paris", departDate: null, timezone: "UTC", ...LIVE_BY_CAM, ...over };
}
function item(id: string, over: Record<string, unknown> = {}) {
  return { id, tripId: "trip-1", forkId: null, title: "Dinner", date: null, stopId: "stop-1", stop: { timezone: "UTC" }, ...LIVE_BY_CAM, ...over };
}

beforeEach(() => {
  stopFindManyMock.mockResolvedValue([]);
  itemFindManyMock.mockResolvedValue([]);
  stopUpdateMock.mockResolvedValue({});
  itemUpdateMock.mockResolvedValue({});
  activityCreateMock.mockResolvedValue({});
  surpriseRootForMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("revealDueSurprises", () => {
  it("reveals a Stop whose depart date was yesterday, not one departing today", async () => {
    stopFindManyMock.mockResolvedValue([
      stop("s-over", { departDate: "2026-10-11" }),
      stop("s-today", { departDate: "2026-10-12", name: "Rome" }),
    ]);

    const result = await revealDueSurprises({ now: NOW });

    expect(result).toEqual({ revealed: 1, failed: 0 });
    expect(stopUpdateMock).toHaveBeenCalledTimes(1);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s-over" }, data: { surpriseRevealedAt: NOW } });
    expect(activityCreateMock).toHaveBeenCalledTimes(1);
    expect(activityCreateMock).toHaveBeenCalledWith({
      data: {
        tripId: "trip-1",
        actorId: "cam",
        verb: "UPDATED",
        entityType: "STOP",
        entityId: "s-over",
        entityLabel: "Paris",
        surpriseOfType: null,
        surpriseOfId: null,
        changes: { summary: "revealed the surprise in Paris" },
      },
    });
  });

  it("reveals an Item dated yesterday, not one dated today", async () => {
    itemFindManyMock.mockResolvedValue([
      item("i-over", { date: "2026-10-11" }),
      item("i-today", { date: "2026-10-12", title: "Lunch" }),
    ]);

    const result = await revealDueSurprises({ now: NOW });

    expect(result).toEqual({ revealed: 1, failed: 0 });
    expect(itemUpdateMock).toHaveBeenCalledTimes(1);
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "i-over" }, data: { surpriseRevealedAt: NOW } });
    expect(activityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "cam",
        entityType: "ITEM",
        entityId: "i-over",
        entityLabel: "Dinner",
        surpriseOfType: null,
        surpriseOfId: null,
        changes: { summary: "revealed the surprise: Dinner" },
      }),
    });
  });

  it("stamps an Item's line with its Stop while the Stop is still a Surprise, a Stop's line never", async () => {
    stopFindManyMock.mockResolvedValue([stop("s-over", { departDate: "2026-10-11" })]);
    itemFindManyMock.mockResolvedValue([item("i-over", { date: "2026-10-11", stopId: "stop-live" })]);
    surpriseRootForMock.mockResolvedValue({ type: "STOP", id: "stop-live" });

    await revealDueSurprises({ now: NOW });

    expect(surpriseRootForMock).toHaveBeenCalledWith({ stopId: "stop-live" }, NOW);
    expect(activityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityId: "s-over", surpriseOfType: null, surpriseOfId: null }),
    });
    expect(activityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityId: "i-over", surpriseOfType: "STOP", surpriseOfId: "stop-live" }),
    });
  });

  it("one failed row does not stop the rest", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stopFindManyMock.mockResolvedValue([
      stop("s-1", { departDate: "2026-10-11" }),
      stop("s-2", { departDate: "2026-10-11" }),
      stop("s-3", { departDate: "2026-10-11" }),
    ]);
    stopUpdateMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("db hiccup")).mockResolvedValueOnce({});

    const result = await revealDueSurprises({ now: NOW });

    expect(result).toEqual({ revealed: 2, failed: 1 });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s-3" }, data: { surpriseRevealedAt: NOW } });
    expect(activityCreateMock.mock.calls.map(([arg]) => arg.data.entityId)).toEqual(["s-1", "s-3"]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("reads the day in the Stop's own zone", async () => {
    // 2026-10-12T12:00Z is already the 13th in Auckland (UTC+13).
    stopFindManyMock.mockResolvedValue([stop("s-nz", { departDate: "2026-10-12", timezone: "Pacific/Auckland" })]);
    const result = await revealDueSurprises({ now: NOW });
    expect(result).toEqual({ revealed: 1, failed: 0 });
  });

  it("reads a Stopless Item's day in UTC-12, so it reveals late, never early", async () => {
    itemFindManyMock.mockResolvedValue([item("i-loose", { date: "2026-10-11", stopId: null, stop: null })]);
    // 05:00Z on the 12th: already the day after in UTC, still the 11th in UTC-12.
    expect(await revealDueSurprises({ now: new Date("2026-10-12T05:00:00Z") })).toEqual({ revealed: 0, failed: 0 });
    expect(itemUpdateMock).not.toHaveBeenCalled();
    // 12:00Z on the 12th: the 11th is over everywhere.
    expect(await revealDueSurprises({ now: NOW })).toEqual({ revealed: 1, failed: 0 });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "i-loose" }, data: { surpriseRevealedAt: NOW } });
  });

  it("reveals a Fork's copy without writing a line (forks are silent)", async () => {
    stopFindManyMock.mockResolvedValue([stop("s-fork", { departDate: "2026-10-11", forkId: "fork-1" })]);
    const result = await revealDueSurprises({ now: NOW });
    expect(result).toEqual({ revealed: 1, failed: 0 });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s-fork" }, data: { surpriseRevealedAt: NOW } });
    expect(activityCreateMock).not.toHaveBeenCalled();
  });
});

describe("revealSurprisesPlannedBy", () => {
  it("reveals the leaver's own Surprises and drops them from everyone else's", async () => {
    stopFindManyMock.mockResolvedValue([
      stop("s-cams"),
      stop("s-sams-for-both", { name: "Rome", surprisePlannerId: "sam", surpriseForIds: '["alex","cam"]' }),
      stop("s-sams-for-cam", { name: "Oslo", surprisePlannerId: "sam", surpriseForIds: '["cam"]' }),
      stop("s-sams-for-alex", { name: "Bonn", surprisePlannerId: "sam", surpriseForIds: '["alex"]' }),
    ]);
    itemFindManyMock.mockResolvedValue([
      item("i-cams"),
      item("i-sams-for-cam", { title: "Cake", surprisePlannerId: "sam", surpriseForIds: '["cam"]' }),
    ]);

    await revealSurprisesPlannedBy("trip-1", "cam");

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", surprisePlannerId: { not: null }, surpriseRevealedAt: null } }),
    );
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s-cams" }, data: { surpriseRevealedAt: expect.any(Date) } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s-sams-for-both" }, data: { surpriseForIds: '["alex"]' } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "s-sams-for-cam" }, data: { surpriseRevealedAt: expect.any(Date) } });
    expect(stopUpdateMock).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s-sams-for-alex" } }));
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "i-cams" }, data: { surpriseRevealedAt: expect.any(Date) } });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "i-sams-for-cam" }, data: { surpriseRevealedAt: expect.any(Date) } });

    const lines = activityCreateMock.mock.calls.map(([arg]) => [arg.data.entityId, arg.data.actorId, arg.data.changes.summary]);
    expect(lines).toEqual([
      ["s-cams", "cam", "revealed the surprise in Paris"],
      ["s-sams-for-cam", "sam", "revealed the surprise in Oslo"],
      ["i-cams", "cam", "revealed the surprise: Dinner"],
      ["i-sams-for-cam", "sam", "revealed the surprise: Cake"],
    ]);
  });

  it("stamps a leaver's Item reveal with its Stop while the Stop is still a Surprise", async () => {
    itemFindManyMock.mockResolvedValue([item("i-cams", { stopId: "stop-live" })]);
    surpriseRootForMock.mockResolvedValue({ type: "STOP", id: "stop-live" });

    await revealSurprisesPlannedBy("trip-1", "cam");

    expect(activityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityId: "i-cams", surpriseOfType: "STOP", surpriseOfId: "stop-live" }),
    });
  });

  it("does nothing when the leaver plans and is named in no Surprise", async () => {
    stopFindManyMock.mockResolvedValue([stop("s-sams", { surprisePlannerId: "sam", surpriseForIds: '["alex"]' })]);
    await revealSurprisesPlannedBy("trip-1", "cam");
    expect(stopUpdateMock).not.toHaveBeenCalled();
    expect(activityCreateMock).not.toHaveBeenCalled();
  });
});
