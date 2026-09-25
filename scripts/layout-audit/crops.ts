/**
 * Crops for the triage page — `npm run audit:layout:crops -- <outDir>`.
 *
 * Reads the reviewed `<out>/findings.json` (ReviewedFinding[], written by the
 * controller's merged review step — see the spec's phase-4 pipeline) and the
 * PNGs each finding points at, and writes `<out>/report-data.json`
 * (ReportFinding[] — the same shape plus `img`, a
 * `data:image/jpeg;base64,…` URI of the padded, downscaled crop). That file
 * feeds a private triage page Cam reviews on a phone, so the whole thing has
 * to stay well under the artifact size limit — see the 12MB budget below.
 *
 * NO IMAGE LIBRARY. No sharp, jimp or pngjs: this repo already resolves
 * Playwright for the audit itself (see scripts/lib/audit-browser.ts's
 * resolvePlaywright() and its docblock for why Playwright is not a project
 * dependency), so cropping and downscaling is done the same way — by loading
 * the original PNG into a headless page as a data URI, positioning it with
 * negative offsets so only the crop region falls inside the viewport, and
 * letting the browser context's deviceScaleFactor do the downscale. The only
 * thing this file reads "by hand" is the 8 bytes of width/height in the
 * PNG's IHDR header (pngSize) — just enough to clamp/pad a crop against the
 * image's real bounds without a decoder.
 *
 * SIZE BUDGET
 * -----------------
 *   report-data.json is read whole into a browser tab (the triage artifact),
 *   which must stay under 16MB. This script warns (never fails) if the
 *   serialised total exceeds 12MB, and re-renders every crop at a lower JPEG
 *   quality (55 instead of 70) when it does — leaving headroom for the
 *   JSON's own structure and whatever the triage page adds at runtime.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { Browser, BrowserType } from "playwright";

import { resolvePlaywright } from "../lib/audit-browser";

// --------------------------------------------------------------------------
// The reviewed-findings contract (written by the review step, read here)
// --------------------------------------------------------------------------

export type Grade = "Broken" | "Ugly" | "Polish";

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReviewedFinding {
  id: string;
  route: string;
  screen: string;
  widths: number[];
  themes: ("light" | "dark")[];
  grade: Grade;
  title: string;
  what: string;
  where?: string;
  suggestedFix: string;
  /** `crop` is in image pixels (the PNG's own, i.e. device px at whatever
   * deviceScaleFactor that width was captured at — see config.ts's
   * viewportFor: <=430 is 2x, wider is 1x). */
  screenshot: { file: string; crop: Crop };
}

/** Same as ReviewedFinding, plus the rendered crop as a data URI. What
 * report-data.json actually holds. */
export interface ReportFinding extends ReviewedFinding {
  img: string;
}

// --------------------------------------------------------------------------
// Pure geometry — no Playwright, no filesystem (crops.test.ts covers these
// directly, same split as capture.ts's sliceRanges / checks.ts's classify)
// --------------------------------------------------------------------------

const DEFAULT_PAD = 48;
const DEFAULT_MAX_W = 1200;

/**
 * Grows `crop` by `pad` image px on every side, clamps the result to the
 * image's own bounds (a crop near an edge never asks for negative
 * coordinates or pixels past the image), and computes the `deviceScaleFactor`
 * that would bring a crop wider than `maxW` back down to it. `scale` is 1
 * (never upscaled) for anything at or under `maxW`.
 */
export function paddedCrop(
  crop: Crop,
  img: { w: number; h: number },
  pad: number = DEFAULT_PAD,
  maxW: number = DEFAULT_MAX_W,
): { x: number; y: number; w: number; h: number; scale: number } {
  const x1 = Math.max(0, crop.x - pad);
  const y1 = Math.max(0, crop.y - pad);
  const x2 = Math.min(img.w, crop.x + crop.w + pad);
  const y2 = Math.min(img.h, crop.y + crop.h + pad);
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const scale = w > maxW ? maxW / w : 1;
  return { x: x1, y: y1, w, h, scale };
}

/** Width/height straight out of the PNG's IHDR chunk: 8-byte signature, then
 * a 4-byte chunk length, a 4-byte "IHDR" type, then width and height as
 * big-endian uint32s — bytes 16-19 and 20-23. Every PNG starts with IHDR
 * (the spec requires it to be the first chunk), so no signature/type check
 * is needed to find it. */
export function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// --------------------------------------------------------------------------
// Rendering one finding's crop
// --------------------------------------------------------------------------

