import { existsSync, rmSync, writeFileSync } from "node:fs";
import type { LatLng } from "@/lib/geo";
import type { GeoCandidate, Lookup, VenueMatch } from "@/lib/geocode";
import {
  KINDS,
  MAX_CONSECUTIVE_ERRORS,
  REFUSING,
  errorStreak,
  formatRow,
  hasAnchor,
  verdict,
  type BackfillKind,
  type BackfillVerdict,
  type Out,
  type Plan,
  type PlanRow,
} from "@/lib/backfill-places";

export type Found = GeoCandidate | VenueMatch;

export interface Candidate {
  kind: BackfillKind;
  id: string;
  query: string;
  old: LatLng | null;
  anchor: string;
  was: PlanRow["was"];
  lookup: () => Promise<Lookup<Found>>;
  plan: (found: Found, v: BackfillVerdict) => Pick<PlanRow, "set" | "details">;
}

const matchedOf = (f: Found) => ("matched" in f ? f.matched : undefined);

// An earlier plan is removed before any lookup, so a stopped or crashed run never leaves one behind to execute.
export async function dryRun(candidates: Candidate[], planPath: string, out: Out, now: () => Date = () => new Date()): Promise<Plan | null> {
  const replaced = existsSync(planPath);
  rmSync(planPath, { force: true });

  const tally = new Map(KINDS.map((k) => [k, { scanned: 0, accept: 0, new: 0, "too-far": 0, "address-only": 0, "no-match": 0, error: 0, "no-anchor": 0 }]));
  const streak = errorStreak();
  const rows: PlanRow[] = [];

  for (const c of candidates) {
    const anchored = hasAnchor(c.anchor, c.old);
    const result = anchored ? await c.lookup() : null;
    const found = result?.status === "ok" ? result.candidate : null;
    const matched = found ? matchedOf(found) : undefined;
    const v: BackfillVerdict = !result ? "no-anchor" : result.status === "error" ? "error" : verdict(c.kind, c.old, found && { ...found, matched });
    out.log(formatRow({ kind: c.kind, id: c.id, query: c.query, old: c.old, next: found && { ...found, matched }, verdict: v }));
    const t = tally.get(c.kind)!;
    t.scanned++;
    t[v]++;
    if (result && streak.record(result.status === "error")) {
      out.error(`\n${REFUSING}\nStopped after ${MAX_CONSECUTIVE_ERRORS} failed lookups in a row. No plan written${replaced ? `; the earlier plan at ${planPath} was deleted` : ""}.`);
      return null;
    }
    if (found && (v === "accept" || v === "new")) {
      rows.push({ kind: c.kind, id: c.id, query: c.query, verdict: v, matched: matched ?? null, address: found.address, old: c.old, was: c.was, ...c.plan(found, v) });
    }
  }

  out.log("\nkind · scanned / accept / new / too-far / address-only / no-match / error / no anchor (skipped)");
  for (const k of KINDS) {
    const t = tally.get(k)!;
    out.log(`${k} · ${t.scanned} / ${t.accept} / ${t.new} / ${t["too-far"]} / ${t["address-only"]} / ${t["no-match"]} / ${t.error} / ${t["no-anchor"]}`);
  }

  const plan: Plan = { version: 1, createdAt: now().toISOString(), rows };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const details = rows.filter((r) => r.details).length;
  out.log(`\nPlan: ${rows.length} rows to write, ${details} Enterprise detail calls at execute. Written to ${planPath}`);
  out.log("Read it, then apply it within 24 hours: npm run backfill:places -- --execute");
  return plan;
}
