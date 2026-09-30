/**
 * Pure logic for scripts/nav-audit.ts — no Playwright, no DOM — so the
 * "did the page hold?" judgement is unit-tested here and the script only
 * gathers samples.
 */

export interface Sample {
  /** ms since the control was activated */
  t: number;
  url: string;
  h1: string;
  text: string;
  bar: boolean;
  skeleton: boolean;
}

export interface Finding {
  name: string;
  /** hard findings gate the exit code; soft ones are reported only */
  hard: boolean;
  ok: boolean;
  detail: string;
}

/**
 * Every sample taken while the URL is still the old one must show the old
 * page unchanged (its h1 and its text), never a skeleton; the progress bar
 * must be absent before `delayMs` and, when `expectBar`, present at least
 * once after it (the RSC response is being held back long enough).
 */
export function holdViolations(
  before: { h1: string; text: string },
  samples: Sample[],
  opts: { delayMs: number; expectBar: boolean },
): string[] {
  const out: string[] = [];
  const startUrl = samples[0]?.url;
  let barSeenAfterDelay = false;
  for (const s of samples) {
    if (s.url !== startUrl) break; // landed
    if (s.skeleton) out.push(`skeleton at ${s.t}ms`);
    if (s.h1 !== before.h1) out.push(`h1 changed or vanished at ${s.t}ms ("${s.h1}")`);
    else if (s.text !== before.text) out.push(`page text changed at ${s.t}ms`);
    if (s.bar && (s.t < opts.delayMs || !opts.expectBar)) out.push(`progress bar visible at ${s.t}ms`);
    if (s.bar && s.t >= opts.delayMs) barSeenAfterDelay = true;
  }
  if (opts.expectBar && !barSeenAfterDelay) out.push("progress bar never appeared while the navigation was held");
  return out;
}

export function summarise(findings: Finding[]): { exitCode: 0 | 1; lines: string[] } {
  const lines = findings.map((f) => `${f.ok ? "PASS" : f.hard ? "FAIL" : "WARN"}  ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  const exitCode = findings.some((f) => f.hard && !f.ok) ? 1 : 0;
  return { exitCode, lines };
}

export interface Box { x: number; y: number; w: number; h: number }

/** Every box after the first must equal it; the arrows may not move between days (spec 2026-09-28 D2). */
export function arrowDrift(boxes: Box[]): string[] {
  const out: string[] = [];
  const first = boxes[0];
  if (!first) return out;
  boxes.forEach((b, i) => {
    if (i === 0) return;
    for (const k of ["x", "y", "w", "h"] as const) {
      if (b[k] !== first[k]) out.push(`sample ${i + 1} ${k} moved ${first[k]}→${b[k]}`);
    }
  });
  return out;
}

/** The strip must link the Trip's first and last day (spec 2026-09-28 D1). */
export function stripReach(hrefs: string[], first: string, last: string): string[] {
  const out: string[] = [];
  if (!hrefs.some((h) => h.endsWith(`/day/${first}`))) out.push(`first day ${first} not in the strip`);
  if (!hrefs.some((h) => h.endsWith(`/day/${last}`))) out.push(`last day ${last} not in the strip`);
  return out;
}

export interface CutSample {
  t: number;
  /** How many [data-section] wrappers are in the DOM (nested layouts each add one). */
  sections: number;
  /** The innermost wrapper's name — the section actually switching. */
  section: string;
  /** A view transition other than the root's and the bars' is animating — a crossfade came back. */
  animating: boolean;
}

/**
 * A section switch is a cut (ADR 0065): every frame has the resting number
 * of section wrappers (never an extra one for a leaving section), the inner
 * section is only ever the old one or the new one (never blank, never a
 * third), no view transition is animating it, and once the new one is up
 * the old never returns.
 */
export function sectionCutViolations(samples: CutSample[], expected: { sections: number; from: string; to: string }): string[] {
  const out: string[] = [];
  let switched = false;
  for (const s of samples) {
    if (s.sections !== expected.sections) out.push(`${s.sections} sections at ${s.t}ms`);
    if (s.section !== expected.from && s.section !== expected.to) out.push(`section "${s.section}" at ${s.t}ms`);
    if (s.animating) out.push(`view transition running at ${s.t}ms`);
    if (s.section === expected.to) switched = true;
    else if (switched && s.section === expected.from) {
      out.push(`old section back at ${s.t}ms`);
      break;
    }
  }
  return out;
}

/** The `t` of every frame whose tab-bar pixels (base64) differ from the settled page's — nothing may paint over the bar mid-switch. */
export function changedBarFrames(baseline: string, frames: { t: number; bar: string }[]): number[] {
  return frames.filter((f) => f.bar !== baseline).map((f) => f.t);
}
