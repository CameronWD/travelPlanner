import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccessMock,
  revalidatePathMock,
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
  revalidatePathMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  itemUpdateMock: vi.fn().mockResolvedValue({}),
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn().mockResolvedValue([]),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
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

function arrangeTrip() {
  itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID });
  tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: "2026-07-31" });
  stopFindManyMock.mockResolvedValue([
    { id: "stop-paris", arriveDate: "2026-07-01", departDate: "2026-07-10", sortOrder: 0 },
    { id: "stop-rome", arriveDate: "2026-07-11", departDate: "2026-07-20", sortOrder: 1 },
  ]);
}

describe("rescheduleItem", () => {
  it("is access-checked via requireTripAccess(tripId)", async () => {
    arrangeTrip();
    await rescheduleItem(ITEM_ID, "2026-07-05");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
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
});
