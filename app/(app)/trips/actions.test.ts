import { describe, it, expect, vi } from "vitest";

const { createTripMock } = vi.hoisted(() => ({ createTripMock: vi.fn() }));
vi.mock("@/server/actions/trips", () => ({ createTrip: createTripMock }));

import { startFirstTrip } from "./actions";

describe("startFirstTrip", () => {
  it("creates with the default currency and no dates", async () => {
    createTripMock.mockResolvedValue({ success: true, tripId: "t1" });
    await startFirstTrip("  Japan in spring ");
    expect(createTripMock).toHaveBeenCalledWith({ name: "Japan in spring", homeCurrency: "AUD" }, null);
  });
  it("returns the validation failure", async () => {
    createTripMock.mockResolvedValue({ success: false, errors: { name: ["Trip name is required"] } });
    const r = await startFirstTrip("");
    expect(r).toEqual({ success: false, errors: { name: ["Trip name is required"] } });
  });
});
