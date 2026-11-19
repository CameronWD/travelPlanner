/**
 * Layout audit — `npm run audit:layout`. Screenshots every screen of the
 * app on named device profiles (iPhones in WebKit, desktops in Chromium),
 * runs seven automatic layout checks on each capture, drags every page from
 * 2560px down to 320px and back, and records what each main page shows
 * while it loads and how much it shifts — so reviewers can grade what
 * actually rendered. Spec: docs/specs/2026-09-24-layout-audit.md (Stage 1).
 *
 * WHAT IT DOES
 * -----------------
 *   1. Refuses to run unless BASE_URL is local, and — on its first page
 *      load — unless that server is `next dev` (see THE HARD SAFETY RULE).
 *   2. Signs in (auth bootstrap below) and resolves the trips the chosen
 *      sets need BY NAME on /trips: the "deep" trip (LAYOUT_AUDIT_DEEP_TRIP,
 *      default the demo seed's EU Christmas 2026), one demo trip per Phase
 *      for the phase set, and "Layout audit — empty" for the empty set,
 *      which it creates through the app's own /trips/new form if it doesn't
 *      exist yet — the ONE write this harness makes, and only when the empty
 *      set is asked for. Each phase trip's Phase is read off Home's
 *      `[data-trip-phase]` marker; a trip that has drifted into another
 *      Phase is a COVERAGE GAP, never audited as if it were still in the old
 *      one.
 *   3. Builds the capture matrix (layout-audit/config.ts: deep, phase,
 *      empty, dark, print, overlay and loading sets) and runs it, one
 *      browser context per (device profile, theme, signed-in) group. Per
 *      capture: load the route and wait for it to settle (audit-browser.ts
 *      SETTLED_JS — not `networkidle`, see trap 2), apply the theme, reveal
 *      and wait for any map, open the overlay if it is one (plus the
 *      simulated on-screen keyboard variant: viewport 300px shorter, first
 *      field focused), let motion settle, screenshot (pages: scrolled
 *      through one viewport at a time with fixed chrome hidden, plus the
 *      first screen and the page end with it shown — see captureSlices;
 *      overlays: the viewport — see captureViewport), THEN run the in-page
 *      collector (it scrolls to the end to measure the mobile tab bar, and
 *      the screenshots must show the page as it loaded) and classify its
 *      geometry into findings.
 *   4. The resize crawl (layout-audit/resize.ts): every route on the deep
 *      trip, loaded once at 2560px in Chromium and stepped down to 320px
 *      and back up with no reload, checked for breakage at each step.
 *   5. Layout shift (layout-audit/loading.ts): CLS for each main route on a
 *      normal load at the iPhone 17's viewport, in Chromium.
 *   6. Writes the outputs and a summary, and sets the exit code.
 *   One capture failing never aborts the run: it is recorded with its
 *   error and the run carries on.
 *
 * NOTHING HERE SUBMITS. Overlay recipes open forms, dialogs and menus and
 * stop; see overlays.ts (SUBMIT_LABELS, and the note on reading a trigger's
 * component first). Loading a trip page does make the app remember it as
 * the last trip opened; that is the app, not the harness.
 *
 * PREREQUISITES
 * -----------------
 *   - A running `next dev` server (`npm run dev`) at BASE_URL — never
 *     `next start`, which would load .env.production.local.
 *   - Playwright's browsers: `npx playwright install chromium webkit` once.
 *   - ALLOW_DEV_LOGIN=true on the server (it is, in .env, for local use).
 *     The auth bootstrap signs in through the "Continue as You" dev login
 *     button whenever the saved session is missing or expired, then saves
 *     a fresh storageState to LAYOUT_AUDIT_AUTH_STATE for every later
 *     context (both engines) to reuse — so a missing /tmp/auth.json is not
 *     an error. Use one auth-state file per database.
 *   - Maps: the Google Maps browser key is restricted by referrer. On a
 *     port it does not allow, every map renders its "didn't load" panel.
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
 *   LAYOUT_AUDIT_SETS         Comma list of what to run: deep, phase, empty,
 *                             dark, print, overlay, loading, resize, cls.
 *                             Default: all. A database with no demo cast
 *                             runs without "phase,empty"; the demo database
 *                             then runs just those.
 *   LAYOUT_AUDIT_DEEP_TRIP    The deep trip's name as /trips shows it.
 *                             Default "EU Christmas 2026" (the demo seed),
 *                             whose Phase is then verified; any other
 *                             trip's Phase is recorded as found.
 *   LAYOUT_AUDIT_DAY          YYYY-MM-DD for the deep trip's `day` route and
 *                             the Day overlays. Default: the middle date
 *                             linked from the trip's Calendar.
 *   LAYOUT_AUDIT_CHECKIN_DAY  YYYY-MM-DD of a day with an accommodation
 *                             check-in, for the `day-checkin` route. Unset:
 *                             that route is a coverage gap.
 *   LAYOUT_AUDIT_ONLY         Substring filter on ids for quick re-runs,
 *                             e.g. "deep/plan/deep/mbp14-light",
 *                             "overlay/stop-add/", "resize/plan" or
 *                             "cls/" (commas separate alternatives; capture
 *                             ids mirror the shot paths below, minus the
 *                             .png; the crawl's are `resize/<routeLabel>`,
 *                             CLS's `cls/<routeLabel>`).
 *
 *   A run that does not do everything (LAYOUT_AUDIT_ONLY, or only some
 *   sets) into an out dir that already holds a manifest MERGES into it —
 *   re-run captures replace their old records and findings, re-run routes
 *   replace their resize / CLS results — so re-running a few failures, or
 *   running the sets in several passes, never throws away what is there.
 *   The exit code still fails a run that captured nothing.
 *
 * OUTPUT (the contract crops.ts and the review steps read)
 * -----------------
 *   <out>/manifest.json        every capture: route, trip, phase, device
 *                              profile, width, theme, overlay, files, marker
 *                              count, element and finding counts, error /
 *                              skip reason, timing; plus the trip ids and
 *                              coverage gaps.
 *   <out>/findings.auto.json   every automatic-check hit (AutoFinding[]).
 *   <out>/resize.findings.json per route: breakage on the way down, by
 *                              element, with the widths it held at
 *                              (`range`), and `notRecovered` — breakage on
 *                              the way back up that the way down did not
 *                              have at that width.
 *   <out>/cls.json             per route: CLS, the shift count, and the
 *                              five largest shifts with the elements that
 *                              moved.
 *   <out>/shots/<set>/<routeLabel>/<trip>/<profile>-<theme>.png
 *                              (pages taller than one viewport, i.e. nearly
 *                              all: -part1.png, -part2.png, …, drawn with
 *                              fixed chrome hidden and sticky chrome
 *                              un-stuck; every page capture then adds
 *                              -fold.png and -end.png — the first screen and
 *                              the page end as a Traveller sees them, tab
 *                              bar and all — listed last in `files`)
 *   <out>/shots/overlay/<overlayId>/<profile>-<theme>[-kbd].png
 *                              (always one viewport image)
 *   <out>/shots/loading/<routeLabel>/<trip>/<profile>-<theme>-hard-150ms.png
 *                              (and -hard-800ms, -nav-150ms, -nav-800ms —
 *                              see loading.ts for what each shows)
 *   <out>/shots/resize/<routeLabel>/<width>-down.png | -up.png
 *                              (only at a width where a finding first
 *                              appeared; at most 12 per route)
 *
 *   Phone shots are at DPR 3: slices are capped at 2000 device px tall, but
 *   the viewport shots (-fold, -end, overlays, loading) are a whole screen,
 *   up to 1206×2622.
 *
 * WHAT THE PHONE PROFILES ARE NOT
 * -----------------
 *   WebKit on a Mac with an iPhone's viewport, DPR, touch and user agent —
 *   Safari's engine, not an iPhone. Not reproduced: the safe-area insets
 *   (`env(safe-area-inset-*)` is 0, so the tab bar and sheets lack the
 *   home-indicator padding and nothing sits under a status bar or Dynamic
 *   Island); `display-mode: standalone` (lib/standalone.ts reads "not
 *   installed" in the -pwa profiles too, so the install nudge can show); the
 *   real keyboard (the -kbd variant shortens the layout viewport, where iOS
 *   shrinks only the visual viewport and scrolls the focused field into
 *   it — a layout that reads `visualViewport` sees no keyboard here);
 *   Safari's collapsing bars and rubber-banding; iOS's own form controls
 *   and text zoom on focus.
 *
 * EXIT CODE
 * -----------------
 *   Non-zero when nothing was captured, any capture errored, any capture
 *   measured zero elements, or a resize / CLS route errored. Findings do
 *   NOT fail Stage 1, and neither do skipped captures (a route with no
 *   dated days, an overlay whose trigger isn't there) — those are printed
 *   as COVERAGE GAPs instead.
 *
 * THE HARD SAFETY RULE — HTTP ONLY
 * -----------------
 *   The harness talks to the app only over HTTP, to a local `next dev`.
 *   assertLocalBaseUrl() runs before anything else — before the out dir is
 *   made or a browser launched — and refuses any host but localhost /
 *   127.0.0.1. A `next start` on localhost would pass that, so the run's
 *   first page load must also carry `next dev`'s overlay host
 *   (<nextjs-portal>), or assertNextDev() stops the run there — before the
 *   sign-in click and before any capture. No file of this harness may
 *   import scripts/load-env.ts, dotenv, lib/db, Prisma, or read
 *   DATABASE_URL: load-env.ts prefers .env.production.local, so a single
 *   such import would point this script at the production database. Any state it needs (the empty trip) it
 *   creates through the local app's own UI. run.test.ts pins this with an
 *   allowlist over every harness file's module references: relative paths
 *   inside scripts/layout-audit/ or scripts/lib/ (scanned
 *   in turn), `node:` builtins, and `playwright` — values only in scripts/lib/audit-browser.ts — nothing else.
 *
 * TRAPS THIS HARNESS IS BUILT AROUND
 * -----------------
 *   1. esbuild's `__name`. tsx compiles this file with esbuild, which wraps
 *      named inner functions in a `__name(...)` helper that only exists in
 *      this module. Pass a TS function to page.evaluate() and the page
 *      throws `ReferenceError: __name is not defined`. So every non-trivial
 *      piece of in-page code (the collector, the share-link reader below)
 *      is a plain JS string.
 *   2. `networkidle` lies in both directions. With a Maps key the map's
 *      worker blobs never finish, so Chromium never goes idle and every map
 *      page times out; WebKit goes idle while /trips still shows its
 *      loading skeleton. Loads wait on SETTLED_JS instead (document
 *      complete, no Suspense boundary still streaming, buttons hydrated,
 *      fonts in, resources quiet). The map still renders after that: map
 *      routes click their hidden map open ("Show day map", the wishlist
 *      "Map" tab), then wait on `.tp-map-pin` or the keyless
 *      `[data-map-fallback]` and record the pin count.
 *   3. A broken probe reports success. A collector that silently measures
 *      nothing (selector drift, a page that errored into its boundary)
 *      would pass every check. A capture with zero elements is therefore a
 *      failure, exactly like an error — and so is a signed-in capture that
 *      landed on the Landing at "/".
 *   4. `next dev`'s own dev-tools badge sits bottom-left, over the mobile
 *      tab bar. It is not app UI, so a style tag hides it after every load
 *      (HIDE_DEV_CHROME_JS) — otherwise every phone screenshot shows it
 *      covering the first tab.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";

import {
  applyThemeClass,
  deriveDayDates,
  ensureAuthenticated,
  gotoSettled,
  markerCount,
  middleDate,
  resolvePlaywright,
  revealMap,
} from "./lib/audit-browser";
import { captureSlices, isShotOf } from "./layout-audit/capture";
import { classify, type AutoFinding } from "./layout-audit/checks";
import { COLLECTOR_SCRIPT, type RawCollect } from "./layout-audit/collector";
import {
  assertLocalBaseUrl,
  buildCaptureMatrix,
  LOADING_ROUTE_LABELS,
  parseSets,
  profileFor,
  resolveOutDir,
  ROUTES,
  type CaptureSpec,
  type DeviceProfile,
  type Engine,
  type PhaseName,
  type RouteDef,
  type RunSet,
  type TripKey,
} from "./layout-audit/config";
import { captureLoading, measureCls, mergeCls, type ClsResult } from "./layout-audit/loading";
import { focusFirstInput, openOverlay, OVERLAYS, type OverlayRecipe } from "./layout-audit/overlays";
import { crawlRoute, mergeResize, RESIZE_HEIGHT, type ResizeRouteResult } from "./layout-audit/resize";
import {
  assertNextDev,
  filterCaptures,
  matchesOnly,
  mergeRerun,
  NEXT_DEV_OVERLAY_SELECTOR,
  rerunExitCode,
  shotLocation,
  summarise,
  type CaptureRecord,
  type Gap,
  type Manifest,
} from "./layout-audit/run";
import {
  EXPECTED_PHASE,
  SHARE_TEXT_JS,
  TRIP_NAMES,
  ensureEmptyTrip,
  parseShareToken,
  readPhase,
  resolveTrips,
} from "./layout-audit/trips";

const NAV_TIMEOUT_MS = 30_000;
const DEV_OVERLAY_WAIT_MS = 5_000;
const MARKER_WAIT_MS = 8_000;
const SETTLE_MS = 300;
const KEYBOARD_PX = 300;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  /** LAYOUT_AUDIT_CHECKIN_DAY, for the deep trip's `day-checkin` route. */
  checkinDate?: string;
}

