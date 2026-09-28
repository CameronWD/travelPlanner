/**
 * Navigation audit — `npm run audit:nav`. Proves ADR 0063 in a real browser
 * against a local `next dev`: on every sibling switch the current page holds
 * (no skeleton, no blank, the old heading and text stay) until the next page
 * lands; the tapped control is lit and marked data-pending before the URL
 * changes (aria-current stays on the page shown until it lands); the progress
 * bar appears only after ~300ms of waiting, and never on a fast switch.
 *
 * It holds every RSC navigation response back by NAV_RSC_DELAY_MS (default
 * 1500) via page.route(), samples the DOM every 100ms, and judges the samples
 * with scripts/nav-audit/checks.ts (unit-tested).
 *
 * PREREQUISITES — identical to the layout audit:
 *   - a running `next dev` at BASE_URL (default http://localhost:3000). Never
 *     `next start`: it loads .env.production.local. The first page load is
 *     refused unless the Next dev overlay is present.
 *   - Playwright + Chromium, NOT a project dependency; resolved globally:
 *       NODE_PATH=/usr/local/lib/node_modules npm run audit:nav
 *   - ALLOW_DEV_LOGIN=true on the server (signs in via "Continue as You").
 *
 * What it cannot prove: "instant". Prefetching and the client cache only
 * behave fully in a production build; those checks are soft (WARN) here and
 * live on the beta checklist in docs/specs/2026-09-27-navigation-pass.md.
 *
 * Exit codes: 0 every hard check passed; 1 a hard check failed; 2 no trip
 * with dated days was found for the signed-in Traveller.
 */

import type { Page } from "playwright";
import { resolvePlaywright, ensureAuthenticated, deriveDayDates, middleDate } from "./lib/audit-browser";
import { assertLocalBaseUrl } from "./layout-audit/config";
import { NEXT_DEV_OVERLAY_SELECTOR, assertNextDev } from "./layout-audit/run";
import { resolveTripIdByName, TRIP_NAMES } from "./layout-audit/trips";
import { holdViolations, summarise, arrowDrift, stripReach, type Finding, type Sample, type Box } from "./nav-audit/checks";

const NAV_TIMEOUT_MS = 60_000;
const DEV_OVERLAY_WAIT_MS = 5_000;
const SAMPLE_EVERY_MS = 100;
const BAR_DELAY_MS = 300;

const DESKTOP = { width: 1100, height: 800 }; // md–xl: the Dock is the trip nav
const PHONE = { width: 390, height: 844 };

type Snapshot = { url: string; h1: string; text: string; bar: boolean; skeleton: boolean };

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const main = document.querySelector('[data-testid="app-main"]');
    return {
      url: location.pathname + location.search,
      h1: document.querySelector("h1")?.textContent?.trim() ?? "",
      text: (main as HTMLElement | null)?.innerText ?? "",
      bar: document.querySelector('[data-nav-progress="visible"]') != null,
      skeleton: document.querySelector('[role="status"][aria-label^="Loading"]') != null,
    };
  });
}

/** Holds every RSC navigation response back by `delayMs`; 0 removes the hold. */
async function holdRsc(page: Page, delayMs: number): Promise<void> {
  await page.unroute("**/*").catch(() => {});
  if (delayMs <= 0) return;
  await page.route("**/*", async (route) => {
    const h = route.request().headers();
    if (h["rsc"] === "1" || h["next-router-prefetch"] === "1") await new Promise((r) => setTimeout(r, delayMs));
    await route.continue();
  });
}

/**
 * Runs `act`, then samples until the URL changes (or `maxMs`), returning the
 * samples with `t` relative to activation.
 */
async function sampleThrough(page: Page, act: () => Promise<void>, maxMs: number): Promise<Sample[]> {
  const before = await snapshot(page);
  const start = Date.now();
  await act();
  const samples: Sample[] = [];
  for (;;) {
    const s = await snapshot(page);
    const t = Date.now() - start;
    samples.push({ t, ...s });
    if (s.url !== before.url || t > maxMs) break;
    await page.waitForTimeout(SAMPLE_EVERY_MS);
  }
  return samples;
}

