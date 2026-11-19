/**
 * The resize crawl: does a page survive its window being dragged narrower
 * and wider? Each route is loaded ONCE at 2560px, then the viewport is
 * stepped down to 320px with no reload (a reload at each width is what the
 * capture matrix already does, and it hides exactly the state this looks
 * for), then back up to 2560px.
 *
 * Only breakage is checked at each step — sideways scroll, spill out of a
 * container, clipped text, gross overlap — not tap targets or line length.
 * A screenshot is taken only at a step where a finding first appears, so the
 * images mark the widths where something starts to go wrong.
 *
 * The way back up re-checks at six widths the way down also measured. A
 * finding there that the way down did not have at the same width is state
 * that did not recover (a phone drawer left open, a layout stuck in its
 * phone form), reported separately as `notRecovered`.
 *
 * Pure parts (the width lists, the breakage filter, the range folding) are
 * unit-tested; crawlRoute is the Playwright driver.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { Page } from "playwright";

import { gotoSettled } from "../lib/audit-browser";
import { classify, type AutoFinding } from "./checks";
import { COLLECTOR_SCRIPT, type RawCollect } from "./collector";

const WIDEST = 2560;
const NARROWEST = 320;
const COARSE_STEP = 80;
const FINE_STEP = 20;
const FINE_BELOW = 800;
export const RESIZE_HEIGHT = 900;

/** 2560 → 800 in 80px steps, then 780 → 320 in 20px steps. */
export function downWidths(): number[] {
  const widths: number[] = [];
  for (let w = WIDEST; w >= FINE_BELOW; w -= COARSE_STEP) widths.push(w);
  for (let w = FINE_BELOW - FINE_STEP; w >= NARROWEST; w -= FINE_STEP) widths.push(w);
  return widths;
}

/** The widths re-checked on the way back up. Each is also a downWidths()
 * step, so the two passes compare like with like. */
export const UP_WIDTHS = [760, 1040, 1280, 1440, 1920, 2560];

const BREAKAGE_CHECKS = new Set(["sideways-scroll", "spill", "clipped-text", "overlap"]);
/** An overlap counts as gross from this depth on both axes; the capture
 * matrix's own 4px cut is for grading stills, and is noise at 47 widths. */
const GROSS_OVERLAP_PX = 12;
const OVERLAP_DETAIL_RE = /overlap by ([\d.]+)×([\d.]+)px/;

export function breakage(findings: AutoFinding[]): AutoFinding[] {
  return findings.filter((f) => {
    if (!BREAKAGE_CHECKS.has(f.check)) return false;
    if (f.check !== "overlap") return true;
    const m = OVERLAP_DETAIL_RE.exec(f.detail);
    return m !== null && Number(m[1]) >= GROSS_OVERLAP_PX && Number(m[2]) >= GROSS_OVERLAP_PX;
  });
}

/** Folds the widths a finding appeared at into ranges over the steps
 * actually taken: with steps 400, 380, 360, 340 a finding at 400, 380 and
 * 340 reads "380–400, 340". */
export function widthRanges(widths: number[], steps: number[]): string {
  const hit = new Set(widths);
  const ordered = [...steps].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start: number | null = null;
  let last = 0;
  for (const w of ordered) {
    if (hit.has(w)) {
      if (start === null) start = w;
      last = w;
    } else if (start !== null) {
      ranges.push(start === last ? `${start}` : `${start}–${last}`);
      start = null;
    }
  }
  if (start !== null) ranges.push(start === last ? `${start}` : `${start}–${last}`);
  return ranges.join(", ");
}

export interface ResizeFinding {
  check: AutoFinding["check"];
  selector: string;
  text?: string;
  /** The check's own wording at the first width it appeared. */
  detail: string;
  widths: number[];
  /** widths, folded (see widthRanges). */
  range: string;
  /** The screenshot taken where it first appeared, when one was. */
  shot?: string;
}

export interface ResizeRouteResult {
  /** `resize/<routeLabel>` — what LAYOUT_AUDIT_ONLY matches. */
  id: string;
  label: string;
  route: string;
  steps: number[];
  /** Breakage on the way down, by element, with the widths it held at. */
  findings: ResizeFinding[];
  /** Breakage on the way back up that the way down did not have at the same
   * width. */
  notRecovered: ResizeFinding[];
  error?: string;
  ms: number;
}

/** `(scrollY) => void` as a plain JS string — see layout-audit.ts trap 1. */
function scrollToJs(y: number): string {
  return `(() => window.scrollTo({ top: ${Math.max(0, Math.round(y))}, left: 0, behavior: "instant" }))()`;
}

const STEP_SETTLE_MS = 150;
const MAX_SHOTS_PER_ROUTE = 12;

