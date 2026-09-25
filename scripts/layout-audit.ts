/**
 * Layout audit — `npm run audit:layout`. Screenshots every screen of the
 * app from a 360px phone to a 2560px widescreen, and runs seven automatic
 * layout checks on each capture, so reviewers can grade what actually
 * rendered. Spec: docs/specs/2026-09-24-layout-audit.md (Stage 1).
 *
 * WHAT IT DOES
 * -----------------
 *   1. Refuses to run unless BASE_URL is local (see THE HARD SAFETY RULE).
 *   2. Signs in (auth bootstrap below) and resolves the audit's cast of
 *      trips BY NAME on /trips — EU Christmas 2026 (the "deep" trip), one
 *      trip per Phase, and "Layout audit — empty", which it creates through
 *      the app's own /trips/new form if it doesn't exist yet. Each phase
 *      trip's Phase is read off Home's `[data-trip-phase]` marker; a trip
 *      that has drifted into another Phase is a COVERAGE GAP, never audited
 *      as if it were still in the old one.
 *   3. Builds the capture matrix (layout-audit/config.ts: deep, phase,
 *      empty, dark, print and overlay sets — roughly 600 captures) and runs
 *      it, one browser context per (width, theme, signed-in) group. Per
 *      capture: load the route, apply the theme, reveal and wait for any
 *      map, open the overlay if it is one (plus the simulated on-screen
 *      keyboard variant: viewport 300px shorter, first field focused), let
 *      motion settle, screenshot (pages: the full page in <=2000-device-px
 *      slices; overlays: the viewport — see captureViewport), THEN run the
 *      in-page collector (it scrolls to the end to measure the mobile tab
 *      bar, and the screenshots must show the page as it loaded) and
 *      classify its geometry into findings.
 *   4. Writes the outputs and a summary, and sets the exit code.
 *   One capture failing never aborts the run: it is recorded with its
 *   error and the run carries on.
 *
 * PREREQUISITES
 * -----------------
 *   - A running `next dev` server (`npm run dev`) at BASE_URL — never
 *     `next start`, which would load .env.production.local.
 *   - Playwright + Chromium. Like contrast-audit.ts, Playwright is NOT a
 *     project dependency; this environment has it installed globally:
 *
 *       NODE_PATH=/usr/local/lib/node_modules npm run audit:layout
 *
 *   - ALLOW_DEV_LOGIN=true on the server (it is, in .env, for local use).
 *     The auth bootstrap signs in through the "Continue as You" dev login
 *     button whenever the saved session is missing or expired, then saves
 *     a fresh storageState to LAYOUT_AUDIT_AUTH_STATE for every later
 *     context to reuse — so a missing /tmp/auth.json is not an error.
 *
 * CONFIGURATION (env vars)
 * -----------------
 *   BASE_URL                  App to audit. Default http://localhost:3000.
 *                             Must be localhost / 127.0.0.1.
 *   LAYOUT_AUDIT_OUT          Output directory. Default
 *                             /tmp/layout-audit/<timestamp>. Refused if it
 *                             is inside the repo.
 *   LAYOUT_AUDIT_AUTH_STATE   Playwright storageState JSON. Default
 *                             /tmp/auth.json. Created if missing.
 *   LAYOUT_AUDIT_ONLY         Substring filter on capture ids for quick
 *                             re-runs, e.g. "deep/plan/deep/390-light",
 *                             "overlay/stop-add/" or "overlay/" (commas
 *                             separate alternatives; ids mirror the shot
 *                             paths below, minus the .png). A
 *                             filtered run into an out dir that already
 *                             holds a manifest MERGES into it — re-run
 *                             captures replace their old records and
 *                             findings — so re-running a few failures never
 *                             throws away a full run's manifest. The exit
 *                             code still fails a re-run that captured
 *                             nothing (no match, or every match skipped).
 *
 * OUTPUT (the contract crops.ts and the review steps read)
 * -----------------
 *   <out>/manifest.json        every capture: route, trip, phase, width,
 *                              theme, overlay, files, marker count, element
 *                              and finding counts, error / skip reason,
 *                              timing; plus the trip ids and coverage gaps.
 *   <out>/findings.auto.json   every automatic-check hit (AutoFinding[]).
 *   <out>/shots/<set>/<routeLabel>/<trip>/<width>-<theme>[-kbd].png
 *   <out>/shots/overlay/<overlayId>/<width>-<theme>[-kbd].png
 *                              (tall pages: -part1.png, -part2.png, …;
 *                              overlays are always one viewport image)
 *
 * EXIT CODE
 * -----------------
 *   Non-zero when nothing was captured, any capture errored, or any capture
 *   measured zero elements. Findings do NOT fail Stage 1, and neither do
 *   skipped captures (a route with no dated days, an overlay whose trigger
 *   isn't there) — those are printed as COVERAGE GAPs instead.
 *
 * THE HARD SAFETY RULE — HTTP ONLY
 * -----------------
 *   The harness talks to the app only over HTTP, to a local `next dev`.
 *   assertLocalBaseUrl() runs before anything else — before the out dir is
 *   made or a browser launched — and refuses any host but localhost /
 *   127.0.0.1. No file of this harness may import scripts/load-env.ts,
 *   dotenv, lib/db, Prisma, or read DATABASE_URL: load-env.ts prefers
 *   .env.production.local, so a single such import would point this script
 *   at the production database. Any state it needs (the empty trip) it
 *   creates through the local app's own UI. run.test.ts pins this with a
 *   test that scans every harness file's imports.
 *
 * TRAPS THIS HARNESS IS BUILT AROUND
 * -----------------
 *   1. esbuild's `__name`. tsx compiles this file with esbuild, which wraps
 *      named inner functions in a `__name(...)` helper that only exists in
 *      this module. Pass a TS function to page.evaluate() and the page
 *      throws `ReferenceError: __name is not defined`. So every non-trivial
 *      piece of in-page code (the collector, the share-link reader below)
 *      is a plain JS string.
 *   2. Leaflet renders after `networkidle`. Map routes click their hidden
 *      map open ("Show day map", the wishlist "Map" tab), then wait on
 *      `.leaflet-marker-icon` and record the marker count — never trusting
 *      network idle alone (see contrast-audit.ts, trap 1).
 *   3. A broken probe reports success. A collector that silently measures
 *      nothing (selector drift, a page that errored into its boundary)
 *      would pass every check. A capture with zero elements is therefore a
 *      failure, exactly like an error — and so is a signed-in capture that
 *      landed on /signin.
 *   4. `next dev`'s own dev-tools badge sits bottom-left, over the mobile
 *      tab bar. It is not app UI, so a style tag hides it after every load
 *      (HIDE_DEV_CHROME_JS) — otherwise every phone screenshot shows it
 *      covering the first tab.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { Browser, BrowserContext, BrowserContextOptions, BrowserType, Page } from "playwright";

import {
  applyThemeClass,
  deriveDayDates,
  ensureAuthenticated,
  markerCount,
  middleDate,
  resolvePlaywright,
  revealMap,
} from "./lib/audit-browser";
import { captureSlices } from "./layout-audit/capture";
import { classify, type AutoFinding } from "./layout-audit/checks";
import { COLLECTOR_SCRIPT, type RawCollect } from "./layout-audit/collector";
import {
  assertLocalBaseUrl,
  buildCaptureMatrix,
  resolveOutDir,
  viewportFor,
  type CaptureSpec,
  type PhaseName,
  type TripKey,
} from "./layout-audit/config";
import { focusFirstInput, openOverlay, OVERLAYS, type OverlayRecipe } from "./layout-audit/overlays";
import {
  filterCaptures,
  mergeRerun,
  rerunExitCode,
  shotLocation,
  summarise,
  type CaptureRecord,
  type Gap,
  type Manifest,
} from "./layout-audit/run";
import { EXPECTED_PHASE, TRIP_NAMES, ensureEmptyTrip, readPhase, resolveTrips } from "./layout-audit/trips";

const NAV_TIMEOUT_MS = 30_000;
const MARKER_WAIT_MS = 8_000;
const SETTLE_MS = 300;
const KEYBOARD_PX = 300;

type PhaseKey = "sketching" | "final-prep" | "travelling" | "past";
const PHASE_KEYS: PhaseKey[] = ["sketching", "final-prep", "travelling", "past"];

/** Playwright errors carry a multi-line "Call log:" after the summary; keep
 * the summary, collapsed to one line. */
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\nCall log:")[0].replace(/\s+/g, " ").trim().slice(0, 500);
}

