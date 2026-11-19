/**
 * What a Traveller sees while a page loads, and how much it jumps about.
 *
 * LOADING SHOTS (captureLoading). Two ways into a page, two screenshots of
 * each, about 150ms and 800ms in:
 *
 *   - "hard": a full page load (opening the installed app, a pasted link).
 *     Nothing is slowed down: the shots show what a local `next dev` has
 *     painted by then, which is the streamed shell and its loading.tsx, or
 *     the finished page if the data was quick. The clock starts when the
 *     navigation commits (the first bytes of the document).
 *   - "nav": a tap on a link from another page. Every React Server Component
 *     response is held back by NAV_DELAY_MS with Playwright request routing,
 *     so both shots are of the route's loading state — or of the page being
 *     left, if the route has none. The clock starts at the router.push().
 *     CAVEAT: `next dev` does not prefetch, so a route's loading.tsx is not
 *     on the client before the tap the way it is in production, and arrives
 *     in the held-back response itself. A "nav" shot that still shows the
 *     page being left is therefore what `next dev` does, not proof that the
 *     route has no loading state; a skeleton in one is real.
 *
 * Times are when the screenshot was asked for; a DPR 3 screenshot takes a
 * few tens of milliseconds to come back, so read them as "about".
 *
 * LAYOUT SHIFT (measureCls). The `layout-shift` performance entry exists
 * only in Chromium, so this is measured there, emulating the phone's
 * viewport, on an ordinary hard load. It is a `next dev` number against a
 * local database: good for finding WHAT moves, not a field metric. How much
 * a page shifts depends on how late its data lands, and locally it lands
 * fast, so each route is loaded three times: twice as is (the worse is
 * `cls`) and once on a slowed-down phone (`throttled`: Chromium's own
 * network and CPU throttling — 150ms latency, 1.6Mbps, 4× slower CPU).
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { BrowserContext, Page, Route } from "playwright";

import { settle } from "../lib/audit-browser";

const SHOT_AT_MS = [150, 800];
const NAV_DELAY_MS = 1500;

/** Client-side navigation through the App Router's own instance, which Next
 * exposes on `window.next`; false when it isn't there. Plain JS string — see
 * layout-audit.ts trap 1. */
function pushJs(to: string): string {
  return `(() => { const r = window.next && window.next.router; if (!r || typeof r.push !== "function") return false; r.push(${JSON.stringify(to)}); return true; })()`;
}

async function shootAt(page: Page, t0: number, dir: string, baseName: string, kind: "hard" | "nav"): Promise<string[]> {
  const files: string[] = [];
  for (const at of SHOT_AT_MS) {
    const wait = t0 + at - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    const file = path.resolve(dir, `${baseName}-${kind}-${at}ms.png`);
    await page.screenshot({ path: file, animations: "disabled" });
    files.push(file);
  }
  return files;
}

/**
 * Takes the four loading shots of `url`. `fromUrl` is the page the "nav"
 * variant starts on. Returns the files written and, when the client-side
 * navigation could not be driven, why (the hard shots are still returned).
 */
export async function captureLoading(
  page: Page,
  url: string,
  fromUrl: string,
  opts: { dir: string; baseName: string; prepare: (page: Page) => Promise<void> },
): Promise<{ files: string[]; navSkipped?: string }> {
  fs.mkdirSync(opts.dir, { recursive: true });
  const files: string[] = [];

  await page.goto("about:blank");
  await page.goto(url, { waitUntil: "commit" });
  const hardStart = Date.now();
  await opts.prepare(page).catch(() => {});
  files.push(...(await shootAt(page, hardStart, opts.dir, opts.baseName, "hard")));
  await page.waitForLoadState("load");
  await settle(page);

  await page.goto(fromUrl, { waitUntil: "load" });
  await settle(page);
  await opts.prepare(page);
  const holdBack = async (route: Route) => {
    const request = route.request();
    if (request.headers()["rsc"] === "1" || request.url().includes("_rsc=")) {
      await new Promise((resolve) => setTimeout(resolve, NAV_DELAY_MS));
    }
    await route.continue().catch(() => {});
  };
  await page.route("**/*", holdBack);
  let navSkipped: string | undefined;
  try {
    const target = new URL(url);
    const pushed = await page.evaluate<boolean>(pushJs(target.pathname + target.search));
    const navStart = Date.now();
    if (pushed) files.push(...(await shootAt(page, navStart, opts.dir, opts.baseName, "nav")));
    else navSkipped = "window.next.router is not available, so a client-side navigation could not be driven";
  } finally {
    await page.unroute("**/*", holdBack).catch(() => {});
  }
  await page.waitForURL(url, { timeout: 15_000 }).catch(() => {});
  await settle(page);
  return navSkipped ? { files, navSkipped } : { files };
}

// --------------------------------------------------------------------------
// Cumulative layout shift
// --------------------------------------------------------------------------

interface ShiftSource {
  sel: string;
  text?: string;
  from: { x: number; y: number; w: number; h: number };
  to: { x: number; y: number; w: number; h: number };
}

export interface ShiftEntry {
  value: number;
  /** ms since navigation start. */
  t: number;
  input: boolean;
  sources: ShiftSource[];
}

