import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccessMock, requireOutsideSurpriseMock, stopFindUniqueMock, itemFindUniqueMock, transportFindUniqueMock, costFindUniqueMock } =
  vi.hoisted(() => ({
    requireTripAccessMock: vi.fn(),
    requireOutsideSurpriseMock: vi.fn(),
    stopFindUniqueMock: vi.fn(),
    itemFindUniqueMock: vi.fn(),
    transportFindUniqueMock: vi.fn(),
    costFindUniqueMock: vi.fn(),
  }));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/surprise-guard", () => ({ requireOutsideSurprise: requireOutsideSurpriseMock }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    stop: { findUnique: stopFindUniqueMock },
    item: { findUnique: itemFindUniqueMock },
    transport: { findUnique: transportFindUniqueMock },
    cost: { findUnique: costFindUniqueMock },
  },
}));

import { requireRealPlanRow } from "./real-plan";

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({ user: { id: "sam" }, membership: { role: "member" } });
  requireOutsideSurpriseMock.mockResolvedValue(null);
});

describe("requireRealPlanRow — Surprise", () => {
  it("refuses a Traveller surprised by the Stop", async () => {
    stopFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    requireOutsideSurpriseMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(requireRealPlanRow("stop", "stop-1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("sam", { stopId: "stop-1" });
  });

  it("checks an Item by itemId", async () => {
    itemFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    expect(await requireRealPlanRow("item", "item-1")).toEqual({ tripId: "trip-1" });
    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("sam", { itemId: "item-1" });
  });

  it("checks a Cost through its owner", async () => {
    costFindUniqueMock.mockResolvedValueOnce({ tripId: "trip-1" }).mockResolvedValueOnce({ ownerType: "ITEM", ownerId: "item-1" });
    await requireRealPlanRow("cost", "cost-1");
    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("sam", { costOwner: { ownerType: "ITEM", ownerId: "item-1" } });
  });

  it("a Transport is never inside a Surprise", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    await requireRealPlanRow("transport", "tr-1");
    expect(requireOutsideSurpriseMock).not.toHaveBeenCalled();
  });
});