/** Resolves a finding's screenshot path against `outDir` — absolute paths
 * (what the manifest itself stores) pass through unchanged; anything else
 * is joined to outDir, so a findings.json written with paths relative to
 * the out dir also works. */
function resolveShotPath(outDir: string, file: string): string {
  return path.isAbsolute(file) ? file : path.join(outDir, file);
}

/**
 * Loads the finding's PNG, pads/clamps its crop against the image's real
 * size, and renders it in a fresh browser context sized to the padded crop
 * (deviceScaleFactor: the crop's own downscale factor) — a data URI of the
 * whole PNG, offset by `-x,-y` so only the crop region lands inside the
 * viewport. Returns a JPEG buffer at `quality`.
 */
async function renderCrop(browser: Browser, outDir: string, finding: ReviewedFinding, quality: number): Promise<Buffer> {
  const pngPath = resolveShotPath(outDir, finding.screenshot.file);
  const pngBuf = fs.readFileSync(pngPath);
  const size = pngSize(pngBuf);
  const padded = paddedCrop(finding.screenshot.crop, size);
  const dataUri = `data:image/png;base64,${pngBuf.toString("base64")}`;

  const context = await browser.newContext({
    viewport: { width: padded.w, height: padded.h },
    deviceScaleFactor: padded.scale,
  });
  try {
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0}</style></head>` +
        `<body><img src="${dataUri}" style="position:absolute;left:${-padded.x}px;top:${-padded.y}px"></body></html>`,
      { waitUntil: "load" },
    );
    return await page.screenshot({
      type: "jpeg",
      quality,
      clip: { x: 0, y: 0, width: padded.w, height: padded.h },
    });
  } finally {
    await context.close();
  }
}

/** Renders every finding at `quality`, returning the ReportFinding[] and its
 * serialised byte size together (the caller decides whether that size is
 * acceptable or worth a lower-quality re-render). */
async function renderAll(
  browser: Browser,
  outDir: string,
  findings: ReviewedFinding[],
  quality: number,
): Promise<{ report: ReportFinding[]; json: string; bytes: number }> {
  const report: ReportFinding[] = [];
  for (const finding of findings) {
    const jpeg = await renderCrop(browser, outDir, finding, quality);
    report.push({ ...finding, img: `data:image/jpeg;base64,${jpeg.toString("base64")}` });
  }
  const json = JSON.stringify(report, null, 2) + "\n";
  return { report, json, bytes: Buffer.byteLength(json, "utf8") };
}

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------

const QUALITY_DEFAULT = 70;
const QUALITY_FALLBACK = 55;
const SIZE_BUDGET_BYTES = 12 * 1024 * 1024;

async function main(): Promise<void> {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: npm run audit:layout:crops -- <outDir>");
    process.exitCode = 1;
    return;
  }

  const findingsPath = path.join(outDir, "findings.json");
  if (!fs.existsSync(findingsPath)) {
    console.error(`No findings.json at ${findingsPath} — run the review step first.`);
    process.exitCode = 1;
    return;
  }
  const findings = JSON.parse(fs.readFileSync(findingsPath, "utf8")) as ReviewedFinding[];

  let chromium: BrowserType;
  try {
    ({ chromium } = resolvePlaywright());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();
  try {
    let { report, json, bytes } = await renderAll(browser, outDir, findings, QUALITY_DEFAULT);
    if (bytes > SIZE_BUDGET_BYTES) {
      console.warn(
        `report-data.json would be ${(bytes / (1024 * 1024)).toFixed(1)}MB at quality ${QUALITY_DEFAULT} ` +
          `(over the ${SIZE_BUDGET_BYTES / (1024 * 1024)}MB budget) — re-rendering every crop at quality ${QUALITY_FALLBACK}.`,
      );
      ({ report, json, bytes } = await renderAll(browser, outDir, findings, QUALITY_FALLBACK));
    }

    const reportPath = path.join(outDir, "report-data.json");
    fs.writeFileSync(reportPath, json);
    console.log(`${reportPath}: ${report.length} finding(s), ${bytes} bytes (${(bytes / (1024 * 1024)).toFixed(2)}MB)`);
  } finally {
    await browser.close();
  }
}

// Guarded rather than unconditional: crops.test.ts imports this module
// directly for paddedCrop/pngSize (see the CommonJS-transpilation note in
// scripts/feedback-pull.ts), and running main() on that import would try to
// launch a browser against whatever process.argv vitest happens to have.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
