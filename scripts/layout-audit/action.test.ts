import { describe, expect, it } from "vitest";
import { ACTION_FLOWS, ADD_ITEM_RECIPES, mergeAction, splitShifts, summariseAction, type ActionShiftResult } from "./action";
import { ROUTES } from "./config";
import type { ShiftEntry } from "./loading";
import { isSubmitLabel } from "./overlays";

const entry = (value: number, t: number, input: boolean): ShiftEntry => ({ value, t, input, sources: [] });

describe("splitShifts", () => {
  it("puts input-driven shifts in during and the rest in late", () => {
    const a = entry(0.1, 100, true);
    const b = entry(0.2, 1800, false);
    const c = entry(0.05, 300, true);
    expect(splitShifts([a, b, c])).toEqual({ during: [a, c], late: [b] });
  });
});

describe("summariseAction", () => {
  it("counts the input-driven shifts in during instead of dropping them", () => {
    const { during, late } = summariseAction([entry(0.1, 100, true), entry(0.05, 300, true), entry(0.2, 1800, false)]);
    expect(during).toMatchObject({ total: 0.15, shifts: 2 });
    expect(during.largest.map((s) => s.value)).toEqual([0.1, 0.05]);
    expect(late).toMatchObject({ total: 0.2, shifts: 1 });
  });
});

describe("ACTION_FLOWS", () => {
  it("has exactly the five flows, each on a route the audit knows", () => {
    expect(ACTION_FLOWS.map((f) => f.id).sort()).toEqual(["checklist-tick", "cost-add", "item-add", "mark-paid", "vote"]);
    const known = new Set(ROUTES.map((r) => r.label));
    for (const f of ACTION_FLOWS) expect(known.has(f.routeLabel)).toBe(true);
  });
  it("acts where the brief says", () => {
    expect(Object.fromEntries(ACTION_FLOWS.map((f) => [f.id, f.routeLabel]))).toEqual({
      "checklist-tick": "checklists",
      "item-add": "day",
      "cost-add": "budget",
      vote: "wishlist",
      "mark-paid": "budget",
    });
  });
});

describe("ADD_ITEM_RECIPES", () => {
  it("only open the Add Item dialog: no step clicks a submit", () => {
    for (const recipe of Object.values(ADD_ITEM_RECIPES)) {
      expect(recipe.expect).toEqual({ role: "dialog", name: "Add Item" });
      for (const step of recipe.steps) if ("click" in step) expect(isSubmitLabel(step.click.name)).toBe(false);
    }
  });
});

describe("mergeAction", () => {
  const result = (flow: string, profile: string, late: number): ActionShiftResult => ({
    id: `action/${flow}/${profile}`,
    flow,
    profile,
    during: { total: 0, shifts: 0, largest: [] },
    late: { total: late, shifts: 0, largest: [] },
    undone: true,
  });
  it("replaces a re-run flow by id and keeps the rest", () => {
    const merged = mergeAction([result("vote", "1440", 0.1), result("vote", "iphone17-pwa", 0.2)], [result("vote", "1440", 0), result("cost-add", "1440", 0.3)]);
    expect(merged.map((r) => [r.id, r.late.total])).toEqual([
      ["action/vote/1440", 0],
      ["action/vote/iphone17-pwa", 0.2],
      ["action/cost-add/1440", 0.3],
    ]);
  });
});
