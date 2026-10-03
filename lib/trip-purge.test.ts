import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const { tripFindManyMock, tripDeleteMock, scheduleBlobDeletionMock } = vi.hoisted(() => ({
  tripFindManyMock: vi.fn(),
  tripDeleteMock: vi.fn(),
  scheduleBlobDeletionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      findMany: tripFindManyMock,
      delete: tripDeleteMock,
    },
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
    tripDeleteMock.mockResolvedValue(undefined);
    scheduleBlobDeletionMock.mockResolvedValue(undefined);
  });

  it("purges only Trips past 30 days, scheduling cover and attachment blobs before the delete", async () => {
    const now = new Date("2026-11-02T00:00:00Z");
    tripFindManyMock.mockResolvedValue([
      {
        id: "old",
        coverImageKey: "covers/old.webp",
        attachments: [{ storageKey: "a/1" }, { storageKey: null }],
      },
    ]);

    const result = await purgeExpiredDeletedTrips({ now });

    expect(tripFindManyMock.mock.calls[0][0].where).toEqual({
      deletedAt: { lt: new Date("2026-10-03T00:00:00Z") },
    });
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["covers/old.webp", "a/1"]);
    expectAccessCheckedBeforeWrite(scheduleBlobDeletionMock, tripDeleteMock); // "before" — the helper only checks order
    expect(tripDeleteMock).toHaveBeenCalledWith({ where: { id: "old" } });
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
});
