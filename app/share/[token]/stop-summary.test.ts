import { describe, it, expect } from "vitest";
import { stopSummary } from "./stop-summary";

const stays = [
  { name: "Late Inn", checkIn: "2026-12-08" },
  { name: "Platzl Hotel", checkIn: "2026-12-06" },
  { name: "Mid Hostel", checkIn: "2026-12-07" },
];
const on = { includeAccommodation: true, includeDailyPlans: true, country: "Germany" };

describe("stopSummary", () => {
  it("names the first stay by check-in, with +N for the rest, then the plans", () => {
    expect(stopSummary({ ...on, stays, plans: 7 })).toBe("Platzl Hotel +2 · 7 plans");
  });

  it("says 1 plan in the singular and leaves out 0 plans", () => {
    expect(stopSummary({ ...on, stays: [stays[1]], plans: 1 })).toBe("Platzl Hotel · 1 plan");
    expect(stopSummary({ ...on, stays: [stays[1]], plans: 0 })).toBe("Platzl Hotel");
  });

  it("leaves out the stay when the link does not include accommodation", () => {
    expect(stopSummary({ ...on, includeAccommodation: false, stays, plans: 3 })).toBe("3 plans");
  });

  it("leaves out the plans when the link does not include daily plans", () => {
    expect(stopSummary({ ...on, includeDailyPlans: false, stays: [stays[1]], plans: 3 })).toBe("Platzl Hotel");
  });

  it("falls back to the country when neither is available, else to nothing", () => {
    expect(stopSummary({ ...on, stays: [], plans: 0 })).toBe("Germany");
    expect(stopSummary({ ...on, includeAccommodation: false, includeDailyPlans: false, stays, plans: 9 })).toBe("Germany");
    expect(stopSummary({ ...on, country: null, stays: [], plans: 0 })).toBeNull();
  });
});
