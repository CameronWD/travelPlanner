import { describe, expect, it } from "vitest";
import type { FindingDraft } from "./types";
import { matchFindings, type PreviousFinding } from "./match";

const T0 = new Date("2026-10-01T09:00:00Z");
const AT = new Date("2026-10-02T09:00:00Z");

const draft = (over: Partial<FindingDraft>): FindingDraft => ({
  severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "a", title: "Closed", detail: "d", origin: "MODEL", ...over,
});
const prev = (over: Partial<PreviousFinding> & { id: string; key: string }): PreviousFinding => ({
  title: "Closed", state: "OPEN", stateById: null, stateAt: null, firstFoundAt: T0, ...over,
});

describe("matchFindings (R10)", () => {
  it("with no previous Review every draft is new and Open", () => {
    const { findings, goneIds } = matchFindings([], [draft({}), draft({ targetId: "b" })]);
    expect(findings.map((f) => [f.key, f.state, f.previousId, f.firstFoundAt])).toEqual([
      ["CLOSURE|ITEM|a", "OPEN", null, null],
      ["CLOSURE|ITEM|b", "OPEN", null, null],
    ]);
    expect(goneIds).toEqual([]);
  });

  it("a Dismissed Finding found again stays Dismissed, keeping who and when", () => {
    const { findings } = matchFindings([prev({ id: "p1", key: "CLOSURE|ITEM|a", state: "DISMISSED", stateById: "xanni", stateAt: AT })], [draft({ title: "Closed on Mondays" })]);
    expect(findings[0]).toMatchObject({ state: "DISMISSED", stateById: "xanni", stateAt: AT, previousId: "p1", firstFoundAt: T0 });
  });

  it("an Applied Finding found again is Open (its fix didn't hold)", () => {
    const { findings } = matchFindings([prev({ id: "p1", key: "CLOSURE|ITEM|a", state: "APPLIED", stateById: "cam", stateAt: AT })], [draft({})]);
    expect(findings[0]).toMatchObject({ state: "OPEN", stateById: null, stateAt: null, previousId: "p1", firstFoundAt: T0 });
  });

  it("an Open Finding found again is still Open, and carries when it was first found", () => {
    const { findings, goneIds } = matchFindings([prev({ id: "p1", key: "CLOSURE|ITEM|a" })], [draft({})]);
    expect(findings[0]).toMatchObject({ state: "OPEN", previousId: "p1", firstFoundAt: T0 });
    expect(goneIds).toEqual([]);
  });

  it("an unmatched Open Finding is No longer found; unmatched Dismissed and Applied ones keep their state", () => {
    const { goneIds } = matchFindings(
      [
        prev({ id: "open", key: "TICKET|ITEM|c" }),
        prev({ id: "dismissed", key: "SEASON|ITEM|d", state: "DISMISSED", stateById: "x", stateAt: AT }),
        prev({ id: "applied", key: "BOOKING|ITEM|e", state: "APPLIED", stateById: "x", stateAt: AT }),
        prev({ id: "open2", key: "PACKING|TRIP|-" }),
      ],
      [],
    );
    expect(goneIds).toEqual(["open", "open2"]);
  });

  it("matches one-to-one: same key and title first, then by key in order", () => {
    const previous = [
      prev({ id: "p-hours", key: "CLOSURE|ITEM|a", title: "Shorter winter hours", state: "DISMISSED", stateById: "x", stateAt: AT }),
      prev({ id: "p-closed", key: "CLOSURE|ITEM|a", title: "Closed for renovation" }),
    ];
    const { findings, goneIds } = matchFindings(previous, [
      draft({ title: "Closed for renovation" }),
      draft({ title: "Winter hours are shorter" }),
      draft({ title: "A third closure on the same Item" }),
    ]);
    expect(findings.map((f) => [f.previousId, f.state])).toEqual([
      ["p-closed", "OPEN"],
      ["p-hours", "DISMISSED"],
      [null, "OPEN"],
    ]);
    expect(goneIds).toEqual([]);
  });

  it("a restated Flag matches only itself", () => {
    const previous = [prev({ id: "p-before", key: "CLOSURE|ITEM|a|item-before-open-a", state: "DISMISSED", stateById: "x", stateAt: AT })];
    const { findings, goneIds } = matchFindings(previous, [draft({ origin: "FLAG", flagId: "item-after-close-a", title: "After closing" })]);
    expect(findings[0]).toMatchObject({ previousId: null, state: "OPEN" });
    expect(goneIds).toEqual([]); // the dismissed Before-opening Finding keeps its state
  });
});
