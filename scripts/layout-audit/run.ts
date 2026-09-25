/**
 * Pure helpers for the layout audit's entry script (scripts/layout-audit.ts):
 * the manifest's shape, where each capture's screenshots go, the
 * LAYOUT_AUDIT_ONLY filter, the console summary and the exit code.
 *
 * No Playwright, no network, no filesystem — so the rules that decide
 * whether a run "passed" are unit-tested directly (run.test.ts) rather than
 * only exercised by a live run.
 */

import * as path from "node:path";

import type { Theme } from "../lib/audit-browser";
import type { AutoFinding } from "./checks";
import type { CaptureSpec, PhaseName, TripKey } from "./config";

// --------------------------------------------------------------------------
// The manifest (<out>/manifest.json)
// --------------------------------------------------------------------------

export interface CaptureRecord {
  id: string;
  set: CaptureSpec["set"];
  /** The path actually visited (e.g. `/trips/<id>/plan`); still the template
   * (`/day/{date}`, `/share/{token}`) when the capture was skipped before it
   * could be resolved. */
  route: string;
  routeLabel: string;
  trip: TripKey;
  tripId?: string;
  phase?: PhaseName | null;
  width: number;
  theme: Theme;
  media: "screen" | "print";
  overlay?: string;
  keyboard?: boolean;
  /** Absolute PNG paths. Pages: the slices top to bottom, then the
   * `-end.png` viewport shot at the page end (fixed chrome shown) last.
   * Overlays: the one viewport shot. */
  files: string[];
  markerCount?: number;
  elementCount: number;
  findings: number;
  error?: string;
  skipped?: string;
  ms: number;
}

export interface Gap {
  /** A trip key ("travelling"), "share", or "overlay:<id>". */
  key: string;
  reason: string;
  /** Set on per-capture gaps (overlays); run-level gaps (trips, share)
   * have none. Lets a filtered re-run replace exactly its own gaps. */
  captureId?: string;
}

export interface Manifest {
  startedAt: string;
  finishedAt: string;
  baseUrl: string;
  outDir: string;
  trips: Record<string, string>;
  gaps: Gap[];
  captures: CaptureRecord[];
}

// --------------------------------------------------------------------------
// Screenshot locations — the contract Task 8 and the review steps read
// --------------------------------------------------------------------------

/**
 * `<out>/shots/<set>/<routeLabel>/<trip>/<width>-<theme>[-kbd]` for page
 * captures; `<out>/shots/overlay/<overlayId>/<width>-<theme>[-kbd]` for
 * overlay captures. `captureSlices` appends `.png` (or `-partN.png`) per
 * slice, then `-end.png`; `captureViewport` (overlays) appends `.png`.
 */
export function shotLocation(outDir: string, spec: CaptureSpec): { dir: string; baseName: string } {
  const baseName = `${spec.width}-${spec.theme}${spec.keyboard ? "-kbd" : ""}`;
  const dir =
    spec.overlay !== undefined
      ? path.join(outDir, "shots", "overlay", spec.overlay)
      : path.join(outDir, "shots", spec.set, spec.route.label, spec.trip);
  return { dir, baseName };
}

// --------------------------------------------------------------------------
// LAYOUT_AUDIT_ONLY
// --------------------------------------------------------------------------

/** Keeps captures whose id contains the filter. A comma separates
 * alternatives ("deep/plan/,overlay/stop-add/"); ids never contain commas.
 * Unset or blank keeps everything. Ids mirror the shot folders:
 * `deep/plan/deep/390-light`, `overlay/stop-add/360-light-kbd`. */
