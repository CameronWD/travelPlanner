import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireRowAccessMock, loadFlagsMock, upsertMock, deleteManyMock, revalidateTripMock } = vi.hoisted(() => ({
  requireRowAccessMock: vi.fn(),
  loadFlagsMock: vi.fn(),
  upsertMock: vi.fn().mockResolvedValue({}),
  deleteManyMock: vi.fn().mockResolvedValue({ count: 1 }),
  revalidateTripMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireRowAccess: requireRowAccessMock }));
vi.mock("@/lib/flags-loader", () => ({ loadFlags: loadFlagsMock }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock }));
vi.mock("@/lib/db", () => ({ db: { flagDismissal: { upsert: upsertMock, deleteMany: deleteManyMock } } }));

import { markFlagFine, unmarkFlagFine } from "./flag-dismissals";
import type { Flag } from "@/lib/flags";

const tight = (fingerprint: string): Flag => ({
  id: "tight-a-b",
  severity: "info",
  message: "Cutting it close.",
  targetType: "DAY",
  fingerprint,
});

function itemsOn(trips: Record<string, string>) {
  requireRowAccessMock.mockImplementation(async (kind: string, id: string, opts: unknown) => {
    expect(kind).toBe("item");
    expect(opts).toEqual({ realPlanOnly: true });
    if (!(id in trips)) throw new Error("NOT_FOUND");
    return { row: { id, tripId: trips[id] }, user: { id: "user-1" } };
  });
}