// --------------------------------------------------------------------------
// Setup: auth, trips, then (for the captures actually wanted) share token
// and day dates — all on one short-lived context
// --------------------------------------------------------------------------

/** Plain JS string, not a TS function (trap 1). The share URL is rendered as
 * text in the settings share panel; a link to it counts too. */
const SHARE_TOKEN_JS = String.raw`(() => {
  const a = document.querySelector('a[href*="/share/"]');
  const text = (a ? a.getAttribute("href") || "" : "") + "\n" + document.body.innerText;
  const m = text.match(/\/share\/([0-9a-f-]{36})/);
  return m ? m[1] : null;
})()`;

interface Setup {
  tripIds: Partial<Record<TripKey, string>>;
  phases: Partial<Record<TripKey, PhaseName | null>>;
  /** Run-level gaps: trips, the empty trip, the share link. Overlay gaps
   * are added per capture, with their captureId. */
  gaps: Gap[];
  /** Run-level gap keys this run evaluated — see mergeRerun. */
  evaluated: string[];
  shareToken?: string;
  dayDates: Partial<Record<TripKey, string | null>>;
  dayErrors: Partial<Record<TripKey, string>>;
}

async function gotoPage(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
  } catch (err) {
    // The first hit on a route makes `next dev` compile it, which can
    // outlast the timeout; one retry covers that without hiding a page that
    // genuinely never settles (the retry's own failure propagates).
    console.log(`  (retrying ${url} once after: ${errorText(err)})`);
    await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
  }
}

