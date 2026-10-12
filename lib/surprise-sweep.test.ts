import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Surprise (CONTEXT.md): the automatic reveal (the day after it is over, in
 * its Stop's zone) and the reveal when the planner leaves the Trip.
 */

const { stopFindManyMock, stopUpdateMock, itemFindManyMock, itemUpdateMock, activityCreateMock } = vi.hoisted(() => ({
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

import { revealDueSurprises, revealSurprisesPlannedBy } from "./surprise-sweep";

const NOW = new Date("2026-10-12T12:00:00Z");
const LIVE_BY_CAM = { surprisePlannerId: "cam", surpriseForIds: '["alex","sam"]', surpriseRevealedAt: null };

function stop(id: string, over: Record<string, unknown> = {}) {
  return { id, tripId: "trip-1", forkId: null, name: "Paris", departDate: null, timezone: "UTC", ...LIVE_BY_CAM, ...over };
}
function item(id: string, over: Record<string, unknown> = {}) {
  return { id, tripId: "trip-1", forkId: null, title: "Dinner", date: null, stop: { timezone: "UTC" }, ...LIVE_BY_CAM, ...over };
}

beforeEach(() => {
  stopFindManyMock.mockResolvedValue([]);
  itemFindManyMock.mockResolvedValue([]);
  stopUpdateMock.mockResolvedValue({});
  itemUpdateMock.mockResolvedValue({});
  activityCreateMock.mockResolvedValue({});
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

    expect(result).toEqual({ revealed: 1 });
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

    expect(result).toEqual({ revealed: 1 });
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

  it("reads the day in the Stop's own zone", async () => {
    // 2026-10-12T12:00Z is already the 13th in Auckland (UTC+13).
    stopFindManyMock.mockResolvedValue([stop("s-nz", { departDate: "2026-10-12", timezone: "Pacific/Auckland" })]);
    const result = await revealDueSurprises({ now: NOW });
    expect(result).toEqual({ revealed: 1 });
  });

  it("reveals a Fork's copy without writing a line (forks are silent)", async () => {
    stopFindManyMock.mockResolvedValue([stop("s-fork", { departDate: "2026-10-11", forkId: "fork-1" })]);
    const result = await revealDueSurprises({ now: NOW });
    expect(result).toEqual({ revealed: 1 });
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

  it("does nothing when the leaver plans and is named in no Surprise", async () => {
    stopFindManyMock.mockResolvedValue([stop("s-sams", { surprisePlannerId: "sam", surpriseForIds: '["alex"]' })]);
    await revealSurprisesPlannedBy("trip-1", "cam");
    expect(stopUpdateMock).not.toHaveBeenCalled();
    expect(activityCreateMock).not.toHaveBeenCalled();
  });
});