async function checkHold(
  page: Page,
  name: string,
  act: () => Promise<void>,
  opts: { delayMs: number; expectBar: boolean; hard: boolean; expectLandingOn?: RegExp },
): Promise<Finding> {
  const before = await snapshot(page);
  const samples = await sampleThrough(page, act, opts.delayMs + 2_500);
  // opts.delayMs is how long the RSC response is held (it bounds sampling);
  // the bar is judged against its own 300ms threshold, not the hold.
  const violations = holdViolations({ h1: before.h1, text: before.text }, samples, { delayMs: BAR_DELAY_MS, expectBar: opts.expectBar });
  const landed = samples[samples.length - 1];
  if (landed.url === before.url) violations.push(`never landed within ${opts.delayMs + 2_500}ms`);
  else if (opts.expectLandingOn && !opts.expectLandingOn.test(landed.url)) violations.push(`landed on ${landed.url}`);
  await page.waitForTimeout(400); // let the view transition finish before the next check
  return { name, hard: opts.hard, ok: violations.length === 0, detail: violations.join("; ") };
}

/**
 * data-pending="true" on the tapped control, read ~50ms after the tap (before
 * the held response can land) — the mark nav controls put on the target they
 * light early (ADR 0063; aria-current stays on the page actually shown).
 * `selector` is plain CSS; of its matches the first visible one is read,
 * because some controls render once per breakpoint and CSS hides the others
 * (the Day page mounts a phone and a desktop strip).
 */
async function pendingSoonAfter(page: Page, act: () => Promise<void>, selector: string, text?: string): Promise<Pick<Finding, "ok" | "detail">> {
  await act();
  await page.waitForTimeout(50);
  const v = await page.evaluate(
    ([sel, txt]) => {
      const el = Array.from(document.querySelectorAll(sel)).find((e) => e.checkVisibility() && (txt == null || e.textContent?.trim() === txt));
      return el ? { pending: el.getAttribute("data-pending"), current: el.getAttribute("aria-current") } : null;
    },
    [selector, text] as [string, string | undefined],
  );
  if (!v) return { ok: false, detail: "control not found" };
  return { ok: v.pending === "true", detail: `data-pending=${v.pending ?? "none"}, aria-current=${v.current ?? "none"}` };
}