async function newBootContext(browser: Browser, authStatePath: string): Promise<BrowserContext> {
  if (!fs.existsSync(authStatePath)) {
    console.log(`auth: no storageState at ${authStatePath} — signing in fresh`);
    return browser.newContext();
  }
  try {
    return await browser.newContext({ storageState: authStatePath });
  } catch (err) {
    console.log(`auth: unreadable storageState at ${authStatePath} (${errorText(err)}) — signing in fresh`);
    return browser.newContext();
  }
}

/** Auth bootstrap + trips. Signs in if needed and saves the session for every
 * later context to start from; resolves the trips by name, verifies their
 * phases, and makes sure the empty trip exists. */
async function bootstrap(
  ctx: BrowserContext,
  page: Page,
  baseUrl: string,
  authStatePath: string,
): Promise<Pick<Setup, "tripIds" | "phases" | "gaps" | "evaluated">> {
  await ensureAuthenticated(page, baseUrl, { timeoutMs: NAV_TIMEOUT_MS, authStatePath });
  if (new URL(page.url()).pathname.startsWith("/signin")) {
    throw new Error(
      `Auth bootstrap failed: still on ${page.url()} after "Continue as You". Is ALLOW_DEV_LOGIN=true on the dev server?`,
    );
  }
  await ctx.storageState({ path: authStatePath });
  console.log(`auth: signed in; storageState saved to ${authStatePath}`);

  const trips = await resolveTrips(page, baseUrl);
  const tripIds: Partial<Record<TripKey, string>> = { ...trips.ids };
  const gaps: Gap[] = trips.gaps.map(({ key, reason }) => ({ key, reason }));

  try {
    // Idempotent: trips.ids.empty is set whenever the trip already exists.
    tripIds.empty = await ensureEmptyTrip(page, baseUrl, trips.ids.empty);
    if (!trips.ids.empty) console.log(`trips: created "${TRIP_NAMES.empty}" (${tripIds.empty})`);
  } catch (err) {
    gaps.push({ key: "empty", reason: `could not create "${TRIP_NAMES.empty}": ${errorText(err)}` });
  }

  const gapKeys = new Set(gaps.map((g) => g.key));
  const phases: Partial<Record<TripKey, PhaseName | null>> = {};
  for (const [key, expected] of Object.entries(EXPECTED_PHASE) as [TripKey, PhaseName][]) {
    if (tripIds[key]) phases[key] = gapKeys.has(key) ? null : expected;
  }
  if (tripIds.empty) phases.empty = await readPhase(page, baseUrl, tripIds.empty);

  return { tripIds, phases, gaps, evaluated: Object.keys(TRIP_NAMES) };
}

