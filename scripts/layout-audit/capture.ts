/**
 * Page screenshots: pure slice maths (sliceRanges) plus captureSlices, which
 * walks a page top to bottom one viewport at a time and screenshots each
 * stretch — so a very tall page (a 20-stop plan on a phone runs past 15,000
 * CSS px) comes back as images no taller than 2000 device px — and then
 * takes the two viewport shots that show fixed chrome where a Traveller sees
 * it: the first screen and the page end.
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

/** Plain JS strings, not TS functions — see layout-audit.ts trap 1. */
export const SCROLL_HEIGHT_JS = "(() => document.documentElement.scrollHeight)()";
const SCROLL_Y_JS = "(() => window.scrollY)()";

/** `behavior: "instant"` so a page with `scroll-behavior: smooth` is already
 * at the target when the next screenshot is taken (same as the collector). */
function scrollToJs(y: number | "end"): string {
  const top = y === "end" ? "document.documentElement.scrollHeight" : String(y);
  return `(() => window.scrollTo({ top: ${top}, left: 0, behavior: "instant" }))()`;
}

const FIXED_HIDDEN_ATTR = "data-layout-audit-fixed-hidden";
const STICKY_ATTR = "data-layout-audit-unstuck";
const FIXED_HIDDEN_STYLE_ID = "layout-audit-hide-fixed";

/** Marks every `position: fixed` element and hides it (and its subtree —
 * `visibility: visible` on a child would otherwise re-show it), and pins
 * every `position: sticky` element back to where it sits in the flow, with an
 * injected style rule; returns how many fixed elements it marked. Layout is
 * untouched: fixed boxes are out of flow and `visibility` keeps their boxes,
 * and a sticky box holds the same space as a relative one. Without the
 * sticky half a stuck header would repeat at the top of every slice and
 * cover the content under it. */
export const HIDE_FIXED_JS = `(() => {
  const attr = "${FIXED_HIDDEN_ATTR}";
  const stickyAttr = "${STICKY_ATTR}";
  let n = 0;
  let touched = 0;
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    const position = getComputedStyle(el).position;
    if (position === "fixed") { el.setAttribute(attr, ""); n++; touched++; }
    else if (position === "sticky") { el.setAttribute(stickyAttr, ""); touched++; }
  }
  if (touched > 0 && !document.getElementById("${FIXED_HIDDEN_STYLE_ID}")) {
    const style = document.createElement("style");
    style.id = "${FIXED_HIDDEN_STYLE_ID}";
    style.textContent = "[" + attr + "], [" + attr + "] * { visibility: hidden !important; } [" + stickyAttr + "] { position: relative !important; inset: auto !important; }";
    document.head.appendChild(style);
  }
  return n;
})()`;

/** Undoes HIDE_FIXED_JS: removes the style rule and every mark. */
export const RESTORE_FIXED_JS = `(() => {
  const style = document.getElementById("${FIXED_HIDDEN_STYLE_ID}");
  if (style) style.remove();
  for (const el of Array.from(document.querySelectorAll("[${FIXED_HIDDEN_ATTR}], [${STICKY_ATTR}]"))) {
    el.removeAttribute("${FIXED_HIDDEN_ATTR}");
    el.removeAttribute("${STICKY_ATTR}");
  }
})()`;

