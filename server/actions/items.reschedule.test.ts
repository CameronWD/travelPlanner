import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const {
  requireTripAccessMock,
  revalidateTripMock,
  itemFindUniqueMock,
  itemUpdateMock,
  tripFindUniqueMock,
  stopFindManyMock,
  notFoundMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidateTripMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  itemUpdateMock: vi.fn().mockResolvedValue({}),
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn().mockResolvedValue([]),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const requireOutsideSurpriseMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
// requireItemAccess is now a thin adapter over requireRowAccess (Task 4) —
// forward to the same itemFindUniqueMock/requireTripAccessMock/
// requireOutsideSurpriseMock this file already seeds, so existing
// mockResolvedValue setups for the guard's own lookup keep working unchanged.
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async () => {
    const row = await itemFindUniqueMock();
    // Mirror the real guard's load → notFound() short-circuit, using this
    // file's own notFoundMock (mocked below as next/navigation's notFound).
    if (!row) {
      notFoundMock();
    }
    const { user, membership } = await requireTripAccessMock(row.tripId);
    const surpriseOf = await requireOutsideSurpriseMock(user.id, { itemId: row.id });
    return { row, user, membership, surpriseOf };
  }),
);
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock, requireRowAccess: requireRowAccessMock }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/surprise-guard", () => ({
  requireOutsideSurprise: requireOutsideSurpriseMock,
  surpriseRootFor: vi.fn().mockResolvedValue(null),
  surpriseRootForEntity: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db", () => ({
  db: {
    item: { findUnique: itemFindUniqueMock, update: itemUpdateMock },
    trip: { findUnique: tripFindUniqueMock },
    stop: { findMany: stopFindManyMock },
  },
}));

import { rescheduleItem } from "./items";

const TRIP_ID = "trip-abc";
const ITEM_ID = "item-1";

afterEach(() => vi.clearAllMocks());

function arrangeTrip(forkId: string | null = null) {
  itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID, forkId });
  tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: "2026-07-31" });
  stopFindManyMock.mockResolvedValue([
    { id: "stop-paris", arriveDate: "2026-07-01", departDate: "2026-07-10", sortOrder: 0 },
    { id: "stop-rome", arriveDate: "2026-07-11", departDate: "2026-07-20", sortOrder: 1 },
  ]);
}

describe("rescheduleItem", () => {
  it("revalidates the trip's plan scope (card 2.E, NAV-02 — no longer layout-wide)", async () => {
    arrangeTrip();
    await rescheduleItem(ITEM_ID, "2026-07-05");
    expect(revalidateTripMock).toHaveBeenCalledWith(TRIP_ID, "plan");
  });

  it("is access-checked via requireTripAccess(tripId)", async () => {
    arrangeTrip();
    await rescheduleItem(ITEM_ID, "2026-07-05");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireRowAccessMock, itemUpdateMock);
  });

  it("rejects with notFound and writes nothing when the item doesn't exist", async () => {
    itemFindUniqueMock.mockResolvedValue(null);

    await expect(rescheduleItem("missing-item", "2026-07-05")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("sets date and reassigns stopId to the covering stop", async () => {
    arrangeTrip();
    const result = await rescheduleItem(ITEM_ID, "2026-07-15");
    expect(result.success).toBe(true);
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { date: "2026-07-15", stopId: "stop-rome" },
    });
  });

  it("sets stopId to null on a gap day with no covering stop", async () => {
    arrangeTrip();
    await rescheduleItem(ITEM_ID, "2026-07-25"); // after both stops, still in trip window
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { date: "2026-07-25", stopId: null },
    });
  });

  it("keeps the current owning Stop on a Changeover day it still covers (ADR 0049 rule 4)", async () => {
    arrangeTrip();
    itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID, forkId: null, stopId: "stop-paris" });
    stopFindManyMock.mockResolvedValue([
      { id: "stop-paris", arriveDate: "2026-07-01", departDate: "2026-07-10", sortOrder: 0 },
      { id: "stop-rome", arriveDate: "2026-07-10", departDate: "2026-07-20", sortOrder: 1 },
    ]);
    await rescheduleItem(ITEM_ID, "2026-07-10");
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { date: "2026-07-10", stopId: "stop-paris" },
    });
  });

  it("rejects a date outside the trip window without updating", async () => {
    arrangeTrip();
    const result = await rescheduleItem(ITEM_ID, "2026-08-15");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.date).toBeDefined();
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed date", async () => {
    arrangeTrip();
    const result = await rescheduleItem(ITEM_ID, "15-07-2026");
    expect(result.success).toBe(false);
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("scopes stop lookup to real plan (forkId: null) when item is in real plan", async () => {
    arrangeTrip(null); // real-plan item
    await rescheduleItem(ITEM_ID, "2026-07-15");
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: TRIP_ID, forkId: null }),
      }),
    );
  });

  it("scopes stop lookup to fork when item belongs to a fork", async () => {
    const FORK_ID = "fork-abc";
    arrangeTrip(FORK_ID);
    await rescheduleItem(ITEM_ID, "2026-07-15");
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: TRIP_ID, forkId: FORK_ID }),
      }),
    );
  });
});