async function main(): Promise<void> {
  const baseUrl = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3000").origin;
  const delayMs = Number(process.env.NAV_RSC_DELAY_MS ?? 1500);
  const { chromium } = resolvePlaywright("audit:nav");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const findings: Finding[] = [];

  try {
    await ensureAuthenticated(page, baseUrl, {
      timeoutMs: NAV_TIMEOUT_MS,
      afterFirstLoad: async (first) => {
        const found = await first.waitForSelector(NEXT_DEV_OVERLAY_SELECTOR, { state: "attached", timeout: DEV_OVERLAY_WAIT_MS }).then(() => true, () => false);
        assertNextDev(baseUrl, found);
        console.log(`target: ${baseUrl} is \`next dev\``);
      },
    });

    // The deep trip by name, else any trip whose Days tab resolves to a date.
    let tripId = await resolveTripIdByName(page, baseUrl, TRIP_NAMES.deep);
    if (!tripId) {
      await page.goto(`${baseUrl}/trips`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      const ids = await page.evaluate(() =>
        Array.from(new Set(Array.from(document.querySelectorAll("a[href^='/trips/']")).map((a) => a.getAttribute("href")!.match(/^\/trips\/([^/?#]+)$/)?.[1]).filter((x): x is string => !!x && x !== "new"))),
      );
      for (const id of ids) {
        await page.goto(`${baseUrl}/trips/${id}/day`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
        if (/\/day\/\d{4}-\d{2}-\d{2}$/.test(page.url())) { tripId = id; break; }
      }
    }
    if (!tripId) {
      console.error("nav-audit: no trip with dated days for the signed-in Traveller — seed one (npm run db:seed) and retry.");
      process.exitCode = 2;
      return;
    }
    const base = `/trips/${tripId}`;
    const dates = await deriveDayDates(page, baseUrl, tripId);
    const mid = middleDate(dates);
    if (!mid || dates.length < 3) {
      console.error(`nav-audit: trip ${tripId} has ${dates.length} day(s); need at least 3.`);
      process.exitCode = 2;
      return;
    }
    const next = dates[dates.indexOf(mid) + 1];
    const prev = dates[dates.indexOf(mid) - 1];
    console.log(`trip: ${tripId}; days ${dates[0]}…${dates[dates.length - 1]}; middle ${mid}`);

    // Warm every route once so dev compilation never masquerades as a slow navigation.
    for (const p of [`${base}`, `${base}/plan`, `${base}/budget`, `${base}/calendar`, `${base}/wishlist`, `${base}/day/${mid}`, `${base}/day/${next}`, `${base}/day/${prev}`, "/account", "/globe"]) {
      await page.goto(`${baseUrl}${p}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    }

    // ── Day view ──────────────────────────────────────────────────────────
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await holdRsc(page, delayMs);
    findings.push(await checkHold(page, "Day: next arrow holds the page, bar after delay", () => page.click('a[aria-label^="Next day"]'), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    findings.push(await checkHold(page, "Day: previous arrow", () => page.click('a[aria-label^="Previous day"]'), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));
    // Two strips are mounted (phone + desktop) and one is hidden; `:visible`
    // is Playwright's own pseudo-class, so it is only used in page.click.
    const chip = (iso: string) => `nav[aria-label="Days"] a[href$="/day/${iso}"]`;
    findings.push({ name: "Day: tapped strip chip is pending (lit) before the URL changes", hard: true, ...(await pendingSoonAfter(page, () => page.click(`${chip(next)}:visible`), chip(next))) });
    await page.waitForURL(new RegExp(`/day/${next}$`), { timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(400);
    findings.push(await checkHold(page, "Day: strip chip holds the page", () => page.click(`${chip(mid)}:visible`), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));
    findings.push(await checkHold(page, "Day: → key", () => page.keyboard.press("ArrowRight"), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    findings.push(await checkHold(page, "Day: ← key", () => page.keyboard.press("ArrowLeft"), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));

    await page.setViewportSize(PHONE);
    await page.waitForTimeout(300);
    const swipe = (from: number, to: number) => () =>
      page.evaluate(([x0, x1]) => {
        // No named inner function: tsx (esbuild keepNames) wraps those in a
        // `__name()` helper that does not exist inside the page.
        const el = document.querySelector("[data-day-body]") as HTMLElement;
        for (const [type, x] of [["touchstart", x0], ["touchend", x1]] as const) {
          const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
          el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [touch], changedTouches: [touch] }));
        }
      }, [from, to] as [number, number]);
    findings.push(await checkHold(page, "Day: swipe left (phone)", swipe(300, 100), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    findings.push(await checkHold(page, "Day: swipe right (phone)", swipe(100, 300), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));

    // ── Phone Day view: strip reach, arrow drift, chrome names (spec 2026-09-28 D1–D3) ──
    await holdRsc(page, 0);
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    const stripHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('nav[aria-label="Days"] a')).map((a) => a.getAttribute("href") ?? ""),
    );
    const reach = stripReach(stripHrefs, dates[0], dates[dates.length - 1]);
    findings.push({ name: "Day (phone): the strip reaches the Trip's first and last day", hard: true, ok: reach.length === 0, detail: reach.join("; ") });

    const arrowBox = () =>
      page.evaluate((): Box | null => {
        const el = Array.from(document.querySelectorAll('a[aria-label^="Next day"], span[aria-label="Next day"]')).find((e) => (e as HTMLElement).checkVisibility()) as HTMLElement | undefined;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      });
    const boxes: Box[] = [];
    for (const iso of [prev, mid, next]) {
      await page.goto(`${baseUrl}${base}/day/${iso}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      await page.evaluate(() => window.scrollTo(0, 0));
      const b = await arrowBox();
      if (b) boxes.push(b);
    }
    const drift = arrowDrift(boxes);
    findings.push({ name: "Day (phone): the next arrow's box is identical across three consecutive days", hard: true, ok: boxes.length === 3 && drift.length === 0, detail: boxes.length === 3 ? drift.join("; ") : `only ${boxes.length} boxes` });

    const chrome = await page.evaluate(() => {
      // No const-bound helper in here: tsx's keepNames would wrap it in a
      // `__name()` helper that does not exist inside the page (see the swipe
      // check above). Read each bar's computed name inline instead.
      const bar = document.querySelector("nav.tp-vt-tab-bar") as HTMLElement | null;
      const top = document.querySelector("header.tp-vt-top-bar") as HTMLElement | null;
      return {
        bar: bar ? ((getComputedStyle(bar) as unknown as { viewTransitionName?: string }).viewTransitionName ?? "") : "missing",
        top: top ? ((getComputedStyle(top) as unknown as { viewTransitionName?: string }).viewTransitionName ?? "") : "missing",
      };
    });
    findings.push({ name: "Phone chrome: tab bar and top bar carry their own view-transition-name", hard: true, ok: chrome.bar === "tp-tab-bar" && chrome.top === "tp-top-bar", detail: `bar=${chrome.bar}, top=${chrome.top}` });
    await holdRsc(page, delayMs);

    await page.setViewportSize(DESKTOP);

    // ── Trip sections via the Dock ────────────────────────────────────────
    await page.goto(`${baseUrl}${base}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await holdRsc(page, delayMs);
    // The mobile TabBar is also nav[aria-label="Trip sections"] (hidden at
    // this width), so clicks take the visible nav and match the label
    // exactly; the data-pending read uses plain CSS plus the same label.
    const DOCK_LINKS = 'nav[aria-label="Trip sections"] a';
    const dock = (label: string) => `nav[aria-label="Trip sections"]:visible a:text-is("${label}")`;
    for (const [label, re] of [["Plan", /\/plan$/], ["Money", /\/budget$/], ["Calendar", /\/calendar$/], ["Wishlist", /\/wishlist$/], ["Days", /\/day\/\d{4}-\d{2}-\d{2}$/], ["Home", new RegExp(`${base}$`)]] as const) {
      // A full load first: the loop's own start page (Home) sits in the 30s
      // client cache, so tapping back to it would land at once and leave no
      // pending state to read. A cold router cache makes every tap wait.
      await page.goto(page.url(), { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      findings.push({ name: `Section: ${label} is pending (lit) before the URL changes`, hard: true, ...(await pendingSoonAfter(page, () => page.click(dock(label)), DOCK_LINKS, label)) });
      await page.waitForURL(re, { timeout: NAV_TIMEOUT_MS });
      await page.waitForTimeout(400);
    }
    // The loop above visited every section seconds ago, so the 30s client
    // cache (staleTimes.dynamic) would serve them without a request and the
    // hold would never be exercised. A full load starts the router cache cold.
    await page.goto(`${baseUrl}${base}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    findings.push(await checkHold(page, "Section: Home → Plan holds the page", () => page.click(dock("Plan")), { delayMs, expectBar: true, hard: true, expectLandingOn: /\/plan$/ }));
    findings.push(await checkHold(page, "Section: Plan → Money holds the page", () => page.click(dock("Money")), { delayMs, expectBar: true, hard: true, expectLandingOn: /\/budget$/ }));
    findings.push(await checkHold(page, "Section: Money → Days lands on a date in one hop", () => page.click(dock("Days")), { delayMs, expectBar: true, hard: true, expectLandingOn: /\/day\/\d{4}-\d{2}-\d{2}$/ }));

    // Same-URL supersede (F1): with Plan held in flight, tapping Home — the
    // page already shown — replaces that navigation (Next drops the Plan
    // one), so the URL never changes. Nothing may be left pending; before the
    // fix the Plan target stayed lit with the bar sweeping for 15s.
    await page.goto(`${baseUrl}${base}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await page.click(dock("Plan"));
    await page.waitForTimeout(150);
    await page.click(dock("Home"));
    await page.waitForTimeout(600);
    const superseded = await page.evaluate(() => ({
      bar: document.querySelector("[data-nav-progress]")?.getAttribute("data-nav-progress") ?? "missing",
      pending: document.querySelectorAll("[data-pending]").length,
      url: location.pathname,
    }));
    findings.push({
      name: "Same URL: Home tapped while Plan is in flight leaves nothing pending within 600ms",
      hard: true,
      ok: superseded.bar === "hidden" && superseded.pending === 0 && superseded.url === base,
      detail: `bar=${superseded.bar}, [data-pending]=${superseded.pending}, url=${superseded.url}`,
    });
    await page.waitForTimeout(delayMs); // let the dropped Plan response drain before the next section

    // ── Rail destinations ─────────────────────────────────────────────────
    await page.goto(`${baseUrl}/account`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await holdRsc(page, delayMs);
    findings.push(await checkHold(page, "Rail: You → Globe holds the page", () => page.click('nav[aria-label="Teepee"]:visible a:text-is("Globe")'), { delayMs, expectBar: true, hard: true, expectLandingOn: /\/globe$/ }));

    // ── Same-URL settle (F1): the Dock logo on the trips list ──────────────
    // The logo links to /trips; tapped on /trips, the navigation ends on the
    // URL already shown, so nothing may be left pending (no bar, no lit
    // target). It guards the href rather than reproducing the old bug: in
    // `next dev` the old "/" link showed "/" (no app shell) for a moment
    // before the redirect, so the URL changed and the old code settled too.
    // The supersede check above is the one that fails on a stuck state.
    await holdRsc(page, 0);
    await page.goto(`${baseUrl}/trips`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await page.click('nav[aria-label="Teepee"]:visible a[aria-label="Teepee home"]');
    await page.waitForTimeout(600);
    const settled = await page.evaluate(() => ({
      bar: document.querySelector("[data-nav-progress]")?.getAttribute("data-nav-progress") ?? "missing",
      pending: document.querySelectorAll("[data-pending]").length,
      url: location.pathname,
    }));
    findings.push({
      name: "Same URL: Dock logo on /trips leaves nothing pending within 600ms",
      hard: true,
      ok: settled.bar === "hidden" && settled.pending === 0 && settled.url === "/trips",
      detail: `bar=${settled.bar}, [data-pending]=${settled.pending}, url=${settled.url}`,
    });

    // ── Fast path: no bar on an unthrottled switch (soft — dev render time) ─
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    findings.push(await checkHold(page, "Fast: next arrow without throttling shows no bar (soft in dev)", () => page.click('a[aria-label^="Next day"]'), { delayMs: BAR_DELAY_MS, expectBar: false, hard: false, expectLandingOn: new RegExp(`/day/${next}$`) }));
    const t0 = Date.now();
    await page.goBack();
    await page.waitForURL(new RegExp(`/day/${mid}$`), { timeout: NAV_TIMEOUT_MS });
    const backMs = Date.now() - t0;
    findings.push({ name: "Fast: browser back within 30s is instant (soft in dev)", hard: false, ok: backMs < 300, detail: `${backMs}ms` });
  } finally {
    await browser.close();
  }

  const { exitCode, lines } = summarise(findings);
  console.log("\n" + lines.join("\n"));
  console.log(`\nnav-audit: ${findings.filter((f) => f.ok).length}/${findings.length} passed${exitCode ? " — HARD FAILURES" : ""}`);
  process.exitCode = exitCode;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
