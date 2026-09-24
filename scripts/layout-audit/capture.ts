/**
 * Full-page screenshot slicing: pure slice maths (sliceRanges) plus a
 * function that screenshots a page in <=2000-device-px slices, so reviewers
 * can read very tall pages (e.g. a 20-stop trip plan at 360px wide can
 * exceed 15,000 CSS px) without Chromium's screenshot size limits ever
 * coming into play.
 *
 * Pure vs. Playwright split follows checks.ts / collector.ts: sliceRanges
 * has no Playwright dependency and is unit-tested directly; captureSlices
 * is the thin driver that reads real page geometry and calls
 * page.screenshot() per slice.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Page } from "playwright";

// --------------------------------------------------------------------------
// Slice maths
// --------------------------------------------------------------------------

export interface Slice {
  y: number; // CSS px, document coords
  h: number; // CSS px
}

const DEFAULT_MAX_DEVICE_PX = 2000;

/**
 * Splits a page of `pageHeightCss` CSS px into slices no taller than
 * `maxDevicePx` DEVICE px each (so `deviceScaleFactor: 2` halves the CSS
 * height per slice). Never returns an empty list or a zero-height slice:
 * a zero/negative height still yields one 1px slice.
 *
 * `total` is rounded up (Math.ceil) so a fractional bottom pixel row (e.g.
 * scrollHeight 900.4) is still fully covered rather than clipped off by a
 * truncated last slice.
 */
export function sliceRanges(pageHeightCss: number, deviceScaleFactor: number, maxDevicePx = DEFAULT_MAX_DEVICE_PX): Slice[] {
  const total = Math.max(1, Math.ceil(pageHeightCss));
  const step = Math.floor(maxDevicePx / deviceScaleFactor);
  const slices: Slice[] = [];
  for (let y = 0; y < total; y += step) {
    slices.push({ y, h: Math.min(step, total - y) });
  }
  return slices;
}

// --------------------------------------------------------------------------
// Capturing
// --------------------------------------------------------------------------

/** Zero-arg page function as a string (not a TS function reference) — see
 * the "why a string, not a function" note in collector.ts / contrast-audit.ts:
 * tsx/esbuild wraps named bindings in a `__name(...)` helper that only
 * exists in the compiled module, and page.evaluate() would throw
 * `ReferenceError: __name is not defined` in the page for anything beyond a
 * one-line arrow function with no named inner bindings. This one-liner is
 * simple enough to pass as a function reference, but the string form keeps
 * it consistent with the rest of the in-page code in this project and is
 * unaffected by whichever bundler compiles this file.
 */
const SCROLL_HEIGHT_JS = "(() => document.documentElement.scrollHeight)()";

function fileNameFor(baseName: string, index: number, total: number): string {
  return total === 1 ? `${baseName}.png` : `${baseName}-part${index + 1}.png`;
}

/**
 * Screenshots `page` in slices no taller than 2000 device px, writing PNGs
 * into `dir` (created recursively). A single slice is named `${baseName}.png`;
 * multiple slices are `${baseName}-part1.png`, `-part2`, … in top-to-bottom
 * order. Returns the absolute file paths written, in that same order.
 *
 * Each slice is captured with `fullPage: true` alongside an explicit `clip`
 * — Playwright still requires `fullPage: true` for a clip whose top is
 * below the first viewport to actually capture that region (with it
 * omitted, `clip` is only honoured against the already-rendered viewport,
 * so a below-the-fold clip comes back blank); `fullPage: true` makes
 * Playwright scroll/stitch the full document first and then crop to `clip`.
 * Confirmed against a live page in the Task 4 live check (see the report).
 */
export async function captureSlices(
  page: Page,
  opts: { dir: string; baseName: string; width: number; deviceScaleFactor: number },
): Promise<string[]> {
  const { dir, baseName, width, deviceScaleFactor } = opts;
  await fs.mkdir(dir, { recursive: true });

  const pageHeightCss = await page.evaluate<number>(SCROLL_HEIGHT_JS);
  const slices = sliceRanges(pageHeightCss, deviceScaleFactor);

  const files: string[] = [];
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const filePath = path.resolve(dir, fileNameFor(baseName, i, slices.length));
    await page.screenshot({
      path: filePath,
      fullPage: true,
      clip: { x: 0, y: slice.y, width, height: slice.h },
      animations: "disabled",
    });
    files.push(filePath);
  }
  return files;
}
