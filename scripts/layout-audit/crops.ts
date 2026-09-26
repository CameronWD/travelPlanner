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
 * Like the audit itself, it refuses an out dir inside the repo (cropsPaths)
 * before reading or writing anything.
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
 *   which must stay under 16MB. This script warns (never fails) and
 *   re-renders every crop at a lower JPEG quality (55 instead of 70) if the
 *   serialised total exceeds 12MB. If it is *still* over 15MB after that
 *   re-render, it refuses to write the file at all and exits 1 — writing a
 *   report-data.json that itself eats nearly the whole 16MB cap would leave
 *   no headroom for the JSON's own structure or whatever the triage page
 *   adds at runtime, so that case is a hard stop, not a warning.
 *
 * PER-FINDING FAULT ISOLATION
 * -----------------
 *   findings.json is LLM-reviewer output over ~100-300 findings; one bad
 *   entry (a typo'd path, a crop with no overlap with its image, a
 *   truncated PNG) is expected. A single finding failing to render never
 *   aborts the run — see renderAll/renderCrop — it's kept in
 *   report-data.json with `img: ""` and `imgError` set instead. The run
 *   exits 0 if at least one crop rendered, 1 if every finding failed (or
 *   there were none).
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { Browser, BrowserType } from "playwright";

import { resolvePlaywright } from "../lib/audit-browser";
import { assertOutsideRepo } from "./config";

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
 * report-data.json actually holds. `img` is `""` and `imgError` is set when
 * this one finding's crop could not be rendered (missing/unreadable PNG, a
 * non-PNG/truncated file, or a crop with no overlap with the image) — see
 * renderCrop/renderAll. One bad finding never aborts the whole run. */
