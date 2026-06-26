import { afterEach, describe, expect, it, vi } from "vitest";

const { requireTripAccessMock, revalidatePathMock, tripUpdateMock } = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  revalidatePathMock: vi.fn(),
  tripUpdateMock: vi.fn().mockResolvedValue({ id: "trip-1" }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      update: tripUpdateMock,
    },
  },
}));

import { updateDrivingSettings } from "./driving-settings";

afterEach(() => vi.clearAllMocks());

describe("updateDrivingSettings", () => {
  it("clamps + persists winding factor and avg speed", async () => {
    await updateDrivingSettings("trip-1", { windingFactor: 9, avgSpeedKph: 5 });
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: { drivingWindingFactor: 3, drivingAvgSpeedKph: 20 },
    });
    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/settings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/plan");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/summary");
  });

  it("passes through in-range values", async () => {
    await updateDrivingSettings("trip-1", { windingFactor: 1.4, avgSpeedKph: 90 });
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: { drivingWindingFactor: 1.4, drivingAvgSpeedKph: 90 },
    });
  });
});