function fileNameFor(baseName: string, index: number, total: number): string {
  return total === 1 ? `${baseName}.png` : `${baseName}-part${index + 1}.png`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `fileName` is one of the PNGs a capture writes for `baseName`
 * — `${baseName}.png`, `-partN.png`, `-fold.png`, `-end.png`, or a loading
 * shot (`-hard-150ms.png`, `-nav-800ms.png`) — and never a sibling capture's
 * (`1440-light-kbd.png` is not `1440-light`'s). Lets a re-run clear exactly
 * its own stale shots. */
export function isShotOf(baseName: string, fileName: string): boolean {
  return new RegExp(`^${escapeRegExp(baseName)}(?:-part\\d+|-fold|-end|-(?:hard|nav)-\\d+ms)?\\.png$`).test(fileName);
}

const SCROLL_SETTLE_MS = 120;

/**
 * Screenshots `page` top to bottom, writing PNGs into `dir` (created
 * recursively). A single slice is named `${baseName}.png`; several are
 * `${baseName}-part1.png`, `-part2`, … Returns the absolute paths written:
 * the slices in order, then `-fold.png`, then `-end.png` last.
 *
 * NO VIEWPORT RESIZE. Each slice is the real viewport scrolled to that
 * stretch of the page (a slice is at most one viewport tall, and at most
 * 2000 device px). The earlier `fullPage: true` + `clip` approach has the
 * browser re-lay the page out in one page-tall viewport, which is not what a
 * Traveller sees and produced artefacts graded as bugs in the 2026-10-12
 * audit: the Day carousel knocked off its snap point, Plan rows left
 * unpainted, a top bar missing, and on WebKit phones a clip "outside the
 * resulting image".
 *
 * A first pass scrolls through the whole page before anything is measured,
 * so reveal-on-scroll sections (Share's "Day by day") and lazy content are
 * in, and the page height is its final one.
 *
 * FIXED CHROME. The slices are taken with fixed elements hidden and sticky
 * ones un-stuck (HIDE_FIXED_JS, always restored, even if a slice fails):
 * the tab bar would otherwise cover the foot of every slice, hiding content
 * no slice then shows. The two viewport shots put it back: `-fold.png` is
 * the first screen as it loads, `-end.png` the page end — the state check 6
 * ("hidden behind fixed chrome") measures. The page is left at the top for
 * the collector.
 */
export async function captureSlices(
  page: Page,
  opts: { dir: string; baseName: string; width: number; height: number; deviceScaleFactor: number },
): Promise<string[]> {
  const { dir, baseName, width, height, deviceScaleFactor } = opts;
  await fs.mkdir(dir, { recursive: true });

  for (let y = 0, guard = 0; guard < 200; guard++) {
    await page.evaluate(scrollToJs(y));
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    y += height;
    if (y >= (await page.evaluate<number>(SCROLL_HEIGHT_JS))) break;
  }
  await page.evaluate(scrollToJs(0));
  await page.waitForTimeout(SCROLL_SETTLE_MS);

  const foldPath = path.resolve(dir, `${baseName}-fold.png`);
  await page.screenshot({ path: foldPath, animations: "disabled" });

  const files: string[] = [];
  await page.evaluate(HIDE_FIXED_JS);
  try {
    const pageHeightCss = await page.evaluate<number>(SCROLL_HEIGHT_JS);
    const maxSliceCss = Math.min(height, Math.floor(DEFAULT_MAX_DEVICE_PX / deviceScaleFactor));
    const slices = sliceRanges(pageHeightCss, 1, maxSliceCss);
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      await page.evaluate(scrollToJs(slice.y));
      await page.waitForTimeout(SCROLL_SETTLE_MS);
      const scrolledTo = await page.evaluate<number>(SCROLL_Y_JS);
      const top = Math.max(0, slice.y - scrolledTo);
      const filePath = path.resolve(dir, fileNameFor(baseName, i, slices.length));
      await page.screenshot({
        path: filePath,
        clip: { x: 0, y: top, width, height: Math.max(1, Math.min(slice.h, height - top)) },
        animations: "disabled",
      });
      files.push(filePath);
    }
  } finally {
    await page.evaluate(RESTORE_FIXED_JS);
  }

  const endPath = path.resolve(dir, `${baseName}-end.png`);
  await page.evaluate(scrollToJs("end"));
  await page.waitForTimeout(SCROLL_SETTLE_MS);
  await page.screenshot({ path: endPath, animations: "disabled" });
  await page.evaluate(scrollToJs(0));
  files.push(foldPath, endPath);
  return files;
}