describe("markFlagFine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    itemsOn({ a: "t1", b: "t1" });
  });

  it("marks a tight Flag fine with its current fingerprint, as the caller", async () => {
    loadFlagsMock.mockResolvedValue({ shown: [tight("fp-1")], markedFine: [] });
    expect(await markFlagFine("t1", "tight-a-b", "fp-1")).toEqual({ success: true });
    expect(loadFlagsMock).toHaveBeenCalledWith("t1", "user-1");
    expect(upsertMock).toHaveBeenCalledWith({
      where: { tripId_flagId: { tripId: "t1", flagId: "tight-a-b" } },
      create: { tripId: "t1", flagId: "tight-a-b", fingerprint: "fp-1", markedById: "user-1" },
      update: { fingerprint: "fp-1", markedById: "user-1", createdAt: expect.any(Date) },
    });
    expect(revalidateTripMock).toHaveBeenCalledWith("t1", "plan");
  });

  it("re-marking replaces the fingerprint", async () => {
    loadFlagsMock.mockResolvedValue({ shown: [tight("fp-2")], markedFine: [] });
    expect(await markFlagFine("t1", "tight-a-b", "fp-2")).toEqual({ success: true });
    expect(upsertMock.mock.calls[0][0].update.fingerprint).toBe("fp-2");
  });

  it("a mark sent with a stale fingerprint is refused, stores nothing and refreshes the page", async () => {
    loadFlagsMock.mockResolvedValue({ shown: [tight("fp-2")], markedFine: [] });
    expect(await markFlagFine("t1", "tight-a-b", "fp-1")).toEqual({
      success: false,
      errors: { _: ["That warning has changed. Have another look."] },
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(revalidateTripMock).toHaveBeenCalledWith("t1", "plan");
  });

  it("re-marking a Flag already Marked fine finds it among the Marked fine ones", async () => {
    loadFlagsMock.mockResolvedValue({ shown: [], markedFine: [{ ...tight("fp-1"), markedByName: "Xanthia", markedAt: new Date() }] });
    expect(await markFlagFine("t1", "tight-a-b", "fp-1")).toEqual({ success: true });
    expect(upsertMock.mock.calls[0][0].create.fingerprint).toBe("fp-1");
  });

  it("refuses any Flag that is not a travel-time one", async () => {
    expect(await markFlagFine("t1", "packed-2026-07-02", "fp-1")).toMatchObject({ success: false });
    expect(requireRowAccessMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("refuses when either Item is a hidden Surprise for the caller (or not on the real plan)", async () => {
    itemsOn({ a: "t1" });
    await expect(markFlagFine("t1", "tight-a-b", "fp-1")).rejects.toThrow("NOT_FOUND");
    await expect(markFlagFine("t1", "tight-b-a", "fp-1")).rejects.toThrow("NOT_FOUND");
    expect(loadFlagsMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("refuses Items on another Trip", async () => {
    itemsOn({ a: "t2", b: "t2" });
    expect(await markFlagFine("t1", "tight-a-b", "fp-1")).toMatchObject({ success: false });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("refuses a warning that is no longer showing, and refreshes the page", async () => {
    loadFlagsMock.mockResolvedValue({ shown: [], markedFine: [] });
    expect(await markFlagFine("t1", "tight-a-b", "fp-1")).toMatchObject({ success: false, errors: { _: ["That warning is no longer showing."] } });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(revalidateTripMock).toHaveBeenCalledWith("t1", "plan");
  });
});

const drive = (fingerprint: string): Flag => ({
  id: "drive-short-t1",
  severity: "warning",
  message: "Drive from Brisbane to Tweed Heads on 2026-12-05: your times allow 1h but the road takes about 1h 12m.",
  targetType: "DAY",
  fingerprint,
  between: { from: "Brisbane", to: "Tweed Heads" },
});

function transportsOn(trips: Record<string, string>) {
  requireRowAccessMock.mockImplementation(async (kind: string, id: string, opts: unknown) => {
    expect(kind).toBe("transport");
    expect(opts).toEqual({ realPlanOnly: true });
    if (!(id in trips)) throw new Error("NOT_FOUND");
    return { row: { id, tripId: trips[id] }, user: { id: "user-1" } };
  });
}

describe("a drive Flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transportsOn({ t1: "t1" });
  });

  it("marks a drive Flag fine after checking the Transport is on the trip", async () => {
    loadFlagsMock.mockResolvedValue({ shown: [drive("fp")], markedFine: [] });
    expect(await markFlagFine("t1", "drive-short-t1", "fp")).toEqual({ success: true });
    expect(requireRowAccessMock).toHaveBeenCalledWith("transport", "t1", { realPlanOnly: true });
    expect(upsertMock).toHaveBeenCalledWith({
      where: { tripId_flagId: { tripId: "t1", flagId: "drive-short-t1" } },
      create: { tripId: "t1", flagId: "drive-short-t1", fingerprint: "fp", markedById: "user-1" },
      update: { fingerprint: "fp", markedById: "user-1", createdAt: expect.any(Date) },
    });
  });

  it("refuses a drive Flag whose Transport is on another trip", async () => {
    transportsOn({ t1: "t2" });
    expect(await markFlagFine("t1", "drive-short-t1", "fp")).toEqual({
      success: false,
      errors: { _: ["That drive is not on this trip."] },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("still refuses a packed-day Flag", async () => {
    expect(await markFlagFine("t1", "packed-2026-07-02", "fp")).toEqual({
      success: false,
      errors: { _: ["Only a travel-time warning can be marked fine."] },
    });
    expect(requireRowAccessMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("unmarks a drive Flag", async () => {
    expect(await unmarkFlagFine("t1", "drive-short-t1")).toEqual({ success: true });
    expect(requireRowAccessMock).toHaveBeenCalledWith("transport", "t1", { realPlanOnly: true });
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", flagId: "drive-short-t1" } });
  });
});

describe("unmarkFlagFine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    itemsOn({ a: "t1", b: "t1" });
  });

  it("unmarks", async () => {
    expect(await unmarkFlagFine("t1", "tight-a-b")).toEqual({ success: true });
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", flagId: "tight-a-b" } });
    expect(revalidateTripMock).toHaveBeenCalledWith("t1", "plan");
  });

  it("refuses packed-… and a hidden Surprise alike", async () => {
    expect(await unmarkFlagFine("t1", "packed-2026-07-02")).toMatchObject({ success: false });
    itemsOn({ a: "t1" });
    await expect(unmarkFlagFine("t1", "tight-a-b")).rejects.toThrow("NOT_FOUND");
    expect(deleteManyMock).not.toHaveBeenCalled();
  });
});
