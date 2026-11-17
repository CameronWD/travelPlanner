import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireRowAccessMock, upsertMock, deleteManyMock, revalidateTripMock } = vi.hoisted(() => ({
  requireRowAccessMock: vi.fn(),
  upsertMock: vi.fn().mockResolvedValue({}),
  deleteManyMock: vi.fn().mockResolvedValue({ count: 1 }),
  revalidateTripMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireRowAccess: requireRowAccessMock }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock }));
vi.mock("@/lib/db", () => ({ db: { hopMode: { upsert: upsertMock, deleteMany: deleteManyMock } } }));

import { setHopMode } from "./hop-modes";

function rowsOn(trips: Record<string, string>) {
  requireRowAccessMock.mockImplementation(async (_kind: string, id: string, opts: unknown) => {
    if (!(id in trips)) throw new Error("NOT_FOUND");
    expect(opts).toEqual({ realPlanOnly: true });
    return { row: { id, tripId: trips[id] }, user: { id: "user-1" } };
  });
}

describe("setHopMode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets a mode, then replaces it", async () => {
    rowsOn({ a: "t1", b: "t1" });
    expect(await setHopMode("a", "b", "WALK")).toEqual({ success: true });
    expect(await setHopMode("a", "b", "DRIVE")).toEqual({ success: true });
    expect(upsertMock).toHaveBeenNthCalledWith(1, {
      where: { fromItemId_toItemId: { fromItemId: "a", toItemId: "b" } },
      create: { tripId: "t1", fromItemId: "a", toItemId: "b", mode: "WALK", setById: "user-1" },
      update: { mode: "WALK", setById: "user-1" },
    });
    expect(upsertMock.mock.calls[1][0].update.mode).toBe("DRIVE");
    expect(revalidateTripMock).toHaveBeenCalledWith("t1", "plan");
  });

  it("clears with null", async () => {
    rowsOn({ a: "t1", b: "t1" });
    expect(await setHopMode("a", "b", null)).toEqual({ success: true });
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { fromItemId: "a", toItemId: "b" } });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("refuses Items on different Trips", async () => {
    rowsOn({ a: "t1", b: "t2" });
    expect(await setHopMode("a", "b", "WALK")).toMatchObject({ success: false });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("refuses a caller for whom either Item is a hidden Surprise or not on the real plan", async () => {
    rowsOn({ a: "t1" });
    await expect(setHopMode("a", "hidden", "WALK")).rejects.toThrow("NOT_FOUND");
    await expect(setHopMode("hidden", "a", null)).rejects.toThrow("NOT_FOUND");
    expect(upsertMock).not.toHaveBeenCalled();
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("refuses a mode that is not one of the three", async () => {
    rowsOn({ a: "t1", b: "t1" });
    expect(await setHopMode("a", "b", "BIKE" as never)).toMatchObject({ success: false });
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