export function filterCaptures(specs: CaptureSpec[], only: string | undefined): CaptureSpec[] {
  const needles = (only ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (needles.length === 0) return specs;
  return specs.filter((s) => needles.some((n) => s.id.includes(n)));
}

// --------------------------------------------------------------------------
// Merging a filtered re-run into an existing out dir
// --------------------------------------------------------------------------

/**
 * A LAYOUT_AUDIT_ONLY re-run into an out dir that already holds a manifest
 * must not throw the earlier run away. Re-run captures replace their old
 * records in place (new ids are appended) and their old findings; per-
 * capture gaps are replaced by capture id; run-level gaps are replaced for
 * the keys this run re-evaluated (`evaluatedKeys` — the trips always, the
 * share link only when a share capture was in the filter) and kept
 * otherwise.
 */
export function mergeRerun(
  prev: { manifest: Manifest; findings: AutoFinding[] },
  next: { manifest: Manifest; findings: AutoFinding[] },
  evaluatedKeys: string[],
): { manifest: Manifest; findings: AutoFinding[] } {
  const rerun = new Map(next.manifest.captures.map((c) => [c.id, c]));
  const prevIds = new Set(prev.manifest.captures.map((c) => c.id));
  const captures = [
    ...prev.manifest.captures.map((c) => rerun.get(c.id) ?? c),
    ...next.manifest.captures.filter((c) => !prevIds.has(c.id)),
  ];

  const evaluated = new Set(evaluatedKeys);
  const kept = prev.manifest.gaps.filter((g) => (g.captureId ? !rerun.has(g.captureId) : !evaluated.has(g.key)));
  const gaps = [...kept, ...next.manifest.gaps].sort((a, b) => Number(Boolean(a.captureId)) - Number(Boolean(b.captureId)));

  return {
    manifest: {
      ...next.manifest,
      startedAt: prev.manifest.startedAt,
      trips: { ...prev.manifest.trips, ...next.manifest.trips },
      gaps,
      captures,
    },
    findings: [...prev.findings.filter((f) => !rerun.has(f.captureId)), ...next.findings],
  };
}

// --------------------------------------------------------------------------
// Pass / fail
// --------------------------------------------------------------------------

/**
 * 1 when the run proves nothing or something broke: no captures at all
 * (also what a LAYOUT_AUDIT_ONLY typo produces), every capture skipped (no
 * screenshot was taken), any capture errored, or any capture that ran
 * measured zero elements — the "broken probe reports success" trap from
 * contrast-audit.ts. Skipped captures (n/a routes, coverage gaps) and
 * findings do not fail Stage 1: gaps are printed loudly by `summarise`, and
 * findings are for the reviewers to grade.
 */
export function exitCodeFor(m: Manifest): 0 | 1 {
  return failureReasons(m).length === 0 ? 0 : 1;
}

/** Why exitCodeFor(m) is 1 — empty exactly when it is 0, so the printed
 * RESULT line and the exit code can't disagree. */
function failureReasons(m: Manifest): string[] {
  const ran = m.captures.filter((c) => !c.skipped);
  if (ran.length === 0) return ["nothing was captured"];
  const reasons: string[] = [];
  const errored = m.captures.filter((c) => c.error !== undefined).length;
  const zero = ran.filter((c) => c.error === undefined && c.elementCount === 0).length;
  if (errored > 0) reasons.push(`${errored} errored`);
  if (zero > 0) reasons.push(`${zero} zero-element`);
  return reasons;
}

/** Failure reasons that belong to this run alone, beyond the merged
 * manifest's. A re-run's errored / zero-element records are merged in, so
 * they already show in the manifest; what the merge hides is a run that
 * captured nothing — the merged manifest is then just the previous run's. */
function ownFailureReasons(thisRun: Manifest, merged: Manifest): string[] {
  if (thisRun === merged || thisRun.captures.some((c) => !c.skipped)) return [];
  return thisRun.captures.length === 0
    ? ["this run matched no captures (a LAYOUT_AUDIT_ONLY typo?)"]
    : [`this run's ${thisRun.captures.length} capture(s) were all skipped`];
}

/**
 * The exit code for a run whose records were merged into an existing
 * manifest (mergeRerun): 1 if the merged manifest fails, or if this run
 * itself captured nothing. Without the second half, a typo'd
 * LAYOUT_AUDIT_ONLY re-run into a clean out dir merges nothing and exits 0.
 * Pass the same manifest twice when nothing was merged.
 */
export function rerunExitCode(thisRun: Manifest, merged: Manifest): 0 | 1 {
  return exitCodeFor(thisRun) === 1 || exitCodeFor(merged) === 1 ? 1 : 0;
}

// --------------------------------------------------------------------------
// Console summary
// --------------------------------------------------------------------------

function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Multi-line summary: totals, then every ERROR, ZERO-ELEMENT capture and
 * COVERAGE GAP on its own line (these are what a reader must not miss),
 * map captures that found no markers, skip reasons, and finding counts by
 * check. `findings` is optional so the manifest alone still summarises;
 * without it the by-check breakdown is omitted and only the total (summed
 * from the capture records) is shown. `thisRun` is this run's own manifest
 * when `m` is a merge (see rerunExitCode); the RESULT line always agrees
 * with rerunExitCode(thisRun, m).
 */
export function summarise(m: Manifest, findings?: AutoFinding[], thisRun: Manifest = m): string {
  const ran = m.captures.filter((c) => !c.skipped);
  const skipped = m.captures.filter((c) => c.skipped);
  const errored = m.captures.filter((c) => c.error !== undefined);
  const zero = ran.filter((c) => c.error === undefined && c.elementCount === 0);
  const files = m.captures.reduce((n, c) => n + c.files.length, 0);
  const findingTotal = m.captures.reduce((n, c) => n + c.findings, 0);
  const ms = ran.reduce((n, c) => n + c.ms, 0);

  const lines: string[] = [];
  lines.push("=== Layout audit summary ===");
  lines.push(
    `captures: ${m.captures.length} total, ${ran.length - errored.length} captured, ${skipped.length} skipped, ${errored.length} errored`,
  );
  lines.push(
    `screenshots: ${files} file(s); auto findings: ${findingTotal}; ` +
      `capture time: ${(ms / 1000).toFixed(1)}s (${ran.length ? Math.round(ms / ran.length) : 0}ms avg)`,
  );
  lines.push(`out: ${m.outDir}`);

  for (const c of errored) lines.push(`ERROR ${c.id}: ${c.error}`);
  for (const c of zero) lines.push(`ZERO ELEMENTS ${c.id} — the collector measured nothing (broken probe / error page?)`);
  for (const g of m.gaps) lines.push(`COVERAGE GAP ${g.key}: ${g.reason}`);

  const noMarkers = ran.filter((c) => c.markerCount === 0);
  for (const c of noMarkers) lines.push(`no map markers: ${c.id}`);

  if (skipped.length > 0) {
    lines.push("skipped by reason:");
    for (const [reason, n] of countBy(skipped, (c) => c.skipped ?? "")) lines.push(`  ${n} × ${reason}`);
  }

  if (findings && findings.length > 0) {
    lines.push("auto findings by check:");
    for (const [check, n] of countBy(findings, (f) => f.check)) lines.push(`  ${check}: ${n}`);
  }

  // Same verdict as rerunExitCode(thisRun, m), with its reasons.
  const reasons = [...failureReasons(m), ...ownFailureReasons(thisRun, m)];
  lines.push(
    reasons.length === 0
      ? "RESULT: OK — every capture ran (or was skipped with a reason); findings don't fail Stage 1."
      : `RESULT: FAIL — ${reasons.join("; ")}.`,
  );
  return lines.join("\n");
}
