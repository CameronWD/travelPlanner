import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const { requireTripAccessMock, revalidateTripMock, tripUpdateMock } = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  revalidateTripMock: vi.fn(),
  tripUpdateMock: vi.fn().mockResolvedValue({ id: "trip-1" }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock }));
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
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripUpdateMock);
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan");
  });

  it("passes through in-range values", async () => {
    await updateDrivingSettings("trip-1", { windingFactor: 1.4, avgSpeedKph: 90 });
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: { drivingWindingFactor: 1.4, drivingAvgSpeedKph: 90 },
    });
  });
});
