import { beforeEach, describe, expect, it, vi } from "vitest";

const { stopFindMany, loadStopForMcp, readMcpStops } = vi.hoisted(() => ({
  stopFindMany: vi.fn(), loadStopForMcp: vi.fn(), readMcpStops: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { stop: { findMany: stopFindMany } } }));
vi.mock("./entities", () => ({ loadStopForMcp, readMcpStops }));

import { changedStopIds, conflictsOf, stopTracker, type StopSnapshot } from "./stop-changes";

const snap = (id: string, o: Partial<StopSnapshot> = {}): StopSnapshot => ({
  id, sortOrder: 0, arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, pinned: false, chapterId: null, timezone: "Europe/Lisbon", ...o,
});

describe("changedStopIds", () => {
  it("names Stops that moved, re-dated, re-nighted, (un)pinned, changed Chapter or zone, or are new — in plan order", () => {
    const before = [snap("a"), snap("b", { sortOrder: 1 }), snap("c", { sortOrder: 2 })];
    const after = [snap("a"), snap("c", { sortOrder: 1 }), snap("b", { sortOrder: 2, departDate: "2027-06-05" }), snap("d", { sortOrder: 3 })];
    expect(changedStopIds(before, after)).toEqual(["c", "b", "d"]);
  });
  it("is empty when nothing changed", () => {
    expect(changedStopIds([snap("a")], [snap("a")])).toEqual([]);
  });
});

describe("stopTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadStopForMcp.mockImplementation(async (id: string) => ({ id }));
    readMcpStops.mockImplementation(async (_t: string, ids: string[]) => ids.map((id) => ({ id, shell: true })));
  });

  it("stopAndShifted reads the Stop through get_stop and every other Stop it moved through readMcpStops (a Surprise as its shell)", async () => {
    stopFindMany
      .mockResolvedValueOnce([snap("a"), snap("b", { sortOrder: 1, arriveDate: "2027-06-04", departDate: "2027-06-07" })])
      .mockResolvedValueOnce([snap("a", { departDate: "2027-06-05" }), snap("b", { sortOrder: 1, arriveDate: "2027-06-05", departDate: "2027-06-08" })]);
    const t = stopTracker();
    await t.start("trip-1");
    expect(await t.stopAndShifted("a")).toEqual({ stop: { id: "a" }, shifted: [{ id: "b", shell: true }] });
    expect(readMcpStops).toHaveBeenCalledWith("trip-1", ["b"]);
    expect(stopFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", forkId: null } }));
  });

  it("changed() reads every Stop the write changed", async () => {
    stopFindMany.mockResolvedValueOnce([snap("a", { arriveDate: null, departDate: null })]).mockResolvedValueOnce([snap("a")]);
    const t = stopTracker();
    await t.start("trip-1");
    expect(await t.changed()).toEqual([{ id: "a", shell: true }]);
  });
});

describe("conflictsOf", () => {
  it("passes non-empty conflicts through and drops an empty list", () => {
    expect(conflictsOf({ conflicts: [{ stopId: "a" }] })).toEqual({ conflicts: [{ stopId: "a" }] });
    expect(conflictsOf({ conflicts: [] })).toEqual({});
    expect(conflictsOf({})).toEqual({});
  });
});
