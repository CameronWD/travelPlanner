import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dryRun, type Candidate } from "@/lib/backfill-places-dry-run";
import { plannedSet, readPlan } from "@/lib/backfill-places";

const FOUND = { name: "Ichiran", lat: 35.6615, lng: 139.7005, city: null, country: "Japan", countryCode: "jp", placeId: "ChIJVenue", address: "1F 1-22-7 Jinnan", matched: "venue" as const };

function candidate(id: string, lookup: Candidate["lookup"]): Candidate {
  return {
    kind: "item",
    id,
    query: "Ichiran, Shibuya",
    old: null,
    anchor: "Shibuya",
    was: { title: "Ichiran", address: "Shibuya" },
    lookup,
    plan: (f) => ({ set: plannedSet("item", f), details: true }),
  };
}

const ok = async () => ({ status: "ok" as const, candidate: FOUND });
const failed = async () => ({ status: "error" as const });

let dir: string;
let planPath: string;
let lines: string[];
const out = { log: (l: string) => lines.push(l), error: (l: string) => lines.push(l) };

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "backfill-"));
  planPath = path.join(dir, "backfill-places-plan.json");
  lines = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("dryRun", () => {
  it("writes a plan of the rows it would write, with the text each was looked up by", async () => {
    const plan = await dryRun([candidate("i1", ok)], planPath, out, () => new Date("2026-10-30T02:00:00Z"));
    expect(plan?.rows).toHaveLength(1);
    const read = readPlan(readFileSync(planPath, "utf8"), new Date("2026-10-30T03:00:00Z"));
    expect(read).toMatchObject({ ok: true, plan: { rows: [{ id: "i1", verdict: "new", matched: "venue", was: { title: "Ichiran", address: "Shibuya" }, details: true }] } });
  });

  it("stopped by 5 failed lookups in a row, it writes no plan and deletes an earlier one", async () => {
    writeFileSync(planPath, "an earlier plan");
    const candidates = [candidate("i0", ok), ...Array.from({ length: 5 }, (_, i) => candidate(`e${i}`, failed)), candidate("never", ok)];
    expect(await dryRun(candidates, planPath, out)).toBeNull();
    expect(existsSync(planPath)).toBe(false);
    expect(lines.join("\n")).toContain("Google is refusing lookups: check the Geocoding/Places quotas.");
    expect(lines.join("\n")).toContain(`the earlier plan at ${planPath} was deleted`);
    expect(lines.some((l) => l.includes("never"))).toBe(false);
  });

  it("a failed lookup prints ERROR and stays out of the plan", async () => {
    const plan = await dryRun([candidate("e1", failed), candidate("i1", ok)], planPath, out);
    expect(lines[0]).toMatch(/· ERROR$/);
    expect(plan?.rows.map((r) => r.id)).toEqual(["i1"]);
  });
});
