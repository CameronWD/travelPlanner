import { beforeEach, describe, expect, it, vi } from "vitest";

const { aggregateMock } = vi.hoisted(() => ({ aggregateMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { attachment: { aggregate: aggregateMock } } }));

import { assertQuota, QuotaExceeded, TRIP_QUOTA_BYTES, GLOBAL_QUOTA_BYTES, tripStorageUsed } from "./storage-quota";

beforeEach(() => aggregateMock.mockReset());

/** aggregate is called twice per assertQuota with a tripId: trip scope, then global. */
function usage(trip: number, global: number) {
  aggregateMock
    .mockResolvedValueOnce({ _sum: { size: trip } })
    .mockResolvedValueOnce({ _sum: { size: global } });
}

describe("assertQuota", () => {
  it("passes when the upload lands exactly on the Trip cap", async () => {
    usage(TRIP_QUOTA_BYTES - 10, TRIP_QUOTA_BYTES - 10);
    await expect(assertQuota({ tripId: "t1", size: 10 })).resolves.toBeUndefined();
  });
  it("throws trip scope one byte over the Trip cap", async () => {
    usage(TRIP_QUOTA_BYTES - 10, TRIP_QUOTA_BYTES - 10);
    await expect(assertQuota({ tripId: "t1", size: 11 })).rejects.toMatchObject({ scope: "trip" });
  });
  it("throws global scope when the app is full even if the Trip has room", async () => {
    usage(0, GLOBAL_QUOTA_BYTES);
    await expect(assertQuota({ tripId: "t1", size: 1 })).rejects.toMatchObject({ scope: "global" });
  });
  it("checks only the global cap for a Globe upload (no tripId)", async () => {
    aggregateMock.mockResolvedValueOnce({ _sum: { size: 5 } });
    await assertQuota({ tripId: null, size: 1 });
    expect(aggregateMock).toHaveBeenCalledTimes(1);
    expect(aggregateMock.mock.calls[0][0]).toEqual({ _sum: { size: true } });
  });
  it("treats an empty table as zero usage", async () => {
    aggregateMock.mockResolvedValue({ _sum: { size: null } });
    await expect(assertQuota({ tripId: "t1", size: 1 })).resolves.toBeUndefined();
  });
  it("is a QuotaExceeded instance with the user-facing message", async () => {
    usage(TRIP_QUOTA_BYTES, 0);
    const err = await assertQuota({ tripId: "t1", size: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(QuotaExceeded);
    expect(err.message).toBe("This Trip has used its 500 MB of file storage. Delete some files to add more.");
  });
});

describe("tripStorageUsed", () => {
  it("returns the sum, or 0", async () => {
    aggregateMock.mockResolvedValueOnce({ _sum: { size: 42 } });
    expect(await tripStorageUsed("t1")).toBe(42);
    aggregateMock.mockResolvedValueOnce({ _sum: { size: null } });
    expect(await tripStorageUsed("t1")).toBe(0);
  });
});
