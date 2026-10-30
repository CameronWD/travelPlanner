import { describe, expect, it } from "vitest";
import { refreshOrder } from "./travel-times-order";

describe("refreshOrder", () => {
  it("puts upcoming, current and undated Trips first, finished Trips last, otherwise keeping the order given", () => {
    const trips = [
      { id: "done", endDate: "2026-09-01" },
      { id: "idea", endDate: null },
      { id: "now", endDate: "2026-10-30" },
      { id: "older", endDate: "2025-01-01" },
      { id: "next", endDate: "2027-03-01" },
    ];
    expect(refreshOrder(trips, "2026-10-30").map((t) => t.id)).toEqual(["idea", "now", "next", "done", "older"]);
  });
});
