import { describe, expect, it } from "vitest";
import { nextReviewLabel, runPanelState } from "./run-panel";

const free = { canRun: true, nextAvailableAt: null };
const capped = { canRun: false, nextAvailableAt: new Date("2026-10-22T01:00:00Z") };

describe("runPanelState (R12, decisions 2 and 6)", () => {
  it("Off shows nothing, whatever else is true", () => {
    expect(runPanelState({ permission: "OFF", aiConfigured: true, running: false, allowance: free })).toEqual({ kind: "hidden" });
    expect(runPanelState({ permission: "OFF", aiConfigured: false, running: true, allowance: capped })).toEqual({ kind: "hidden" });
  });
  it("no API key: not set up, before the lock and the cap", () => {
    expect(runPanelState({ permission: "UNLIMITED", aiConfigured: false, running: true, allowance: free })).toEqual({ kind: "not-configured" });
  });
  it("one running on the Trip: busy, before the cap", () => {
    expect(runPanelState({ permission: "LIMITED", aiConfigured: true, running: true, allowance: capped })).toEqual({ kind: "busy" });
  });
  it("Limited at the cap carries when the next one is available", () => {
    expect(runPanelState({ permission: "LIMITED", aiConfigured: true, running: false, allowance: capped })).toEqual({ kind: "capped", nextAvailableAt: "2026-10-22T01:00:00.000Z" });
  });
  it("otherwise ready", () => {
    expect(runPanelState({ permission: "LIMITED", aiConfigured: true, running: false, allowance: free })).toEqual({ kind: "ready" });
    expect(runPanelState({ permission: "UNLIMITED", aiConfigured: true, running: false, allowance: free })).toEqual({ kind: "ready" });
  });
});

/**
 * nextReviewLabel is lib/review-permission.ts's (P.4), re-exported here (see
 * run-panel.ts) rather than redefined with the brief's assumed "later
 * today" wording, which disagrees with P's shipped, tested "today at
 * HH:MM". Its full behaviour (every day-count branch, the timezone
 * fallback) is already covered by lib/review-permission.test.ts; this just
 * proves the re-export is wired to the real function.
 */
describe("nextReviewLabel (re-exported from lib/review-permission, P.4)", () => {
  it("is P's function, wording and all", () => {
    // 13:00 UTC is 23:00 Sunday in Brisbane: still today there (matches lib/review-permission.test.ts).
    expect(nextReviewLabel(new Date("2026-10-18T13:00:00Z"), new Date("2026-10-18T10:00:00Z"), "Australia/Brisbane")).toBe("Next Review available today at 23:00");
  });
});
