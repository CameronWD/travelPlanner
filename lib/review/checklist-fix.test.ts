import { describe, expect, it } from "vitest";
import { CHECKLIST_FIX_COPY, planChecklistFix, sameEntryText } from "./checklist-fix";

const fix = (list: "PACKING" | "PRETRIP", text = "Umbrella") => ({ kind: "checklist.add" as const, list, text });

describe("planChecklistFix (spec 2026-10-18 A2 duplicate guard)", () => {
  it("adds when nothing matches", () => expect(planChecklistFix(fix("PACKING"), "PACK", [])).toEqual({ kind: "add", buy: null }));
  it("adds marked Need to buy for BUY", () => expect(planChecklistFix(fix("PACKING"), "BUY", [])).toEqual({ kind: "add", buy: "NEEDED" }));
  it("matches ignoring case and spaces", () =>
    expect(planChecklistFix(fix("PACKING"), "PACK", [{ id: "c1", text: "  umbrella ", done: false, buy: null }])).toEqual({
      kind: "already",
      itemId: "c1",
      copy: CHECKLIST_FIX_COPY.alreadyPacking,
    }));
  it("marks an unmarked existing entry for BUY", () =>
    expect(planChecklistFix(fix("PACKING"), "BUY", [{ id: "c1", text: "Umbrella", done: true, buy: null }])).toEqual({ kind: "mark", itemId: "c1" }));
  it("is already there when marked (NEEDED or BOUGHT)", () => {
    for (const buy of ["NEEDED", "BOUGHT"]) {
      expect(planChecklistFix(fix("PACKING"), "BUY", [{ id: "c1", text: "Umbrella", done: false, buy }])).toEqual({
        kind: "already",
        itemId: "c1",
        copy: CHECKLIST_FIX_COPY.alreadyBoth,
      });
    }
  });
  it("prefers an already marked duplicate over marking another", () =>
    expect(
      planChecklistFix(fix("PACKING"), "BUY", [
        { id: "c1", text: "Umbrella", done: false, buy: null },
        { id: "c2", text: "umbrella", done: false, buy: "NEEDED" },
      ]),
    ).toEqual({ kind: "already", itemId: "c2", copy: CHECKLIST_FIX_COPY.alreadyBoth }));
  it("Pre-trip ignores the choice", () => expect(planChecklistFix(fix("PRETRIP", "Buy pass"), "BUY", [])).toEqual({ kind: "add", buy: null }));
  it("a Pre-trip duplicate is already there", () =>
    expect(planChecklistFix(fix("PRETRIP", "Buy pass"), "PACK", [{ id: "p1", text: "buy  pass", done: true, buy: null }])).toEqual({
      kind: "already",
      itemId: "p1",
      copy: CHECKLIST_FIX_COPY.alreadyPretrip,
    }));
});

describe("sameEntryText", () => {
  it("trims, lower-cases and collapses inner whitespace", () => {
    expect(sameEntryText("  Rain  Jacket ", "rain jacket")).toBe(true);
    expect(sameEntryText("Rain jacket", "Rain jackets")).toBe(false);
  });
});

it("copy never uses an em-dash", () => {
  for (const text of Object.values(CHECKLIST_FIX_COPY)) expect(text).not.toMatch(/—/);
});
