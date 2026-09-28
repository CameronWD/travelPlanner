import { describe, it, expect } from "vitest";
import { assignTripHues, TRIP_HUE_RAMP } from "./trip-colour";

const t = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

describe("assignTripHues", () => {
  it("hands out the ramp in createdAt order, coral first", () => {
    const hues = assignTripHues([t("b", "2026-02-01"), t("a", "2026-01-01"), t("c", "2026-03-01")]);
    expect(hues.get("a")).toBe("coral");
    expect(hues.get("b")).toBe("teal");
    expect(hues.get("c")).toBe("leaf");
  });
  it("is stable however the input is ordered", () => {
    const x = assignTripHues([t("a", "2026-01-01"), t("b", "2026-02-01")]);
    const y = assignTripHues([t("b", "2026-02-01"), t("a", "2026-01-01")]);
    expect([...x.entries()]).toEqual([...y.entries()].sort());
  });
  it("wraps after eight", () => {
    const trips = Array.from({ length: 9 }, (_, i) => t(`t${i}`, `2026-01-0${i + 1}`.slice(0, 10)));
    const hues = assignTripHues(trips);
    expect(hues.get("t8")).toBe(TRIP_HUE_RAMP[0]);
    expect(hues.size).toBe(9);
  });
  it("never uses stone", () => {
    expect(TRIP_HUE_RAMP).not.toContain("stone");
    expect(TRIP_HUE_RAMP).toHaveLength(8);
  });
});
