/**
 * Full-page screenshot slicing: pure slice maths (sliceRanges) plus a
 * function that screenshots a page in <=2000-device-px slices, so reviewers
 * can read very tall pages (e.g. a 20-stop trip plan at 360px wide can
 * exceed 15,000 CSS px) without Chromium's screenshot size limits ever
 * coming into play — and then one viewport shot at the page end, the only
 * image that shows fixed chrome where a Traveller sees it (see
 * captureSlices).
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
export const SCROLL_HEIGHT_JS = "(() => document.documentElement.scrollHeight)()";

/** `behavior: "instant"` so a page with `scroll-behavior: smooth` is already
 * at the target when the next screenshot is taken (same as the collector). */
const SCROLL_TO_END_JS =
  '(() => window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: "instant" }))()';
const SCROLL_TO_TOP_JS = '(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }))()';

const FIXED_HIDDEN_ATTR = "data-layout-audit-fixed-hidden";
const FIXED_HIDDEN_STYLE_ID = "layout-audit-hide-fixed";

/** Marks every `position: fixed` element and hides it (and its subtree —
 * `visibility: visible` on a child would otherwise re-show it) with an
 * injected style rule; returns how many it marked. Plain JS string, per the
 * `__name` rule above. Layout is untouched: fixed boxes are out of flow and
 * `visibility` keeps their boxes, so the slices show the real page. */
export const HIDE_FIXED_JS = `(() => {
  const attr = "${FIXED_HIDDEN_ATTR}";
  let n = 0;
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    if (getComputedStyle(el).position !== "fixed") continue;
    el.setAttribute(attr, "");
    n++;
  }
  if (n > 0 && !document.getElementById("${FIXED_HIDDEN_STYLE_ID}")) {
    const style = document.createElement("style");
    style.id = "${FIXED_HIDDEN_STYLE_ID}";
    style.textContent = "[" + attr + "], [" + attr + "] * { visibility: hidden !important; }";
    document.head.appendChild(style);
  }
  return n;
})()`;

/** Undoes HIDE_FIXED_JS: removes the style rule and every mark. */
export const RESTORE_FIXED_JS = `(() => {
  const style = document.getElementById("${FIXED_HIDDEN_STYLE_ID}");
  if (style) style.remove();
  for (const el of Array.from(document.querySelectorAll("[${FIXED_HIDDEN_ATTR}]"))) el.removeAttribute("${FIXED_HIDDEN_ATTR}");
})()`;

function fileNameFor(baseName: string, index: number, total: number): string {
  return total === 1 ? `${baseName}.png` : `${baseName}-part${index + 1}.png`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `fileName` is one of the PNGs captureSlices writes for
 * `baseName` — `${baseName}.png`, `-partN.png` or `-end.png` — and never a
 * sibling capture's (`390-light-kbd.png` is not `390-light`'s). Lets a
 * re-run clear exactly its own stale shots. */
export function isShotOf(baseName: string, fileName: string): boolean {
  return new RegExp(`^${escapeRegExp(baseName)}(?:-part\\d+|-end)?\\.png$`).test(fileName);
}

/**
 * Screenshots `page` in slices no taller than 2000 device px, writing PNGs
 * into `dir` (created recursively). A single slice is named `${baseName}.png`;
 * multiple slices are `${baseName}-part1.png`, `-part2`, … in top-to-bottom
 * order. Returns the absolute file paths written, in that same order, with
 * the end shot (below) last.
 *
 * FIXED CHROME. A full-page capture paints `position: fixed` elements (the
 * mobile tab bar, the floating feedback button) once, where they sit in the
 * first viewport — so on every phone page they cover ~76 CSS px of real
 * content in the middle of the first slice. The slices are therefore taken
 * with every fixed element hidden (HIDE_FIXED_JS, always restored, even if a
 * slice fails). Then, with it restored, the page is scrolled to its end for
 * ONE viewport-sized `${baseName}-end.png` — fixed chrome where a Traveller
 * sees it, over the last of the content, which is the state check 6
 * ("hidden behind fixed chrome") measures — and scrolled back to the top
 * for the collector.
 *
 * Each slice is captured with `fullPage: true` alongside an explicit `clip`,
 * per the brief: `fullPage: true` has Playwright render/stitch the whole
 * document first and then crop to `clip`, which is what makes a clip below
 * the first viewport actually capture that region. Confirmed live against
 * /trips in the Task 4 live check (see the report): a second and third
 * slice, entirely below the first viewport, both came back with real,
 * distinct page content rather than a blank image.
 */
export async function captureSlices(
  page: Page,
  opts: { dir: string; baseName: string; width: number; deviceScaleFactor: number },
): Promise<string[]> {
  const { dir, baseName, width, deviceScaleFactor } = opts;
  await fs.mkdir(dir, { recursive: true });

  const files: string[] = [];
  await page.evaluate(HIDE_FIXED_JS);
  try {
    const pageHeightCss = await page.evaluate<number>(SCROLL_HEIGHT_JS);
    const slices = sliceRanges(pageHeightCss, deviceScaleFactor);
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
  } finally {
    await page.evaluate(RESTORE_FIXED_JS);
  }

  const endPath = path.resolve(dir, `${baseName}-end.png`);
  await page.evaluate(SCROLL_TO_END_JS);
  await page.screenshot({ path: endPath, animations: "disabled" });
  await page.evaluate(SCROLL_TO_TOP_JS);
  files.push(endPath);
  return files;
}
