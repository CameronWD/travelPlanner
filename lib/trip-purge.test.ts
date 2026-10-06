import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const { tripFindManyMock, tripDeleteMock, scheduleBlobDeletionMock, transactionMock } = vi.hoisted(() => {
  const tripDeleteMock = vi.fn();
  // db.$transaction(cb) — invokes cb with a fake tx whose trip.delete is the
  // SAME mock as the top-level one, so existing assertions on tripDeleteMock
  // keep working whether a call goes through db.* or tx.*.
  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = { trip: { delete: tripDeleteMock } };
    return cb(tx);
  });
  return {
    tripFindManyMock: vi.fn(),
    tripDeleteMock,
    scheduleBlobDeletionMock: vi.fn(),
    transactionMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      findMany: tripFindManyMock,
      delete: tripDeleteMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/blob-retention", () => ({
  scheduleBlobDeletion: scheduleBlobDeletionMock,
}));

import { purgeExpiredDeletedTrips } from "./trip-purge";

describe("purgeExpiredDeletedTrips", () => {
  beforeEach(() => {
    tripFindManyMock.mockReset();
    tripDeleteMock.mockReset();
    scheduleBlobDeletionMock.mockReset();
    transactionMock.mockClear();
    tripDeleteMock.mockResolvedValue(undefined);
    scheduleBlobDeletionMock.mockResolvedValue(undefined);
  });

  it("purges only Trips past 30 days, scheduling cover and attachment blobs before the delete, in one transaction", async () => {
    const now = new Date("2026-11-02T00:00:00Z");
    const cutoff = new Date("2026-10-03T00:00:00Z");
    tripFindManyMock.mockResolvedValue([
      {
        id: "old",
        coverImageKey: "covers/old.webp",
        coverSmallKey: "covers/old.webp-sm",
        attachments: [{ storageKey: "a/1" }, { storageKey: null }],
      },
    ]);

    const result = await purgeExpiredDeletedTrips({ now });

    expect(tripFindManyMock.mock.calls[0][0].where).toEqual({
      deletedAt: { lt: cutoff },
    });
    expect(transactionMock).toHaveBeenCalledOnce();
    // scheduleBlobDeletion must receive the TRANSACTION client (second arg),
    // not the default db — that's what makes its failure abort the delete
    // instead of being swallowed.
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(
      ["covers/old.webp", "covers/old.webp-sm", "a/1"],
      expect.objectContaining({ trip: expect.objectContaining({ delete: expect.any(Function) }) }),
    );
    expectAccessCheckedBeforeWrite(scheduleBlobDeletionMock, tripDeleteMock); // "before" — the helper only checks order
    // The delete's where repeats the cutoff guard, so a Trip Restored
    // between findMany and delete (clearing deletedAt) can't be purged.
    expect(tripDeleteMock).toHaveBeenCalledWith({
      where: { id: "old", deletedAt: { lt: cutoff } },
    });
    expect(result).toEqual({ purged: ["old"] });
  });

  it("does nothing when no Trip has expired", async () => {
    tripFindManyMock.mockResolvedValue([]);
    expect(await purgeExpiredDeletedTrips()).toEqual({ purged: [] });
    expect(tripDeleteMock).not.toHaveBeenCalled();
  });

  it("a Trip deleted 29 days ago is left alone (cutoff is strictly older than 30 days)", async () => {
    const now = new Date("2026-11-02T00:00:00Z");
    tripFindManyMock.mockResolvedValue([]);
    await purgeExpiredDeletedTrips({ now });
    expect(tripFindManyMock.mock.calls[0][0].where).toEqual({
      deletedAt: { lt: new Date("2026-10-03T00:00:00Z") },
    });
  });

  it("does not let one failing Trip stop the others", async () => {
    tripFindManyMock.mockResolvedValue([
      { id: "bad", coverImageKey: null, attachments: [] },
      { id: "good", coverImageKey: null, attachments: [] },
    ]);
    tripDeleteMock.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "bad") throw new Error("boom");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await purgeExpiredDeletedTrips();

    expect(result).toEqual({ purged: ["good"] });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("defaults the cutoff to RECENTLY_DELETED_DAYS (30) days before now", async () => {
    tripFindManyMock.mockResolvedValue([]);
    const before = Date.now();
    await purgeExpiredDeletedTrips();
    const after = Date.now();

    const cutoff: Date = tripFindManyMock.mock.calls[0][0].where.deletedAt.lt;
    const expectedMin = before - 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("leaves the Trip row in place when scheduling its blobs throws (transaction aborts)", async () => {
    tripFindManyMock.mockResolvedValue([
      { id: "leaky", coverImageKey: "covers/leaky.webp", attachments: [{ storageKey: "a/2" }] },
    ]);
    scheduleBlobDeletionMock.mockRejectedValueOnce(new Error("retention write failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await purgeExpiredDeletedTrips();

    // The transaction aborted, so the delete inside it must never have been
    // reached — the Trip, and its blobs, survive this run.
    expect(tripDeleteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ purged: [] });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
