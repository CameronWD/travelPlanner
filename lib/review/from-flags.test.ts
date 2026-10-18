import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Flag } from "@/lib/flags";
import { flagsToFindings } from "./from-flags";

describe("flagsToFindings (R8: current Flags restated as Findings)", () => {
  it("keeps severity, target and message; the rule names the category and title", () => {
    const flags: Flag[] = [
      { id: "item-closed-i1", severity: "warning", message: "Lello is closed on Mondays.", targetType: "ITEM", targetId: "i1", date: "2027-06-07", stopId: "s1" },
      { id: "still-to-book-t1", severity: "info", message: "The train from Porto to Lisbon is still to book.", targetType: "TRANSPORT", targetId: "t1" },
      { id: "packed-day-2027-06-08", severity: "warning", message: "Seven things on one day.", targetType: "DAY", date: "2027-06-08" },
      { id: "hard-end-over", severity: "warning", message: "The plan runs past the end date.", targetType: "TRIP" },
    ];
    expect(flagsToFindings(flags)).toEqual([
      { severity: "warning", category: "CLOSURE", targetType: "ITEM", targetId: "i1", date: "2027-06-07", title: "Closed that day", detail: "Lello is closed on Mondays.", origin: "FLAG", flagId: "item-closed-i1" },
      { severity: "info", category: "BOOKING", targetType: "TRANSPORT", targetId: "t1", title: "Still to book", detail: "The train from Porto to Lisbon is still to book.", origin: "FLAG", flagId: "still-to-book-t1" },
      { severity: "warning", category: "LOGISTICS", targetType: "DAY", date: "2027-06-08", title: "Packed day", detail: "Seven things on one day.", origin: "FLAG", flagId: "packed-day-2027-06-08" },
      { severity: "warning", category: "LOGISTICS", targetType: "TRIP", title: "Past the end date", detail: "The plan runs past the end date.", origin: "FLAG", flagId: "hard-end-over" },
    ]);
  });

  it("maps the planning Flags to closure, ticket and booking", () => {
    const cat = (id: string) => flagsToFindings([{ id, severity: "warning", message: "m.", targetType: "ITEM", targetId: "x" }])[0].category;
    expect(cat("item-before-open-x")).toBe("CLOSURE");
    expect(cat("item-after-close-x")).toBe("CLOSURE");
    expect(cat("item-late-slot-x")).toBe("TICKET");
    expect(cat("book-by-overdue-x")).toBe("BOOKING");
    expect(cat("book-by-soon-x")).toBe("BOOKING");
    expect(cat("stop-no-accom-x")).toBe("BOOKING");
    expect(cat("accom-gap-x")).toBe("BOOKING");
  });

  it("every Flag id lib/flags.ts can produce has its own rule (drift guard)", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/flags.ts"), "utf8");
    const ids = new Set<string>();
    for (const m of src.matchAll(/id: `([a-z-]+?)-\$\{/g)) ids.add(`${m[1]}-x`);
    for (const m of src.matchAll(/id: "([a-z-]+)"/g)) ids.add(m[1]);
    for (const m of src.matchAll(/itemFlag\(item, `([a-z-]+?)-\$\{/g)) ids.add(`${m[1]}-x`);
    expect(ids.size).toBeGreaterThanOrEqual(26);
    const unmapped = [...ids].filter((id) => flagsToFindings([{ id, severity: "info", message: "m.", targetType: "TRIP" }])[0].title === "Flag");
    expect(unmapped).toEqual([]);
  });

  it("an unknown Flag still restates, under Logistics", () => {
    expect(flagsToFindings([{ id: "something-new", severity: "info", message: "m.", targetType: "TRIP" }])[0]).toMatchObject({ category: "LOGISTICS", title: "Flag" });
  });

  it("turns a tight connection's retime into an item.times fix on the later Item", () => {
    const [d] = flagsToFindings([{ id: "tight-a-b", severity: "warning", message: "Tight…", targetType: "DAY", date: "2026-12-08",
      retime: { itemId: "b", startTime: "12:35", endTime: "13:35" } }]);
    expect(d).toMatchObject({ targetType: "ITEM", targetId: "b", date: "2026-12-08", flagId: "tight-a-b",
      suggestedFix: { kind: "item.times", itemId: "b", startTime: "12:35", endTime: "13:35" } });
  });

  it("keeps a tight connection with no retime about its day, with no fix", () => {
    const [d] = flagsToFindings([{ id: "tight-a-b", severity: "info", message: "…", targetType: "DAY", date: "2026-12-08" }]);
    expect(d.targetType).toBe("DAY");
    expect(d.suggestedFix).toBeUndefined();
  });
});
