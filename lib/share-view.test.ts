import { describe, expect, it } from "vitest";
import { scopeCaption, tonightsStay } from "./share-view";

const scope = (over: Partial<Parameters<typeof scopeCaption>[0]> = {}) => ({
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  ...over,
});

describe("scopeCaption", () => {
  it("calls the all-on scope a full itinerary", () => {
    expect(scopeCaption(scope())).toBe("Full itinerary");
  });

  it("calls the all-off scope route & dates only", () => {
    expect(
      scopeCaption(
        scope({
          includeAccommodation: false,
          includeTransport: false,
          includeDailyPlans: false,
        }),
      ),
    ).toBe("Route & dates only");
  });

  it("lists the on dials in a fixed order for a partial scope", () => {
    expect(scopeCaption(scope({ includeTransport: false }))).toBe(
      "Route & dates · Accommodation · Daily plans",
    );
    expect(
      scopeCaption(
        scope({ includeAccommodation: false, includeDailyPlans: false }),
      ),
    ).toBe("Route & dates · Transport");
  });
});

describe("tonightsStay", () => {
  const stay = (checkIn: string, checkOut: string, name = "Hotel") => ({
    checkIn,
    checkOut,
    name,
  });

  it("returns the stay covering tonight", () => {
    const s = stay("2026-12-06", "2026-12-10");
    expect(tonightsStay([s], "2026-12-08")).toBe(s);
  });

  it("includes the check-in day and excludes the check-out day", () => {
    const s = stay("2026-12-06", "2026-12-10");
    expect(tonightsStay([s], "2026-12-06")).toBe(s);
    expect(tonightsStay([s], "2026-12-10")).toBeNull();
  });

  it("prefers the latest check-in when stays genuinely overlap", () => {
    const longStay = stay("2026-12-05", "2026-12-12", "Munich apartment");
    const newStay = stay("2026-12-10", "2026-12-14", "Strasbourg hotel");
    expect(tonightsStay([newStay, longStay], "2026-12-10")).toBe(newStay);
    expect(tonightsStay([newStay, longStay], "2026-12-11")).toBe(newStay);
  });

  it("returns null when nothing covers tonight", () => {
    expect(tonightsStay([stay("2026-12-06", "2026-12-10")], "2026-12-20")).toBeNull();
    expect(tonightsStay([], "2026-12-08")).toBeNull();
  });
});