const keyOf = (f: AutoFinding) => `${f.check}#${f.selector}`;

async function measure(page: Page, width: number, id: string): Promise<AutoFinding[]> {
  await page.setViewportSize({ width, height: RESIZE_HEIGHT });
  await page.waitForTimeout(STEP_SETTLE_MS);
  return breakage(classify(await page.evaluate<RawCollect>(COLLECTOR_SCRIPT), id));
}

function fold(byKey: Map<string, { first: AutoFinding; widths: number[]; shot?: string }>, steps: number[]): ResizeFinding[] {
  return [...byKey.values()].map(({ first, widths, shot }) => {
    const out: ResizeFinding = {
      check: first.check,
      selector: first.selector,
      detail: first.detail,
      widths,
      range: widthRanges(widths, steps),
    };
    if (first.text) out.text = first.text;
    if (shot) out.shot = shot;
    return out;
  });
}

/**
 * Crawls one route. `page` must be a desktop Chromium page (not mobile-
 * emulated: a mobile viewport does not reflow on setViewportSize the way a
 * dragged window does). Screenshots go to `<outDir>/shots/resize/<label>/`,
 * at most MAX_SHOTS_PER_ROUTE of them.
 */
export async function crawlRoute(
  page: Page,
  url: string,
  opts: { outDir: string; label: string; route: string; afterLoad?: (page: Page) => Promise<void> },
): Promise<ResizeRouteResult> {
  const t0 = Date.now();
  const id = `resize/${opts.label}`;
  const steps = downWidths();
  const result: ResizeRouteResult = { id, label: opts.label, route: opts.route, steps, findings: [], notRecovered: [], ms: 0 };
  const dir = path.join(opts.outDir, "shots", "resize", opts.label);
  fs.rmSync(dir, { recursive: true, force: true });
  let shots = 0;

  const shoot = async (f: AutoFinding, width: number, pass: "down" | "up"): Promise<string | undefined> => {
    if (shots >= MAX_SHOTS_PER_ROUTE) return undefined;
    shots++;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.resolve(dir, `${width}-${pass}.png`);
    await page.evaluate(scrollToJs(f.rect.y - 120));
    await page.screenshot({ path: file, animations: "disabled" });
    await page.evaluate(scrollToJs(0));
    return file;
  };

  try {
    await page.setViewportSize({ width: steps[0], height: RESIZE_HEIGHT });
    await gotoSettled(page, url);
    await opts.afterLoad?.(page);

    const down = new Map<string, { first: AutoFinding; widths: number[]; shot?: string }>();
    const downAt = new Map<number, Set<string>>();
    let previous = new Set<string>();
    for (const width of steps) {
      const found = await measure(page, width, id);
      const keys = new Set(found.map(keyOf));
      downAt.set(width, keys);
      const fresh = found.filter((f) => !previous.has(keyOf(f)) && !down.has(keyOf(f)));
      const shot = fresh.length > 0 ? await shoot(fresh[0], width, "down") : undefined;
      for (const f of found) {
        const entry = down.get(keyOf(f));
        if (entry) entry.widths.push(width);
        else down.set(keyOf(f), { first: f, widths: [width], shot: fresh.includes(f) ? shot : undefined });
      }
      previous = keys;
    }
    result.findings = fold(down, steps);

    const stuck = new Map<string, { first: AutoFinding; widths: number[]; shot?: string }>();
    for (const width of UP_WIDTHS) {
      const found = await measure(page, width, id);
      const before = downAt.get(width) ?? new Set<string>();
      const fresh = found.filter((f) => !before.has(keyOf(f)));
      const shot = fresh.some((f) => !stuck.has(keyOf(f))) ? await shoot(fresh[0], width, "up") : undefined;
      for (const f of fresh) {
        const entry = stuck.get(keyOf(f));
        if (entry) entry.widths.push(width);
        else stuck.set(keyOf(f), { first: f, widths: [width], shot });
      }
    }
    result.notRecovered = fold(stuck, UP_WIDTHS);
  } catch (err) {
    result.error = (err instanceof Error ? err.message : String(err)).split("\nCall log:")[0].replace(/\s+/g, " ").trim().slice(0, 500);
  }
  result.ms = Date.now() - t0;
  return result;
}

/** Merges this run's routes into an existing resize.findings.json's, by
 * route label, so a filtered re-run keeps the rest. */
export function mergeResize(prev: ResizeRouteResult[], next: ResizeRouteResult[]): ResizeRouteResult[] {
  const rerun = new Map(next.map((r) => [r.label, r]));
  const seen = new Set(prev.map((r) => r.label));
  return [...prev.map((r) => rerun.get(r.label) ?? r), ...next.filter((r) => !seen.has(r.label))];
}