/** What the environment asks of this run, beyond where to point it. */
interface RunOptions {
  sets: Set<RunSet>;
  /** LAYOUT_AUDIT_DEEP_TRIP: the deep trip's name on /trips. */
  deepTripName?: string;
  /** LAYOUT_AUDIT_DAY: the deep trip's `day` date, instead of a derived one. */
  dayDate?: string;
  checkinDate?: string;
}

async function gotoPage(page: Page, url: string): Promise<void> {
  try {
    await gotoSettled(page, url, NAV_TIMEOUT_MS);
  } catch (err) {
    // The first hit on a route makes `next dev` compile it, which can
    // outlast the timeout; one retry covers that without hiding a page that
    // genuinely never loads (the retry's own failure propagates).
    console.log(`  (retrying ${url} once after: ${errorText(err)})`);
    await gotoSettled(page, url, NAV_TIMEOUT_MS);
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
  options: RunOptions,
): Promise<Pick<Setup, "tripIds" | "phases" | "gaps" | "evaluated">> {
  await ensureAuthenticated(page, baseUrl, {
    timeoutMs: NAV_TIMEOUT_MS,
    authStatePath,
    // The run's first page load: refuse anything but `next dev` before
    // signing in or capturing anything (see assertNextDev).
    afterFirstLoad: async (first) => {
      const found = await first
        .waitForSelector(NEXT_DEV_OVERLAY_SELECTOR, { state: "attached", timeout: DEV_OVERLAY_WAIT_MS })
        .then(
          () => true,
          () => false,
        );
      assertNextDev(baseUrl, found);
      console.log(`target: ${baseUrl} is \`next dev\` (<${NEXT_DEV_OVERLAY_SELECTOR}> present)`);
    },
  });
  if (new URL(page.url()).pathname === "/") {
    throw new Error(
      `Auth bootstrap failed: still on ${page.url()} after "Continue as You". Is ALLOW_DEV_LOGIN=true on the dev server?`,
    );
  }
  await ctx.storageState({ path: authStatePath });
  console.log(`auth: signed in; storageState saved to ${authStatePath}`);

  // Only the trips this run's sets need: a pass over a database that has no
  // phase cast must not report five missing trips, and must not create the
  // empty trip there (the one write this harness makes).
  const names: Partial<Record<Exclude<TripKey, "none">, string>> = { deep: options.deepTripName ?? TRIP_NAMES.deep };
  if (options.sets.has("phase")) for (const key of PHASE_KEYS) names[key] = TRIP_NAMES[key];
  if (options.sets.has("empty")) names.empty = TRIP_NAMES.empty;

  const trips = await resolveTrips(page, baseUrl, names);
  const tripIds: Partial<Record<TripKey, string>> = { ...trips.ids };
  const gaps: Gap[] = trips.gaps.map(({ key, reason }) => ({ key, reason }));

  if (names.empty) {
    try {
      // Idempotent: trips.ids.empty is set whenever the trip already exists.
      tripIds.empty = await ensureEmptyTrip(page, baseUrl, trips.ids.empty);
      if (!trips.ids.empty) console.log(`trips: created "${TRIP_NAMES.empty}" (${tripIds.empty})`);
    } catch (err) {
      gaps.push({ key: "empty", reason: `could not create "${TRIP_NAMES.empty}": ${errorText(err)}` });
    }
  }

  const gapKeys = new Set(gaps.map((g) => g.key));
  const phases: Partial<Record<TripKey, PhaseName | null>> = {};
  for (const [key, expected] of Object.entries(EXPECTED_PHASE) as [TripKey, PhaseName][]) {
    if (tripIds[key]) phases[key] = gapKeys.has(key) ? null : expected;
  }
  if (tripIds.deep && names.deep !== TRIP_NAMES.deep) phases.deep = await readPhase(page, baseUrl, tripIds.deep);
  if (tripIds.empty) phases.empty = await readPhase(page, baseUrl, tripIds.empty);

  return { tripIds, phases, gaps, evaluated: Object.keys(names) };
}

/** The share token and day dates — looked up only when a wanted capture
 * needs them, so a filtered re-run stays quick. Appends to `base.gaps` and
 * `base.evaluated` in place (the share link's gap and key). */
async function lookups(
  page: Page,
  baseUrl: string,
  base: Pick<Setup, "tripIds" | "gaps" | "evaluated">,
  specs: CaptureSpec[],
  needs: { share: boolean; deepDay: boolean },
  options: RunOptions,
): Promise<Pick<Setup, "shareToken" | "dayDates" | "dayErrors" | "checkinDate">> {
  const { tripIds, gaps, evaluated } = base;

  let shareToken: string | undefined;
  if (needs.share || specs.some((s) => s.route.path?.includes("{token}"))) {
    evaluated.push("share");
    if (!tripIds.deep) {
      gaps.push({ key: "share", reason: "no deep trip to read a share link from" });
    } else {
      await gotoPage(page, `${baseUrl}/trips/${tripIds.deep}/settings`);
      // The share URL is rendered as text in the settings share panel; a
      // link to it counts too (SHARE_TEXT_JS reads both).
      shareToken = parseShareToken(await page.evaluate<string>(SHARE_TEXT_JS));
      if (!shareToken) gaps.push({ key: "share", reason: "no share link on settings" });
    }
  }

  const dayDates: Partial<Record<TripKey, string | null>> = {};
  const dayErrors: Partial<Record<TripKey, string>> = {};
  const dayTrips = new Set(specs.filter((s) => s.route.sub?.includes("{date}")).map((s) => s.trip));
  const overlayNeedsDay = specs.some((s) => OVERLAYS.find((r) => r.id === s.overlay)?.route.includes("{date}"));
  if (needs.deepDay || overlayNeedsDay) dayTrips.add("deep");
  for (const trip of dayTrips) {
    const id = tripIds[trip];
    if (!id) continue;
    if (trip === "deep" && options.dayDate) {
      dayDates.deep = options.dayDate;
      continue;
    }
    try {
      dayDates[trip] = middleDate(await deriveDayDates(page, baseUrl, id));
    } catch (err) {
      dayErrors[trip] = `could not derive a day date from the calendar: ${errorText(err)}`;
    }
  }

  return { shareToken, dayDates, dayErrors, checkinDate: options.checkinDate };
}

/** A route's path for one trip, or why it has none. Shared by the capture
 * matrix, the resize crawl and the CLS measurement. */
function resolveRoute(route: RouteDef, trip: TripKey, setup: Setup): { path: string; tripId?: string } | { skip: string; tripId?: string } | { error: string; tripId?: string } {
  if (route.tripScoped) {
    const sub = route.sub ?? "";
    const tripId = setup.tripIds[trip];
    if (!tripId) return { skip: `coverage gap: no ${trip} trip` };
    if (sub.includes("{checkin}")) {
      if (!setup.checkinDate) return { skip: "coverage gap: LAYOUT_AUDIT_CHECKIN_DAY is not set", tripId };
      return { path: `/trips/${tripId}${sub.replace("{checkin}", setup.checkinDate)}`, tripId };
    }
    if (sub.includes("{date}")) {
      const error = setup.dayErrors[trip];
      if (error) return { error, tripId };
      const date = setup.dayDates[trip];
      if (!date) return { skip: "n/a: no dated days", tripId };
      return { path: `/trips/${tripId}${sub.replace("{date}", date)}`, tripId };
    }
    return { path: `/trips/${tripId}${sub}`, tripId };
  }
  const p = route.path ?? "/";
  if (p.includes("{token}")) {
    if (!setup.shareToken) return { skip: "coverage gap: no share link on settings" };
    return { path: p.replace("{token}", setup.shareToken) };
  }
  return { path: p };
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
    let route = recipe.route;
    if (route.includes("{date}")) {
      const date = setup.dayDates.deep;
      if (!date) return { kind: "skip", route, tripId, reason: setup.dayErrors.deep ?? "n/a: no dated days" };
      route = route.replace("{date}", date);
    }
    return { kind: "run", route: `/trips/${tripId}${route}`, tripId, recipe };
  }

  const template = spec.route.tripScoped ? (spec.route.sub ?? "") : (spec.route.path ?? "/");
  const resolved = resolveRoute(spec.route, spec.trip, setup);
  if ("path" in resolved) return { kind: "run", route: resolved.path, tripId: resolved.tripId };
  const route = resolved.tripId ? `/trips/${resolved.tripId}${template}` : template;
  if ("error" in resolved) return { kind: "error", route, tripId: resolved.tripId, reason: resolved.error };
  return { kind: "skip", route, tripId: resolved.tripId, reason: resolved.skip };
}

