import { describe, expect, it } from "vitest";
import { ROUTES } from "./config";
import { mergeSwitch, SWITCH_PAIRS, type SwitchResult } from "./switch";

const result = (from: string, to: string, profile: string, cls: number): SwitchResult => ({
  id: `switch/${from}-${to}/${profile}`,
  from,
  to,
  profile,
  cls,
  total: cls,
  shifts: 0,
  largest: [],
});

describe("SWITCH_PAIRS", () => {
  it("has no pair twice", () => {
    const ids = SWITCH_PAIRS.map((p) => `${p.from}-${p.to}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("names only routes the audit knows, apart from the derived next day", () => {
    const known = new Set([...ROUTES.map((r) => r.label), "day-next"]);
    for (const p of SWITCH_PAIRS) {
      expect(known.has(p.from)).toBe(true);
      expect(known.has(p.to)).toBe(true);
    }
    expect(ROUTES.some((r) => r.label === "day-next")).toBe(false);
  });
  it("goes both ways between neighbours", () => {
    expect(SWITCH_PAIRS).toContainEqual({ from: "home", to: "plan" });
    expect(SWITCH_PAIRS).toContainEqual({ from: "plan", to: "home" });
    expect(SWITCH_PAIRS).toContainEqual({ from: "day", to: "day-next" });
    expect(SWITCH_PAIRS).toContainEqual({ from: "day-next", to: "day" });
    expect(SWITCH_PAIRS).toContainEqual({ from: "trips", to: "home" });
    expect(SWITCH_PAIRS).toContainEqual({ from: "account", to: "trips" });
  });
});

describe("mergeSwitch", () => {
  it("replaces a re-run pair by id and keeps the rest", () => {
    const prev = [result("home", "plan", "iphone17-pwa", 0.1), result("home", "plan", "1440", 0.2)];
    const merged = mergeSwitch(prev, [result("home", "plan", "1440", 0), result("plan", "home", "1440", 0.3)]);
    expect(merged.map((r) => [r.id, r.cls])).toEqual([
      ["switch/home-plan/iphone17-pwa", 0.1],
      ["switch/home-plan/1440", 0],
      ["switch/plan-home/1440", 0.3],
    ]);
  });
});