/** Records every layout-shift entry, naming the elements that moved at the
 * moment they moved (a node can be gone by the time the page settles).
 * Runs before any page script. Plain JS string — see layout-audit.ts trap 1. */
export const CLS_INIT_JS = `(() => {
  const sel = (el) => {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
      const testid = n.getAttribute("data-testid");
      if (testid) { parts.unshift('[data-testid="' + testid + '"]'); break; }
      if (n.id) { parts.unshift("#" + n.id); break; }
      const cls = typeof n.className === "string" && n.className.trim() ? "." + n.className.trim().split(/\\s+/)[0] : "";
      const label = n.getAttribute("aria-label");
      parts.unshift(n.tagName.toLowerCase() + cls + (label ? '[aria-label="' + label.slice(0, 40) + '"]' : ""));
    }
    return parts.join(" > ");
  };
  const rect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  window.__auditCls = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__auditCls.push({
          value: e.value,
          t: Math.round(e.startTime),
          input: e.hadRecentInput,
          sources: (e.sources || []).slice(0, 6).map((s) => {
            const el = s.node && s.node.nodeType === 1 ? s.node : s.node && s.node.parentElement;
            const out = { sel: el ? sel(el) : "(node gone)", from: rect(s.previousRect), to: rect(s.currentRect) };
            const text = el ? (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 60) : "";
            if (text) out.text = text;
            return out;
          }),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (e) {}
})()`;

export interface ClsResult {
  /** `cls/<routeLabel>` — what LAYOUT_AUDIT_ONLY matches. */
  id: string;
  label: string;
  route: string;
  /** The score as web-vitals defines it: the worst burst of shifts (gaps
   * under 1s, at most 5s long), shifts just after input left out. */
  cls: number;
  /** Every shift added up, for a page whose shifts come in separate bursts. */
  total: number;
  shifts: number;
  /** The five largest shifts, with the elements that moved. */
  largest: { value: number; t: number; sources: ShiftSource[] }[];
  /** The CLS of each unthrottled load; `cls` and the fields above are the
   * worse one's. */
  runs: number[];
  /** The same load on a throttled network and CPU. */
  throttled?: Pick<ClsResult, "cls" | "total" | "shifts" | "largest">;
  error?: string;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function summariseShifts(entries: ShiftEntry[]): Pick<ClsResult, "cls" | "total" | "shifts" | "largest"> {
  const counted = entries.filter((e) => !e.input).sort((a, b) => a.t - b.t);
  let worst = 0;
  let burst = 0;
  let burstStart = 0;
  let last = -Infinity;
  for (const e of counted) {
    if (e.t - last > 1000 || e.t - burstStart > 5000) {
      burst = 0;
      burstStart = e.t;
    }
    burst += e.value;
    last = e.t;
    worst = Math.max(worst, burst);
  }
  return {
    cls: round4(worst),
    total: round4(counted.reduce((n, e) => n + e.value, 0)),
    shifts: counted.length,
    largest: [...counted]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((e) => ({ value: round4(e.value), t: e.t, sources: e.sources })),
  };
}

const AFTER_SETTLE_MS = 1500;
const PLAIN_RUNS = 2;
const THROTTLE = { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, cpuRate: 4 };

async function loadAndCollect(context: BrowserContext, url: string, throttle: boolean): Promise<ShiftEntry[]> {
  const page = await context.newPage();
  try {
    if (throttle) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: THROTTLE.latency,
        downloadThroughput: THROTTLE.downloadThroughput,
        uploadThroughput: THROTTLE.uploadThroughput,
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE.cpuRate });
    }
    await page.addInitScript({ content: CLS_INIT_JS });
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await settle(page, throttle ? 30_000 : undefined);
    await page.waitForTimeout(AFTER_SETTLE_MS);
    return await page.evaluate<ShiftEntry[]>("window.__auditCls || []");
  } finally {
    await page.close().catch(() => {});
  }
}

/** Loads `url` on fresh pages of `context` (Chromium) and returns its
 * layout shifts. */
export async function measureCls(context: BrowserContext, url: string, label: string, route: string): Promise<ClsResult> {
  const id = `cls/${label}`;
  try {
    const plain = [];
    for (let i = 0; i < PLAIN_RUNS; i++) plain.push(summariseShifts(await loadAndCollect(context, url, false)));
    const worst = plain.reduce((a, b) => (b.cls > a.cls ? b : a));
    const throttled = summariseShifts(await loadAndCollect(context, url, true));
    return { id, label, route, ...worst, runs: plain.map((r) => r.cls), throttled };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).split("\nCall log:")[0].replace(/\s+/g, " ").trim().slice(0, 500);
    return { id, label, route, cls: 0, total: 0, shifts: 0, largest: [], runs: [], error };
  }
}

export function mergeCls(prev: ClsResult[], next: ClsResult[]): ClsResult[] {
  const rerun = new Map(next.map((r) => [r.label, r]));
  const seen = new Set(prev.map((r) => r.label));
  return [...prev.map((r) => rerun.get(r.label) ?? r), ...next.filter((r) => !seen.has(r.label))];
}
