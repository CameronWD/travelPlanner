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