function recordFor(spec: CaptureSpec, plan: Plan, setup: Setup): CaptureRecord {
  const rec: CaptureRecord = {
    id: spec.id,
    set: spec.set,
    route: plan.route,
    routeLabel: spec.route.label,
    trip: spec.trip,
    profile: spec.profile,
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
 * collector never measured it either way. (The same host is the run's proof
 * that BASE_URL is `next dev` — see assertNextDev.) */
const HIDE_DEV_CHROME_JS = `(() => { const s = document.createElement("style"); s.textContent = "${NEXT_DEV_OVERLAY_SELECTOR} { display: none !important; }"; document.head.appendChild(s); })()`;

/** Removes this capture's screenshots from an earlier run into the same out
 * dir, so a re-run that yields fewer slices (or none — a new gap / error)
 * can't leave a stale `-partN.png` / `-end.png` next to the fresh ones. */
function clearShots(dir: string, baseName: string): void {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) if (isShotOf(baseName, f)) fs.unlinkSync(path.join(dir, f));
}

/**
 * Overlay captures are one viewport screenshot — what a Traveller sees with
 * the overlay open — not full-page slices. A full-page composite draws
 * fixed-position layers against a scroll position the image doesn't show
 * (a menu opened mid-page lands off its trigger, split across slices, with
 * the tab bar painted over it), and for the keyboard variant it paints the
 * page where the on-screen keyboard would be. At a phone's DPR 3 this is
 * up to 1206×2622 device px (iphone17-pwa) — taller than a page slice's
 * 2000px cap, and kept whole, since half a dialog is no use to a reviewer.
 */
async function captureViewport(page: Page, dir: string, baseName: string): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.resolve(dir, `${baseName}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  return file;
}

/** After every load: hide the dev badge, set the theme and the media. */
async function prepare(page: Page, spec: CaptureSpec): Promise<void> {
  await page.evaluate(HIDE_DEV_CHROME_JS);
  await applyThemeClass(page, spec.theme);
  await page.emulateMedia({ media: spec.media });
}

async function runCapture(
  page: Page,
  spec: CaptureSpec,
  plan: Extract<Plan, { kind: "run" }>,
  rec: CaptureRecord,
  ctx: { baseUrl: string; outDir: string; findings: AutoFinding[]; gaps: Gap[]; setup: Setup },
): Promise<void> {
  const vp = profileFor(spec.profile);
  const { dir, baseName } = shotLocation(ctx.outDir, spec);
  clearShots(dir, baseName);

  if (spec.set === "loading") {
    // The "nav" variant arrives from the trips list, or from the deep trip's
    // Home when the trips list is the page being loaded.
    const from = spec.route.label === "trips" && ctx.setup.tripIds.deep ? `/trips/${ctx.setup.tripIds.deep}` : "/trips";
    const loaded = await captureLoading(page, `${ctx.baseUrl}${plan.route}`, `${ctx.baseUrl}${from}`, {
      dir,
      baseName,
      prepare: (p) => prepare(p, spec),
    });
    rec.files = loaded.files;
    if (loaded.navSkipped) {
      ctx.gaps.push({ key: `loading:${spec.route.label}`, reason: loaded.navSkipped, captureId: spec.id });
    }
    rec.elementCount = await page.evaluate<number>('document.querySelectorAll("body *").length');
    return;
  }

  await gotoPage(page, `${ctx.baseUrl}${plan.route}`);
  if (spec.route.auth && new URL(page.url()).pathname === "/") {
    throw new Error(`landed on ${page.url()} — the session is not signed in`);
  }
  await prepare(page, spec);
  if (spec.route.isMap && spec.media === "screen") {
    await revealMap(page, spec.route.reveal, MARKER_WAIT_MS);
    rec.markerCount = await markerCount(page);
  }

  const { recipe } = plan;
  try {
    if (recipe) {
      let opened = await openOverlay(page, recipe);
      if (!opened.ok) {
        // One honest second try on a fresh load: a click that lands before
        // a lazily-loaded dialog's chunk has arrived opens nothing.
        await page.keyboard.press("Escape").catch(() => {});
        await gotoPage(page, `${ctx.baseUrl}${plan.route}`);
        await prepare(page, spec);
        await page.waitForTimeout(1000);
        opened = await openOverlay(page, recipe);
      }
      if (!opened.ok) {
        rec.skipped = `coverage gap: ${opened.reason}`;
        ctx.gaps.push({
          key: `overlay:${recipe.id}`,
          reason: `${opened.reason} (at ${spec.profile}${spec.keyboard ? ", keyboard" : ""})`,
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
      : await captureSlices(page, { dir, baseName, width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor });
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
  const head = `[${rec.set}] ${label} ${rec.trip} ${rec.profile}-${rec.theme}${rec.keyboard ? "-kbd" : ""}`;
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
  profile: DeviceProfile;
  theme: CaptureSpec["theme"];
  auth: boolean;
  items: { index: number; spec: CaptureSpec; plan: Extract<Plan, { kind: "run" }> }[];
}

function contextOptions(profile: DeviceProfile, theme: CaptureSpec["theme"], authStatePath: string | undefined): BrowserContextOptions {
  const options: BrowserContextOptions = {
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    deviceScaleFactor: profile.deviceScaleFactor,
    colorScheme: theme,
  };
  if (profile.userAgent) options.userAgent = profile.userAgent;
  if (authStatePath) options.storageState = authStatePath;
  return options;
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** The routes a per-route mode (resize crawl, CLS) covers on the deep trip,
 * resolved, with the ones that can't run logged rather than dropped silently. */
function deepRoutes(
  routes: RouteDef[],
  kind: "resize" | "cls",
  only: string | undefined,
  setup: Setup,
): { route: RouteDef; path: string }[] {
  const out: { route: RouteDef; path: string }[] = [];
  for (const route of routes) {
    if (!matchesOnly(`${kind}/${route.label}`, only)) continue;
    const resolved = resolveRoute(route, route.tripScoped ? "deep" : "none", setup);
    if ("path" in resolved) out.push({ route, path: resolved.path });
    else console.log(`[${kind}] ${route.label} — SKIPPED ${"skip" in resolved ? resolved.skip : resolved.error}`);
  }
  return out;
}

async function audit(
  launch: (engine: Engine) => Promise<Browser>,
  opts: { baseUrl: string; outDir: string; authStatePath: string; only: string | undefined; startedAt: string; options: RunOptions },
): Promise<void> {
  const { baseUrl, outDir, authStatePath, only, options } = opts;
  const { sets } = options;
  const chromium = await launch("chromium");

  // Setup, on one short-lived context: auth + trips first (the matrix's
  // phase set depends on which phase trips verified), then only the
  // lookups the filtered captures actually need.
  const bootCtx = await newBootContext(chromium, authStatePath);
  let setup: Setup;
  let matrix: CaptureSpec[];
  let specs: CaptureSpec[];
  const wants = (kind: "resize" | "cls", label: string) => sets.has(kind) && matchesOnly(`${kind}/${label}`, only);
  try {
    const page = await bootCtx.newPage();
    const base = await bootstrap(bootCtx, page, baseUrl, authStatePath, options);
    const gapKeys = new Set(base.gaps.map((g) => g.key));
    const phaseTripsAvailable = PHASE_KEYS.filter((k) => base.tripIds[k] && !gapKeys.has(k));
    matrix = buildCaptureMatrix({
      overlays: OVERLAYS.map(({ id, only: o, form }) => ({ id, only: o, form })),
      phaseTripsAvailable,
      sets,
    });
    specs = filterCaptures(matrix, only);
    const needs = { share: wants("resize", "share"), deepDay: wants("resize", "day") || wants("cls", "day") };
    setup = { ...base, ...(await lookups(page, baseUrl, base, specs, needs, options)) };
  } finally {
    await bootCtx.close().catch(() => {});
  }

  console.log(
    `trips: ${Object.entries(setup.tripIds)
      .map(([k, id]) => `${k}=${id}`)
      .join(" ")}`,
  );
  console.log(`sets: ${[...sets].join(", ")}`);
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
    const key = `${spec.profile}|${spec.theme}|${spec.route.auth}`;
    const group = groups.get(key) ?? { profile: profileFor(spec.profile), theme: spec.theme, auth: spec.route.auth, items: [] };
    group.items.push({ index, spec, plan });
    groups.set(key, group);
  });

  for (const group of groups.values()) {
    let context: BrowserContext | undefined;
    try {
      const browser = await launch(group.profile.engine);
      context = await browser.newContext(contextOptions(group.profile, group.theme, group.auth ? authStatePath : undefined));
      let page = await context.newPage();
      for (const { index, spec, plan } of group.items) {
        const rec = recordFor(spec, plan, setup);
        const t0 = Date.now();
        let failed = false;
        try {
          await runCapture(page, spec, plan, rec, { baseUrl, outDir, findings, gaps: captureGaps, setup });
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

  // A run that did not do everything (a filter, or only some sets) adds to
  // what the out dir already holds instead of replacing it.
  const partial = Boolean(only) || sets.size < new Set(matrix.map((s) => s.set)).size || matrix.length === 0;

  // ---- The resize crawl -------------------------------------------------
  let resizeResults: ResizeRouteResult[] = [];
  if (sets.has("resize")) {
    const targets = deepRoutes(ROUTES, "resize", only, setup);
    for (const auth of [true, false]) {
      const mine = targets.filter((t) => t.route.auth === auth);
      if (mine.length === 0) continue;
      const context = await chromium.newContext({
        viewport: { width: 2560, height: RESIZE_HEIGHT },
        storageState: auth ? authStatePath : undefined,
      });
      try {
        for (const { route, path: routePath } of mine) {
          const page = await context.newPage();
          const result = await crawlRoute(page, `${baseUrl}${routePath}`, {
            outDir,
            label: route.label,
            route: routePath,
            afterLoad: async (p) => {
              await p.evaluate(HIDE_DEV_CHROME_JS);
            },
          });
          await page.close().catch(() => {});
          resizeResults.push(result);
          console.log(
            `[resize] ${route.label} — ${result.error ? `ERROR ${result.error}` : `${result.findings.length} finding(s), ${result.notRecovered.length} not recovered`} (${result.ms}ms)`,
          );
        }
      } finally {
        await context.close().catch(() => {});
      }
    }
    const resizePath = path.join(outDir, "resize.findings.json");
    const thisResize = resizeResults;
    if (partial) resizeResults = mergeResize(readJson<ResizeRouteResult[]>(resizePath) ?? [], resizeResults);
    if (thisResize.length > 0 || !fs.existsSync(resizePath)) {
      fs.writeFileSync(resizePath, JSON.stringify(resizeResults, null, 2) + "\n");
    }
    resizeResults = thisResize;
  }

  // ---- Cumulative layout shift ------------------------------------------
  let clsResults: ClsResult[] = [];
  if (sets.has("cls")) {
    const targets = deepRoutes(
      ROUTES.filter((r) => LOADING_ROUTE_LABELS.includes(r.label)),
      "cls",
      only,
      setup,
    );
    if (targets.length > 0) {
      // layout-shift entries exist only in Chromium, so the phone's viewport
      // is emulated there rather than measured in WebKit.
      const context = await chromium.newContext(contextOptions(profileFor("iphone17-pwa"), "light", authStatePath));
      try {
        for (const { route, path: routePath } of targets) {
          const result = await measureCls(context, `${baseUrl}${routePath}`, route.label, routePath);
          clsResults.push(result);
          console.log(
            `[cls] ${route.label} — ${result.error ? `ERROR ${result.error}` : `CLS ${result.cls} (${result.shifts} shift(s)); throttled ${result.throttled?.cls}`}`,
          );
        }
      } finally {
        await context.close().catch(() => {});
      }
    }
    const clsPath = path.join(outDir, "cls.json");
    const thisCls = clsResults;
    if (partial) clsResults = mergeCls(readJson<ClsResult[]>(clsPath) ?? [], clsResults);
    if (thisCls.length > 0 || !fs.existsSync(clsPath)) fs.writeFileSync(clsPath, JSON.stringify(clsResults, null, 2) + "\n");
    clsResults = thisCls;
  }

  // This run's own records. A partial run merges them into the out dir's
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
  if (partial && fs.existsSync(manifestPath)) {
    try {
      const prev = {
        manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest,
        findings: fs.existsSync(findingsPath) ? (JSON.parse(fs.readFileSync(findingsPath, "utf8")) as AutoFinding[]) : [],
      };
      ({ manifest, findings: allFindings } = mergeRerun(prev, { manifest: thisRun, findings }, setup.evaluated));
      console.log(`merged ${records.length} capture(s) into the existing ${manifestPath}`);
    } catch (err) {
      console.log(`could not merge into the existing ${manifestPath} (${errorText(err)}) — overwriting it`);
    }
  }

  // A run of only the resize crawl and/or CLS has no captures to judge, and
  // must not leave an empty manifest behind in a fresh out dir.
  const modesOnly = specs.length === 0 && resizeResults.length + clsResults.length > 0;
  console.log("");
  if (!modesOnly || fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    fs.writeFileSync(findingsPath, JSON.stringify(allFindings, null, 2) + "\n");
  }
  if (!modesOnly) console.log(summarise(manifest, allFindings, thisRun));
  else console.log(`out: ${outDir}`);

  const modeErrors = [...resizeResults, ...clsResults].filter((r) => r.error !== undefined);
  if (resizeResults.length > 0) {
    const hits = resizeResults.reduce((n, r) => n + r.findings.length, 0);
    const stuck = resizeResults.reduce((n, r) => n + r.notRecovered.length, 0);
    console.log(`resize crawl: ${resizeResults.length} route(s), ${hits} finding(s) on the way down, ${stuck} not recovered on the way up`);
  }
  if (clsResults.length > 0) {
    console.log(`layout shift (as is / throttled): ${clsResults.map((r) => `${r.label} ${r.cls} / ${r.throttled?.cls ?? "–"}`).join(", ")}`);
  }
  for (const r of modeErrors) console.log(`ERROR ${r.id}: ${r.error}`);

  process.exitCode = modeErrors.length > 0 ? 1 : modesOnly ? 0 : rerunExitCode(thisRun, manifest);
}

async function main(): Promise<void> {
  // The hard safety rule comes first: nothing — not even the out dir — is
  // touched before the target is known to be local.
  let baseUrl: string;
  let outDir: string;
  let options: RunOptions;
  try {
    baseUrl = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3000").origin;
    outDir = resolveOutDir(process.env, new Date());
    const day = process.env.LAYOUT_AUDIT_DAY?.trim() || undefined;
    const checkin = process.env.LAYOUT_AUDIT_CHECKIN_DAY?.trim() || undefined;
    for (const [name, value] of [["LAYOUT_AUDIT_DAY", day], ["LAYOUT_AUDIT_CHECKIN_DAY", checkin]] as const) {
      if (value && !DATE_RE.test(value)) throw new Error(`${name} must be a YYYY-MM-DD date, got "${value}"`);
    }
    options = {
      sets: parseSets(process.env.LAYOUT_AUDIT_SETS),
      deepTripName: process.env.LAYOUT_AUDIT_DEEP_TRIP?.trim() || undefined,
      dayDate: day,
      checkinDate: checkin,
    };
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const startedAt = new Date().toISOString();

  const launchers = resolvePlaywright();
  const browsers = new Map<Engine, Promise<Browser>>();
  const launch = (engine: Engine): Promise<Browser> => {
    const running = browsers.get(engine) ?? launchers[engine].launch();
    browsers.set(engine, running);
    return running;
  };

  console.log(`layout audit: ${baseUrl} → ${outDir}`);
  try {
    await audit(launch, {
      baseUrl,
      outDir,
      authStatePath: process.env.LAYOUT_AUDIT_AUTH_STATE ?? "/tmp/auth.json",
      only: process.env.LAYOUT_AUDIT_ONLY?.trim() || undefined,
      startedAt,
      options,
    });
  } finally {
    for (const browser of browsers.values()) await (await browser.catch(() => undefined))?.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