/** The share token and day dates — looked up only when a wanted capture
 * needs them, so a filtered re-run stays quick. Appends to `base.gaps` and
 * `base.evaluated` in place (the share link's gap and key). */
async function lookups(
  page: Page,
  baseUrl: string,
  base: Pick<Setup, "tripIds" | "gaps" | "evaluated">,
  specs: CaptureSpec[],
): Promise<Pick<Setup, "shareToken" | "dayDates" | "dayErrors">> {
  const { tripIds, gaps, evaluated } = base;

  let shareToken: string | undefined;
  if (specs.some((s) => s.route.path?.includes("{token}"))) {
    evaluated.push("share");
    if (!tripIds.deep) {
      gaps.push({ key: "share", reason: "no deep trip to read a share link from" });
    } else {
      await gotoPage(page, `${baseUrl}/trips/${tripIds.deep}/settings`);
      shareToken = (await page.evaluate<string | null>(SHARE_TOKEN_JS)) ?? undefined;
      if (!shareToken) gaps.push({ key: "share", reason: "no share link on settings" });
    }
  }

  const dayDates: Partial<Record<TripKey, string | null>> = {};
  const dayErrors: Partial<Record<TripKey, string>> = {};
  for (const trip of new Set(specs.filter((s) => s.route.sub?.includes("{date}")).map((s) => s.trip))) {
    const id = tripIds[trip];
    if (!id) continue;
    try {
      dayDates[trip] = middleDate(await deriveDayDates(page, baseUrl, id));
    } catch (err) {
      dayErrors[trip] = `could not derive a day date from the calendar: ${errorText(err)}`;
    }
  }

  return { shareToken, dayDates, dayErrors };
}

// --------------------------------------------------------------------------
// Planning one capture: which URL, or why it can't run
// --------------------------------------------------------------------------

type Plan =
  | { kind: "run"; route: string; tripId?: string; recipe?: OverlayRecipe }
  | { kind: "skip" | "error"; route: string; tripId?: string; reason: string };

function planCapture(spec: CaptureSpec, setup: Setup): Plan {
  if (spec.overlay !== undefined) {
    const recipe = OVERLAYS.find((r) => r.id === spec.overlay);
    if (!recipe) return { kind: "error", route: "", reason: `unknown overlay recipe "${spec.overlay}"` };
    if (!recipe.tripScoped) return { kind: "run", route: recipe.route, recipe };
    const tripId = setup.tripIds.deep;
    if (!tripId) return { kind: "skip", route: recipe.route, reason: "coverage gap: no deep trip" };
    return { kind: "run", route: `/trips/${tripId}${recipe.route}`, tripId, recipe };
  }

  const { route } = spec;
  if (route.tripScoped) {
    const sub = route.sub ?? "";
    const tripId = setup.tripIds[spec.trip];
    if (!tripId) return { kind: "skip", route: sub, reason: `coverage gap: no ${spec.trip} trip` };
    if (sub.includes("{date}")) {
      const error = setup.dayErrors[spec.trip];
      if (error) return { kind: "error", route: `/trips/${tripId}${sub}`, tripId, reason: error };
      const date = setup.dayDates[spec.trip];
      if (!date) return { kind: "skip", route: `/trips/${tripId}${sub}`, tripId, reason: "n/a: no dated days" };
      return { kind: "run", route: `/trips/${tripId}${sub.replace("{date}", date)}`, tripId };
    }
    return { kind: "run", route: `/trips/${tripId}${sub}`, tripId };
  }

  const p = route.path ?? "/";
  if (p.includes("{token}")) {
    if (!setup.shareToken) return { kind: "skip", route: p, reason: "coverage gap: no share link on settings" };
    return { kind: "run", route: p.replace("{token}", setup.shareToken) };
  }
  return { kind: "run", route: p };
}