export interface ReportFinding extends ReviewedFinding {
  img: string;
  imgError?: string;
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

/** True when `crop` has no overlap at all with an image of size `img` — off
 * to one side, above, below, or zero/negative-sized in a way that clears the
 * image entirely. Padding only ever grows a crop, so checking this on the
 * *raw* crop before paddedCrop() is enough: anything that overlaps at all
 * still overlaps (more) once padded and clamped, so paddedCrop's own
 * `Math.max(1, …)` floor only ever fires as a sub-pixel rounding guard, never
 * as a silent stand-in for "this crop was nowhere near the image". */
export function cropOutsideImage(crop: Crop, img: { w: number; h: number }): boolean {
  return crop.x >= img.w || crop.y >= img.h || crop.x + crop.w <= 0 || crop.y + crop.h <= 0;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Signature (8B) + chunk length (4B) + "IHDR" (4B) + width/height (4B each). */
const PNG_IHDR_END = 24;

/** Width/height straight out of the PNG's IHDR chunk: 8-byte signature, then
 * a 4-byte chunk length, a 4-byte "IHDR" type, then width and height as
 * big-endian uint32s — bytes 16-19 and 20-23. Every PNG starts with IHDR
 * (the spec requires it to be the first chunk), so no chunk-type check is
 * needed to find it — but a signature check and a length guard are, since
 * this is fed whatever `screenshot.file` a reviewer wrote down: a wrong path
 * that happens to resolve to some other file (or a truncated PNG) must throw
 * a clear error here rather than read four garbage bytes as a "size". */
export function pngSize(buf: Buffer): { w: number; h: number } {
  if (buf.length < PNG_IHDR_END) {
    throw new Error(`not a PNG: ${buf.length} byte(s), too short for a signature + IHDR header`);
  }
  if (!buf.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG: bad signature");
  }
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
  if (cropOutsideImage(finding.screenshot.crop, size)) {
    throw new Error(`crop outside image ${size.w}x${size.h}`);
  }
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

/** Playwright/fs errors can carry a multi-line "Call log:" trailer (or a
 * multi-line stack via String(err)); keep just the first line, collapsed, so
 * `imgError` stays a short, greppable summary rather than a wall of text. */
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\nCall log:")[0].split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 500);
}

/**
 * Renders every finding at `quality`, returning the ReportFinding[] and its
 * serialised byte size together (the caller decides whether that size is
 * acceptable or worth a lower-quality re-render). One finding's render
 * failing (missing/unreadable PNG, a non-PNG/truncated file, a crop with no
 * overlap with the image, or anything else renderCrop throws) never aborts
 * the rest: that finding is kept with `img: ""` and `imgError` set instead,
 * and `failed` counts how many.
 */
async function renderAll(
  browser: Browser,
  outDir: string,
  findings: ReviewedFinding[],
  quality: number,
): Promise<{ report: ReportFinding[]; json: string; bytes: number; failed: number }> {
  const report: ReportFinding[] = [];
  let failed = 0;
  for (const finding of findings) {
    try {
      const jpeg = await renderCrop(browser, outDir, finding, quality);
      report.push({ ...finding, img: `data:image/jpeg;base64,${jpeg.toString("base64")}` });
    } catch (err) {
      failed++;
      report.push({ ...finding, img: "", imgError: errorText(err) });
    }
  }
  const json = JSON.stringify(report, null, 2) + "\n";
  return { report, json, bytes: Buffer.byteLength(json, "utf8"), failed };
}

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------

const QUALITY_DEFAULT = 70;
const QUALITY_FALLBACK = 55;
const MB = 1024 * 1024;
/** Above this, warn and re-render every crop at QUALITY_FALLBACK. */
const SIZE_WARN_BYTES = 12 * MB;
/** Above this even after the quality-55 re-render, refuse to write the file
 * (the triage page's own hard cap is 16MB — this leaves headroom below it
 * rather than writing right up to the edge). */
const SIZE_HARD_CAP_BYTES = 15 * MB;

function mb(bytes: number): string {
  return (bytes / MB).toFixed(2);
}

/** Where this run reads findings.json and writes report-data.json. Throws
 * for an out dir inside the repo (`cwd`), the same rule as the audit's own
 * out dir (config.ts assertOutsideRepo) — checked before anything is read or
 * written. */
export function cropsPaths(outDir: string, cwd: string): { findingsPath: string; reportPath: string } {
  assertOutsideRepo(outDir, cwd);
  return { findingsPath: path.join(outDir, "findings.json"), reportPath: path.join(outDir, "report-data.json") };
}

async function main(): Promise<void> {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: npm run audit:layout:crops -- <outDir>");
    process.exitCode = 1;
    return;
  }

  let findingsPath: string;
  let reportPath: string;
  try {
    ({ findingsPath, reportPath } = cropsPaths(outDir, process.cwd()));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(findingsPath)) {
    console.error(`No findings.json at ${findingsPath} — run the review step first.`);
    process.exitCode = 1;
    return;
  }
  const findings = JSON.parse(fs.readFileSync(findingsPath, "utf8")) as ReviewedFinding[];

  let chromium: BrowserType;
  try {
    ({ chromium } = resolvePlaywright("audit:layout:crops"));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();
  try {
    let { report, json, bytes, failed } = await renderAll(browser, outDir, findings, QUALITY_DEFAULT);

    if (bytes > SIZE_WARN_BYTES) {
      console.warn(
        `report-data.json would be ${mb(bytes)}MB at quality ${QUALITY_DEFAULT} ` +
          `(over the ${mb(SIZE_WARN_BYTES)}MB budget) — re-rendering every crop at quality ${QUALITY_FALLBACK}.`,
      );
      ({ report, json, bytes, failed } = await renderAll(browser, outDir, findings, QUALITY_FALLBACK));
    }

    if (bytes > SIZE_HARD_CAP_BYTES) {
      console.error(
        `report-data.json is ${mb(bytes)}MB even at quality ${QUALITY_FALLBACK} — over the ${mb(SIZE_HARD_CAP_BYTES)}MB ` +
          `hard cap (the triage page itself must stay under 16MB). Refusing to write it — split the review batch ` +
          `across more than one out dir, or drop some findings, and re-run.`,
      );
      process.exitCode = 1;
      return;
    }
    if (bytes > SIZE_WARN_BYTES) {
      console.warn(`report-data.json is ${mb(bytes)}MB — over the ${mb(SIZE_WARN_BYTES)}MB budget but under the hard cap; writing it anyway.`);
    }

    fs.writeFileSync(reportPath, json);
    console.log(
      `${reportPath}: ${report.length} finding(s), ${bytes} bytes (${mb(bytes)}MB), ${failed} failed crop(s)`,
    );

    const succeeded = report.length - failed;
    process.exitCode = findings.length === 0 || succeeded === 0 ? 1 : 0;
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
