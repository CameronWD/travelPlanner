import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for votes server actions.
 * Mocks: lib/db, lib/guards, next/cache, next/navigation
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  itemFindUniqueMock,
  voteUpsertMock,
  voteDeleteManyMock,
  voteFindUniqueMock,
  recordActivityMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  voteUpsertMock: vi.fn(),
  voteDeleteManyMock: vi.fn(),
  voteFindUniqueMock: vi.fn(),
  recordActivityMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    item: {
      findUnique: itemFindUniqueMock,
    },
    vote: {
      upsert: voteUpsertMock,
      deleteMany: voteDeleteManyMock,
      findUnique: voteFindUniqueMock,
    },
  },
}));
vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }));

import { setVote, clearVote } from "./votes";

const TRIP_ID = "trip-1";
const ITEM_ID = "item-1";
const USER_ID = "user-1";

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: USER_ID },
    membership: { role: "owner" },
  });
  itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID, title: "Sintra" });
  voteFindUniqueMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// setVote
// ---------------------------------------------------------------------------

describe("setVote", () => {
  it("calls requireTripAccess with the tripId", async () => {
    voteUpsertMock.mockResolvedValue({});
    await setVote(TRIP_ID, ITEM_ID, "MUST");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, voteUpsertMock);
  });

  it("verifies the item belongs to the trip", async () => {
    voteUpsertMock.mockResolvedValue({});
    await setVote(TRIP_ID, ITEM_ID, "KEEN");
    expect(itemFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ITEM_ID } }),
    );
  });

  it("upserts the vote for the current user", async () => {
    voteUpsertMock.mockResolvedValue({});
    await setVote(TRIP_ID, ITEM_ID, "MUST");
    expect(voteUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_itemId_userId: {
            tripId: TRIP_ID,
            itemId: ITEM_ID,
            userId: USER_ID,
          },
        },
        update: { level: "MUST" },
        create: expect.objectContaining({
          tripId: TRIP_ID,
          itemId: ITEM_ID,
          userId: USER_ID,
          level: "MUST",
        }),
      }),
    );
  });

  it("returns { success: true } on success", async () => {
    voteUpsertMock.mockResolvedValue({});
    const result = await setVote(TRIP_ID, ITEM_ID, "KEEN");
    expect(result).toEqual({ success: true });
  });

  it("revalidates the wishlist path", async () => {
    voteUpsertMock.mockResolvedValue({});
    await setVote(TRIP_ID, ITEM_ID, "MEH");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/wishlist`);
  });

  it("rejects an invalid level", async () => {
    // @ts-expect-error intentional bad value
    const result = await setVote(TRIP_ID, ITEM_ID, "NOPE");
    expect(result).toMatchObject({ success: false });
    expect(voteUpsertMock).not.toHaveBeenCalled();
  });

  it("throws notFound when item does not belong to the trip", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: "other-trip" });
    await expect(setVote(TRIP_ID, ITEM_ID, "MUST")).rejects.toThrow("NOT_FOUND");
    expect(voteUpsertMock).not.toHaveBeenCalled();
  });

  it("throws notFound when item does not exist", async () => {
    itemFindUniqueMock.mockResolvedValue(null);
    await expect(setVote(TRIP_ID, ITEM_ID, "MUST")).rejects.toThrow("NOT_FOUND");
    expect(voteUpsertMock).not.toHaveBeenCalled();
  });

  it("is access-checked — throws for non-members", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(setVote(TRIP_ID, ITEM_ID, "MUST")).rejects.toThrow("NOT_FOUND");
    expect(voteUpsertMock).not.toHaveBeenCalled();
  });

  it("supports all valid levels — MUST, KEEN, MEH", async () => {
    voteUpsertMock.mockResolvedValue({});
    for (const level of ["MUST", "KEEN", "MEH"] as const) {
      const result = await setVote(TRIP_ID, ITEM_ID, level);
      expect(result).toEqual({ success: true });
    }
  });
});

// ---------------------------------------------------------------------------
// clearVote
// ---------------------------------------------------------------------------

describe("clearVote", () => {
  it("calls requireTripAccess with the tripId", async () => {
    voteDeleteManyMock.mockResolvedValue({ count: 1 });
    await clearVote(TRIP_ID, ITEM_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, voteDeleteManyMock);
  });

  it("verifies the item belongs to the trip", async () => {
    voteDeleteManyMock.mockResolvedValue({ count: 1 });
    await clearVote(TRIP_ID, ITEM_ID);
    expect(itemFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ITEM_ID } }),
    );
  });

  it("deletes the current user's vote", async () => {
    voteDeleteManyMock.mockResolvedValue({ count: 1 });
    await clearVote(TRIP_ID, ITEM_ID);
    expect(voteDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, itemId: ITEM_ID, userId: USER_ID },
    });
  });

  it("returns { success: true } on success", async () => {
    voteDeleteManyMock.mockResolvedValue({ count: 1 });
    const result = await clearVote(TRIP_ID, ITEM_ID);
    expect(result).toEqual({ success: true });
  });

  it("is idempotent — succeeds even when no vote exists (count 0)", async () => {
    voteDeleteManyMock.mockResolvedValue({ count: 0 });
    const result = await clearVote(TRIP_ID, ITEM_ID);
    expect(result).toEqual({ success: true });
  });

  it("revalidates the wishlist path", async () => {
    voteDeleteManyMock.mockResolvedValue({ count: 0 });
    await clearVote(TRIP_ID, ITEM_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/wishlist`);
  });

  it("throws notFound when item does not belong to the trip", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: "other-trip" });
    await expect(clearVote(TRIP_ID, ITEM_ID)).rejects.toThrow("NOT_FOUND");
    expect(voteDeleteManyMock).not.toHaveBeenCalled();
  });

  it("is access-checked — throws for non-members", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(clearVote(TRIP_ID, ITEM_ID)).rejects.toThrow("NOT_FOUND");
    expect(voteDeleteManyMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

describe("Activity", () => {
  it("a first vote records CREATED with the level", async () => {
    voteFindUniqueMock.mockResolvedValue(null);
    await setVote("trip-1", "item-1", "MUST");
    expect(recordActivityMock).toHaveBeenCalledWith({
      tripId: "trip-1",
      verb: "CREATED",
      entityType: "VOTE",
      entityId: "item-1",
      entityLabel: "Sintra",
      changes: { summary: "voted must-do on Sintra" },
    });
  });

  it("changing a vote records UPDATED from → to", async () => {
    voteFindUniqueMock.mockResolvedValue({ level: "KEEN" });
    await setVote("trip-1", "item-1", "MEH");
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", changes: { summary: "changed their vote on Sintra from keen to meh" } }),
    );
  });

  it("re-setting the same level records nothing", async () => {
    voteFindUniqueMock.mockResolvedValue({ level: "KEEN" });
    await setVote("trip-1", "item-1", "KEEN");
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("an invalid level records nothing", async () => {
    await setVote("trip-1", "item-1", "NOPE" as never);
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("clearing a vote records nothing", async () => {
    await clearVote("trip-1", "item-1");
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});
