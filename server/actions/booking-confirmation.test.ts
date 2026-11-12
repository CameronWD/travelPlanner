import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireRowAccessMock,
  revalidateTripMock,
  transportUpdateMock,
  accommodationUpdateMock,
  itemUpdateMock,
} = vi.hoisted(() => ({
  requireRowAccessMock: vi.fn(),
  revalidateTripMock: vi.fn(),
  transportUpdateMock: vi.fn(),
  accommodationUpdateMock: vi.fn(),
  itemUpdateMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireRowAccess: requireRowAccessMock }));
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock }));
vi.mock("@/lib/db", () => ({
  db: {
    transport: { update: transportUpdateMock },
    accommodation: { update: accommodationUpdateMock },
    item: { update: itemUpdateMock },
  },
}));

import { setNothingToAttach } from "@/server/actions/booking-confirmation";

beforeEach(() => {
  vi.clearAllMocks();
  requireRowAccessMock.mockImplementation(async (_kind: string, id: string) => ({
    row: { id, tripId: "trip-1", forkId: null },
    user: { id: "user-1" },
    membership: { role: "member" },
    surpriseOf: null,
  }));
});

describe("setNothingToAttach", () => {
  it.each([
    ["TRANSPORT", "transport", transportUpdateMock],
    ["ACCOMMODATION", "accommodation", accommodationUpdateMock],
    ["ITEM", "item", itemUpdateMock],
  ] as const)("checks %s access as a real-plan row and writes that table", async (kind, rowKind, updateMock) => {
    const result = await setNothingToAttach(kind, "row-1", true);

    expect(result).toEqual({ success: true });
    expect(requireRowAccessMock).toHaveBeenCalledWith(rowKind, "row-1", { realPlanOnly: true });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "row-1" }, data: { nothingToAttach: true } });
  });

  it("clears the flag when given false", async () => {
    await setNothingToAttach("TRANSPORT", "row-1", false);

    expect(transportUpdateMock).toHaveBeenCalledWith({ where: { id: "row-1" }, data: { nothingToAttach: false } });
  });

  it("revalidates the plan and journal of the row's trip", async () => {
    await setNothingToAttach("ITEM", "row-1", true);

    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "journal");
  });

  it("does not write when access is refused", async () => {
    requireRowAccessMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(setNothingToAttach("ACCOMMODATION", "row-1", true)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(accommodationUpdateMock).not.toHaveBeenCalled();
    expect(revalidateTripMock).not.toHaveBeenCalled();
  });
});
