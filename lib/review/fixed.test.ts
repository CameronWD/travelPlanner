import { describe, expect, it } from "vitest";
import type { Flag } from "@/lib/flags";
import { shownState } from "./fixed";

describe("shownState (spec 2026-10-18 A4: Fixed in the plan)", () => {
  const flag = { id: "empty-day-2026-12-08", severity: "info", message: "", targetType: "DAY", date: "2026-12-08" } as Flag;
  const key = "LOGISTICS|DAY|2026-12-08|empty-day-2026-12-08";

  it("is Fixed in the plan when its Flag no longer fires", () =>
    expect(shownState({ origin: "FLAG", state: "OPEN", key }, new Map())).toEqual({ state: "FIXED", liveFlag: null }));

  it("is Open with its live Flag while it fires", () =>
    expect(shownState({ origin: "FLAG", state: "OPEN", key }, new Map([[flag.id, flag]]))).toEqual({ state: "OPEN", liveFlag: flag }));

  it("never when the live Flags are unknown (a Trip without dates)", () =>
    expect(shownState({ origin: "FLAG", state: "OPEN", key }, null).state).toBe("OPEN"));

  it("never for a key with no Flag id", () =>
    expect(shownState({ origin: "FLAG", state: "OPEN", key: "LOGISTICS|DAY|2026-12-08" }, new Map()).state).toBe("OPEN"));

  it("never for a model Finding, or one Dismissed or Applied", () => {
    expect(shownState({ origin: "MODEL", state: "OPEN", key }, new Map()).state).toBe("OPEN");
    expect(shownState({ origin: "FLAG", state: "DISMISSED", key }, new Map()).state).toBe("DISMISSED");
    expect(shownState({ origin: "FLAG", state: "APPLIED", key }, new Map()).state).toBe("APPLIED");
  });

  it.each([
    ["book-by-soon-t1", "book-by-overdue-t1", "BOOKING|TRANSPORT|t1|book-by-soon-t1"],
    ["hard-end-approaching", "hard-end-over", "LOGISTICS|TRIP|-|hard-end-approaching"],
  ])("stays Open when %s has worsened into %s, with the worse Flag", (_from, to, k) => {
    const worse = { id: to, severity: "warning", message: "", targetType: "TRIP" } as Flag;
    expect(shownState({ origin: "FLAG", state: "OPEN", key: k }, new Map([[to, worse]]))).toEqual({ state: "OPEN", liveFlag: worse });
  });
});