function recordFor(spec: CaptureSpec, plan: Plan, setup: Setup): CaptureRecord {
  const rec: CaptureRecord = {
    id: spec.id,
    set: spec.set,
    route: plan.route,
    routeLabel: spec.route.label,
    trip: spec.trip,
    width: spec.width,
    theme: spec.theme,
    media: spec.media,
    files: [],
    elementCount: 0,
    findings: 0,
    ms: 0,
  };
  if (plan.tripId) {
    rec.tripId = plan.tripId;
    const phase = setup.phases[spec.trip];
    if (phase !== undefined) rec.phase = phase;
  }
  if (spec.overlay !== undefined) rec.overlay = spec.overlay;
  if (spec.keyboard) rec.keyboard = true;
  if (plan.kind === "skip") rec.skipped = plan.reason;
  if (plan.kind === "error") rec.error = plan.reason;
  return rec;
}

// --------------------------------------------------------------------------
// Running one capture
// --------------------------------------------------------------------------

/** Trap 4: `next dev` paints its own dev-tools badge (bottom-left, over the
 * mobile tab bar's first tab). Travellers never see it, so it's hidden from
 * the screenshots. It lives in a shadow root on a zero-size host, so the
 * collector never measured it either way. */
const HIDE_DEV_CHROME_JS = `(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.appendChild(s); })()`;

/** Removes this capture's screenshots from an earlier run into the same out
 * dir, so a re-run that yields fewer slices (or none — a new gap / error)
 * can't leave a stale `-partN.png` next to the fresh ones. */
function clearShots(dir: string, baseName: string): void {
  if (!fs.existsSync(dir)) return;
  const mine = new RegExp(`^${baseName}(?:-part\\d+)?\\.png$`);
  for (const f of fs.readdirSync(dir)) if (mine.test(f)) fs.unlinkSync(path.join(dir, f));
}

/**
 * Overlay captures are one viewport screenshot — what a Traveller sees with
 * the overlay open — not full-page slices. A full-page composite draws
 * fixed-position layers against a scroll position the image doesn't show
 * (a menu opened mid-page lands off its trigger, split across slices, with
 * the tab bar painted over it), and for the keyboard variant it paints the
 * page where the on-screen keyboard would be. At most 800 CSS px × 2 =
 * 1600 device px tall, inside the 2000px slice limit.
 */
