import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadBookingConfirmationsToAdd } = vi.hoisted(() => ({ loadBookingConfirmationsToAdd: vi.fn() }));
vi.mock("@/lib/booking-confirmations-loader", () => ({ loadBookingConfirmationsToAdd }));

import { loadNeedsConfirmation } from "./confirmations";

describe("loadNeedsConfirmation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is the ids the viewer is asked to add a confirmation for", async () => {
    loadBookingConfirmationsToAdd.mockResolvedValue([{ kind: "TRANSPORT", id: "t1" }, { kind: "ITEM", id: "i1" }]);
    expect(await loadNeedsConfirmation("trip-1", "u1")).toEqual(new Set(["t1", "i1"]));
    expect(loadBookingConfirmationsToAdd).toHaveBeenCalledWith("trip-1", "u1");
  });

  it("asks for nothing without a viewer", async () => {
    expect(await loadNeedsConfirmation("trip-1", null)).toEqual(new Set());
    expect(loadBookingConfirmationsToAdd).not.toHaveBeenCalled();
  });
});
