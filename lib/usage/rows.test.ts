import { describe, expect, it } from "vitest";
import { batchTripIds, prepareUsageRows, usageSite } from "./rows";
import type { UsageInput } from "./validate";

const AT = new Date("2026-12-01T12:00:00Z");

function screen(tripId: string | null, extra: Partial<UsageInput> = {}): UsageInput {
  return {
    screen: tripId ? "plan" : "trips",
    action: null,
    detail: null,
    tripId,
    phase: tripId ? "planning" : null,
    mode: "desktop",
    appearMs: null,
    savedCopy: false,
    dayOffset: null,
    occurredAt: AT,
    ...extra,
  };
}

const daySeen = (tripId: string) => screen(tripId, { screen: "day", dayOffset: 2 });
const swiped = (tripId: string): UsageInput => ({ ...screen(tripId), screen: null, action: "day-changed", detail: "swipe", dayOffset: 2 });

function rows(records: UsageInput[], members: string[], surprised: string[] = []) {
  return prepareUsageRows(records, {
    userId: "it-usage-a",
    site: "main",
    memberTripIds: new Set(members),
    surprisedTripIds: new Set(surprised),
  });
}

describe("prepareUsageRows", () => {
  it("adds the user and the site and keeps records with no Trip", () => {
    expect(rows([screen(null)], [])).toEqual([{ ...screen(null), userId: "it-usage-a", site: "main" }]);
  });

  it("drops a Trip the Traveller is not on", () => {
    const out = rows([screen("it-usage-trip"), screen("it-usage-other")], ["it-usage-trip"]);
    expect(out.map((r) => r.tripId)).toEqual(["it-usage-trip"]);
  });

  it("drops a sixth Trip's records even when the Traveller is on it", () => {
    const ids = ["t1", "t2", "t3", "t4", "t5", "t6"];
    const out = rows([...ids.map((id) => screen(id)), screen("t1")], ids);
    expect(out.map((r) => r.tripId)).toEqual(["t1", "t2", "t3", "t4", "t5", "t1"]);
  });

  it("a surprised Trip's Day screen and day change lose the offset and keep the method", () => {
    const out = rows([daySeen("it-usage-trip"), swiped("it-usage-trip"), daySeen("it-usage-other")], ["it-usage-trip", "it-usage-other"], ["it-usage-trip"]);
    expect(out[0]).toMatchObject({ screen: "day", dayOffset: null });
    expect(out[1]).toMatchObject({ action: "day-changed", detail: "swipe", dayOffset: null });
    expect(out[2]).toMatchObject({ tripId: "it-usage-other", screen: "day", dayOffset: 2 });
  });

  it("every row has exactly the table's columns", () => {
    expect(Object.keys(rows([daySeen("it-usage-trip")], ["it-usage-trip"])[0]).sort()).toEqual(
      ["action", "appearMs", "dayOffset", "detail", "mode", "occurredAt", "phase", "savedCopy", "screen", "site", "tripId", "userId"],
    );
  });
});

describe("batchTripIds", () => {
  it("is the distinct Trips in order of first appearance, at most five", () => {
    const ids = ["t3", "t1", "t3", "t2", "t4", "t5", "t6"];
    expect(batchTripIds([screen(null), ...ids.map((id) => screen(id))])).toEqual(["t3", "t1", "t2", "t4", "t5"]);
  });
});

describe("usageSite", () => {
  it("uses the Feedback note's detection, folded onto the closed list", () => {
    expect(usageSite({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toBe("main");
    expect(usageSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "beta" })).toBe("beta");
    expect(usageSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/usage" })).toBe("preview");
    expect(usageSite({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "Northvale café" })).toBe("preview");
    expect(usageSite({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(usageSite({})).toBe("local");
  });
});
