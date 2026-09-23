import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `wipeDemo` (prisma/demo/persist.ts).
 *
 * Narrow by design: this file exists for the deletion path only. The persist
 * half is exercised by the seed itself and by prisma/real/persist.test.ts's
 * equivalent, and giving it a harness here would mean re-mocking most of
 * Prisma for no new coverage.
 *
 * The behaviour under test is ARCH-DAT-3's rule — no code path in this repo
 * hard-deletes a blob — plus I7 (final fix wave): `Trip.coverImageKey` must be
 * scheduled for retention alongside the attachments, which it was not.
 */

const {
  tripFindManyMock,
  tripDeleteMock,
  attachmentFindManyMock,
  userFindManyMock,
  globeMemberFindManyMock,
  globeDeleteMock,
  scheduleBlobDeletionMock,
  storageDeleteMock,
} = vi.hoisted(() => ({
  tripFindManyMock: vi.fn().mockResolvedValue([]),
  tripDeleteMock: vi.fn().mockResolvedValue({}),
  attachmentFindManyMock: vi.fn().mockResolvedValue([]),
  userFindManyMock: vi.fn().mockResolvedValue([]),
  globeMemberFindManyMock: vi.fn().mockResolvedValue([]),
  globeDeleteMock: vi.fn().mockResolvedValue({}),
  scheduleBlobDeletionMock: vi.fn().mockResolvedValue(undefined),
  storageDeleteMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findMany: tripFindManyMock, delete: tripDeleteMock },
    attachment: { findMany: attachmentFindManyMock },
    user: { findMany: userFindManyMock },
    globeMember: { findMany: globeMemberFindManyMock },
    globe: { delete: globeDeleteMock },
  },
}));

vi.mock("@/lib/blob-retention", () => ({
  scheduleBlobDeletion: scheduleBlobDeletionMock,
}));

vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ delete: storageDeleteMock, save: vi.fn() }),
  generateKey: () => "key",
}));

import { wipeDemo } from "./persist";
import { DEMO_TRIP_NAMES } from "@/lib/demo";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wipeDemo", () => {
  it("schedules the cover blob alongside the attachment blobs (I7)", async () => {
    tripFindManyMock.mockResolvedValueOnce([
      { id: "demo-1", coverImageKey: "trips/demo-1/cover.png" },
    ]);
    attachmentFindManyMock.mockResolvedValueOnce([
      { storageKey: "trips/demo-1/a.pdf" },
    ]);

    await wipeDemo();

    // The lookup must ASK for the cover key — selecting only `id` is exactly
    // how every re-seed used to orphan another cover object, permanently:
    // nothing records it, so no sweep can ever find it again.
    expect(tripFindManyMock).toHaveBeenCalledWith({
      where: { name: { in: DEMO_TRIP_NAMES } },
      select: { id: true, coverImageKey: true },
    });
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith([
      "trips/demo-1/cover.png",
      "trips/demo-1/a.pdf",
    ]);
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("schedules blobs before the row that justified deleting them is gone", async () => {
    tripFindManyMock.mockResolvedValueOnce([{ id: "demo-1", coverImageKey: null }]);

    await wipeDemo();

    expect(scheduleBlobDeletionMock.mock.invocationCallOrder[0]).toBeLessThan(
      tripDeleteMock.mock.invocationCallOrder[0],
    );
  });

  it("is a no-op on a fresh DB", async () => {
    await wipeDemo();

    expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
    expect(tripDeleteMock).not.toHaveBeenCalled();
    expect(globeDeleteMock).not.toHaveBeenCalled();
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it("schedules a Globe's attachment blobs rather than destroying them", async () => {
    userFindManyMock.mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }]);
    globeMemberFindManyMock.mockResolvedValueOnce([{ globeId: "g1" }, { globeId: "g1" }]);
    attachmentFindManyMock.mockResolvedValueOnce([{ storageKey: "globes/g1/x.png" }]);

    await wipeDemo();

    // Deduplicated: both demo users may belong to the same Globe.
    expect(globeDeleteMock).toHaveBeenCalledTimes(1);
    expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["globes/g1/x.png"]);
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });
});