async function captureViewport(page: Page, dir: string, baseName: string): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.resolve(dir, `${baseName}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  return file;
}

async function runCapture(
  page: Page,
  spec: CaptureSpec,
  plan: Extract<Plan, { kind: "run" }>,
  rec: CaptureRecord,
  ctx: { baseUrl: string; outDir: string; findings: AutoFinding[]; gaps: Gap[] },
): Promise<void> {
  const vp = viewportFor(spec.width);
  const { dir, baseName } = shotLocation(ctx.outDir, spec);
  clearShots(dir, baseName);

  await gotoPage(page, `${ctx.baseUrl}${plan.route}`);
  if (spec.route.auth && new URL(page.url()).pathname.startsWith("/signin")) {
    throw new Error(`landed on ${page.url()} — the session is not signed in`);
  }
  await page.evaluate(HIDE_DEV_CHROME_JS);
  await applyThemeClass(page, spec.theme);
  await page.emulateMedia({ media: spec.media });
  if (spec.route.isMap && spec.media === "screen") {
    await revealMap(page, spec.route.reveal, MARKER_WAIT_MS);
    rec.markerCount = await markerCount(page);
  }

  const { recipe } = plan;
  try {
    if (recipe) {
      const opened = await openOverlay(page, recipe);
      if (!opened.ok) {
        rec.skipped = `coverage gap: ${opened.reason}`;
        ctx.gaps.push({
          key: `overlay:${recipe.id}`,
          reason: `${opened.reason} (at ${spec.width}${spec.keyboard ? ", keyboard" : ""})`,
          captureId: spec.id,
        });
        return;
      }
      if (spec.keyboard) {
        await page.setViewportSize({ width: vp.width, height: vp.height - KEYBOARD_PX });
        await focusFirstInput(page, recipe);
      }
    }

    await page.waitForTimeout(SETTLE_MS);
    rec.files = recipe
      ? [await captureViewport(page, dir, baseName)]
      : await captureSlices(page, { dir, baseName, width: vp.width, deviceScaleFactor: vp.deviceScaleFactor });
    const raw = await page.evaluate<RawCollect>(COLLECTOR_SCRIPT);
    const found = classify(raw, spec.id);
    rec.elementCount = raw.elementCount;
    rec.findings = found.length;
    ctx.findings.push(...found);
  } finally {
    if (recipe) {
      await page.keyboard.press("Escape").catch(() => {});
      if (spec.keyboard) await page.setViewportSize({ width: vp.width, height: vp.height }).catch(() => {});
    }
  }
}

function logLine(rec: CaptureRecord, n: number, total: number): string {
  const label = rec.overlay ?? rec.routeLabel;
  const head = `[${rec.set}] ${label} ${rec.trip} ${rec.width}-${rec.theme}${rec.keyboard ? "-kbd" : ""}`;
  const tail = `(${rec.ms}ms, ${n}/${total})`;
  if (rec.error !== undefined) return `${head} — ERROR ${rec.error} ${tail}`;
  if (rec.skipped !== undefined) return `${head} — SKIPPED ${rec.skipped} ${tail}`;
  const markers = rec.markerCount !== undefined ? ` markers=${rec.markerCount}` : "";
  return `${head} — elements=${rec.elementCount} findings=${rec.findings}${markers} ${tail}`;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

interface Group {
  width: number;
  theme: CaptureSpec["theme"];
  auth: boolean;
  items: { index: number; spec: CaptureSpec; plan: Extract<Plan, { kind: "run" }> }[];
}

async function audit(
  browser: Browser,
  opts: { baseUrl: string; outDir: string; authStatePath: string; only: string | undefined; startedAt: string },
): Promise<void> {
  const { baseUrl, outDir, authStatePath, only } = opts;

  // Setup, on one short-lived context: auth + trips first (the matrix's
  // phase set depends on which phase trips verified), then only the
  // lookups the filtered captures actually need.
  const bootCtx = await newBootContext(browser, authStatePath);
  let setup: Setup;
  let matrix: CaptureSpec[];
  let specs: CaptureSpec[];
  try {
    const page = await bootCtx.newPage();
    const base = await bootstrap(bootCtx, page, baseUrl, authStatePath);
    const gapKeys = new Set(base.gaps.map((g) => g.key));
    const phaseTripsAvailable = PHASE_KEYS.filter((k) => base.tripIds[k] && !gapKeys.has(k));
    matrix = buildCaptureMatrix({
      overlays: OVERLAYS.map(({ id, only: o, form }) => ({ id, only: o, form })),
      phaseTripsAvailable,
    });
    specs = filterCaptures(matrix, only);
    setup = { ...base, ...(await lookups(page, baseUrl, base, specs)) };
  } finally {
    await bootCtx.close().catch(() => {});
  }

  console.log(
    `trips: ${Object.entries(setup.tripIds)
      .map(([k, id]) => `${k}=${id}`)
      .join(" ")}`,
  );
  console.log(`matrix: ${matrix.length} captures${only ? `; ${specs.length} match LAYOUT_AUDIT_ONLY="${only}"` : ""}`);

  const records: CaptureRecord[] = new Array(specs.length);
  const findings: AutoFinding[] = [];
  const captureGaps: Gap[] = [];
  const groups = new Map<string, Group>();
  let done = 0;

  specs.forEach((spec, index) => {
    const plan = planCapture(spec, setup);
    if (plan.kind !== "run") {
      records[index] = recordFor(spec, plan, setup);
      console.log(logLine(records[index], ++done, specs.length));
      return;
    }
    const key = `${spec.width}|${spec.theme}|${spec.route.auth}`;
    const group = groups.get(key) ?? { width: spec.width, theme: spec.theme, auth: spec.route.auth, items: [] };
    group.items.push({ index, spec, plan });
    groups.set(key, group);
  });

  for (const group of groups.values()) {
    const vp = viewportFor(group.width);
    const contextOpts: BrowserContextOptions = {
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
      colorScheme: group.theme,
    };
    if (group.auth) contextOpts.storageState = authStatePath;

    let context: BrowserContext | undefined;
    try {
      context = await browser.newContext(contextOpts);
      let page = await context.newPage();
      for (const { index, spec, plan } of group.items) {
        const rec = recordFor(spec, plan, setup);
        const t0 = Date.now();
        let failed = false;
        try {
          await runCapture(page, spec, plan, rec, { baseUrl, outDir, findings, gaps: captureGaps });
        } catch (err) {
          rec.error = errorText(err);
          failed = true;
        }
        rec.ms = Date.now() - t0;
        records[index] = rec;
        console.log(logLine(rec, ++done, specs.length));
        if (failed) {
          // A fresh page, so a wedged one (a stuck dialog, a half-finished
          // navigation) can't poison the rest of the group.
          await page.close().catch(() => {});
          page = await context.newPage();
        }
      }
    } catch (err) {
      for (const { index, spec, plan } of group.items) {
        if (records[index]) continue;
        records[index] = { ...recordFor(spec, plan, setup), error: `browser context failed: ${errorText(err)}` };
        console.log(logLine(records[index], ++done, specs.length));
      }
    } finally {
      await context?.close().catch(() => {});
    }
  }

  // This run's own records. A filtered re-run merges them into the out dir's
  // existing manifest below, but the verdict still counts them on their own:
  // a re-run that captured nothing must fail even when the merged manifest
  // (then just the previous run's) is clean.
  const thisRun: Manifest = {
    startedAt: opts.startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl,
    outDir,
    trips: Object.fromEntries(Object.entries(setup.tripIds).filter((e): e is [string, string] => Boolean(e[1]))),
    gaps: [...setup.gaps, ...captureGaps],
    captures: records,
  };
  let manifest = thisRun;
  let allFindings = findings;

  const manifestPath = path.join(outDir, "manifest.json");
  const findingsPath = path.join(outDir, "findings.auto.json");
  if (only && fs.existsSync(manifestPath)) {
    try {
      const prev = {
        manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest,
        findings: fs.existsSync(findingsPath) ? (JSON.parse(fs.readFileSync(findingsPath, "utf8")) as AutoFinding[]) : [],
      };
      ({ manifest, findings: allFindings } = mergeRerun(prev, { manifest: thisRun, findings }, setup.evaluated));
      console.log(`merged ${records.length} re-run capture(s) into the existing ${manifestPath}`);
    } catch (err) {
      console.log(`could not merge into the existing ${manifestPath} (${errorText(err)}) — overwriting it`);
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(findingsPath, JSON.stringify(allFindings, null, 2) + "\n");
  console.log("");
  console.log(summarise(manifest, allFindings, thisRun));
  process.exitCode = rerunExitCode(thisRun, manifest);
}

async function main(): Promise<void> {
  // The hard safety rule comes first: nothing — not even the out dir — is
  // touched before the target is known to be local.
  let baseUrl: string;
  let outDir: string;
  try {
    baseUrl = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3000").origin;
    outDir = resolveOutDir(process.env, new Date());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const startedAt = new Date().toISOString();

  let chromium: BrowserType;
  try {
    ({ chromium } = resolvePlaywright());
  } catch (err) {
    // A documented prerequisite problem, not a bug — print just the
    // actionable message (see resolvePlaywright()), not a stack.
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  console.log(`layout audit: ${baseUrl} → ${outDir}`);
  const browser = await chromium.launch();
  try {
    await audit(browser, {
      baseUrl,
      outDir,
      authStatePath: process.env.LAYOUT_AUDIT_AUTH_STATE ?? "/tmp/auth.json",
      only: process.env.LAYOUT_AUDIT_ONLY?.trim() || undefined,
      startedAt,
    });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
