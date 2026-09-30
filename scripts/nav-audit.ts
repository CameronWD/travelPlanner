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
 * On a phone it also samples a Plan → Money switch every 50ms: the DOM never
 * holds an extra section wrapper and the inner section goes straight from
 * plan to budget (a cut, ADR 0065), and nothing paints over the tab bar. It then proves the Day carousel: the scroller rests on the day
 * shown before hydration with a neighbour each side, a "swipe" (moving the
 * scroller one panel) lands on that day, and an arrow press keeps the
 * vertical position. Frames of a failure go to NAV_AUDIT_OUT (default
 * /tmp/nav-audit/<timestamp>; never inside the repo).
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
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertLocalBaseUrl, assertOutsideRepo } from "./layout-audit/config";
import { NEXT_DEV_OVERLAY_SELECTOR, assertNextDev } from "./layout-audit/run";
import { resolveTripIdByName, TRIP_NAMES } from "./layout-audit/trips";
import { holdViolations, summarise, arrowDrift, stripReach, sectionCutViolations, type CutSample, changedBarFrames, type Finding, type Sample, type Box } from "./nav-audit/checks";

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

/**
 * Phone Plan → Money through the tab bar, sampled every 50ms until the new
 * page is up. Two hard findings: the switch is a cut (sectionCutViolations),
 * and the tab bar's pixels match the settled page's in every frame (nothing
 * paints over it). The bar's own CSS transitions are switched off for the
 * check: the tap lights Money at once (data-pending, ADR 0063), so the pill
 * already sits on Money for every sampled frame. The Next dev indicator is
 * hidden for the same reason. The bar is read with page.screenshot({ clip }).
 */
async function checkPhoneSectionSwitch(page: Page, planUrl: string, outDir: string): Promise<Finding[]> {
  const cutName = "Phone section switch: a cut — no extra section in any frame, old straight to new";
  const barName = "Phone section switch: the tab bar is untouched in every frame";
  await page.goto(planUrl, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
  const setAuditStyle = (off: boolean) =>
    page.evaluate((o) => {
      document.getElementById("nav-audit-no-bar-transitions")?.remove();
      if (!o) return;
      const style = document.createElement("style");
      style.id = "nav-audit-no-bar-transitions";
      style.textContent = "nav.tp-vt-tab-bar, nav.tp-vt-tab-bar * { transition: none !important; } nextjs-portal { display: none !important; }";
      document.head.append(style);
    }, off);
  await setAuditStyle(true);
  await page.waitForTimeout(400);
  const rect = await page.evaluate(() => {
    const r = document.querySelector("nav.tp-vt-tab-bar")?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });
  if (!rect) {
    await setAuditStyle(false);
    return [cutName, barName].map((name) => ({ name, hard: true, ok: false, detail: "tab bar not found" }));
  }
  const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  // The trip header's h1 is the Trip's name on every section, so the switch
  // is read off the innermost [data-section] wrapper (the app layout adds an
  // outer one, "trips", that never changes here).
  const readSections = () =>
    page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("[data-section]"));
      return { sections: all.length, section: all[all.length - 1]?.getAttribute("data-section") ?? "" };
    });
  const rest = await readSections();

  const samples: CutSample[] = [];
  const bars: { t: number; bar: string; png: Buffer }[] = [];
  await page.click('nav.tp-vt-tab-bar a:text-is("Money")');
  await page.waitForTimeout(30);
  const start = Date.now();
  for (;;) {
    const t = Date.now() - start;
    const s = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("[data-section]"));
      return {
        sections: all.length,
        section: all[all.length - 1]?.getAttribute("data-section") ?? "",
        url: location.pathname,
        animating: Array.from(document.getAnimations()).some((a) => {
          const pe = (a.effect as KeyframeEffect | null)?.pseudoElement ?? "";
          return pe.startsWith("::view-transition") && !/\((root|tp-tab-bar|tp-top-bar)\)$/.test(pe);
        }),
      };
    });
    samples.push({ t, sections: s.sections, section: s.section, animating: s.animating });
    const png = await page.screenshot({ clip });
    bars.push({ t, bar: png.toString("base64"), png });
    if ((/\/budget$/.test(s.url) && s.section !== rest.section && t > 600) || t > 7_000) break;
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(400);
  const landed = await readSections();
  const baselinePng = await page.screenshot({ clip });
  const baseline = baselinePng.toString("base64");
  await setAuditStyle(false);

  const cut = sectionCutViolations(samples, { sections: rest.sections, from: rest.section, to: landed.section });
  const changed = changedBarFrames(baseline, bars);
  const save = (label: string, ts: number[]): string => {
    if (ts.length === 0) return "";
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, `${label}-baseline.png`), baselinePng);
    for (const f of bars.filter((b) => ts.includes(b.t))) writeFileSync(path.join(outDir, `${label}-t${f.t}.png`), f.png);
    return ` (frames in ${outDir})`;
  };
  return [
    { name: cutName, hard: true, ok: landed.section !== rest.section && cut.length === 0, detail: landed.section === rest.section ? `section did not change (${rest.section})` : cut.length ? `${cut.join("; ")} of ${samples.length} frames` : `${samples.length} frames, ${rest.section} → ${landed.section}` },
    { name: barName, hard: true, ok: changed.length === 0, detail: changed.length ? `bar changed at t=${changed.join(",")}ms of ${bars.length} frames${save("tab-bar", changed)}` : `${bars.length} frames` },
  ];
}

async function main(): Promise<void> {
  const baseUrl = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3000").origin;
  // Frames from failed checks; never inside the repo (same rule as the layout audit).
  const outDir = process.env.NAV_AUDIT_OUT ?? `/tmp/nav-audit/${new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")}`;
  assertOutsideRepo(outDir, process.cwd());
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
    // The carousel prefetches its neighbours on every mount (ADR 0065), so a
    // day already visited this run answers from the client Router Cache with
    // no RSC fetch at all — holdRsc has nothing to delay, and no bar is owed
    // for a switch that never actually waited (the docblock above says as
    // much: "never on a fast switch"). A reload drops that cache so each of
    // these checks honestly re-proves its own control holds the page when the
    // network genuinely is slow, rather than riding a neighbour's cache entry.
    const freshReload = () => page.reload({ waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await freshReload();
    findings.push(await checkHold(page, "Day: strip chip holds the page", () => page.click(`${chip(mid)}:visible`), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));
    await freshReload();
    findings.push(await checkHold(page, "Day: → key", () => page.keyboard.press("ArrowRight"), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    await freshReload();
    findings.push(await checkHold(page, "Day: ← key", () => page.keyboard.press("ArrowLeft"), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));

    await page.setViewportSize(PHONE);
    await page.waitForTimeout(300);
    // A "swipe": move the scroller one panel. The settle detector (scrollend,
    // else 120ms of quiet on a snap point) navigates; the page holds meanwhile.
    const swipe = (dir: 1 | -1) => () =>
      page.evaluate((d) => {
        const el = document.querySelector("[data-day-carousel]") as HTMLElement;
        el.scrollLeft = el.scrollLeft + d * el.clientWidth;
      }, dir);
    await freshReload();
    findings.push(await checkHold(page, "Day: swipe to the next day (phone) — the settled carousel navigates", swipe(1), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    await freshReload();
    findings.push(await checkHold(page, "Day: swipe back (phone)", swipe(-1), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));

    // ── Phone Day view: strip reach, arrow drift, chrome names (spec 2026-09-28 D1–D3) ──
    await holdRsc(page, 0);
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    const stripHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('nav[aria-label="Days"] a')).map((a) => a.getAttribute("href") ?? ""),
    );
    const reach = stripReach(stripHrefs, dates[0], dates[dates.length - 1]);
    findings.push({ name: "Day (phone): the strip reaches the Trip's first and last day", hard: true, ok: reach.length === 0, detail: reach.join("; ") });

    // ── Day carousel (ADR 0065): resting position, vertical hold ──────────
    // Hydration blocked so the read is genuinely the server HTML plus its
    // inline script. Fizz's reveal scripts are inline in the stream, so the
    // streamed content is still revealed with the chunks aborted.
    await page.route("**/_next/static/**/*.js", (r) => r.abort());
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(300);
    const pos = await page.evaluate(() => {
      const el = document.querySelector("[data-day-carousel]") as HTMLElement | null;
      if (!el) return null;
      const shown = el.querySelector('[data-day-panel][data-shown="true"]');
      const idx = shown ? Array.from(el.children).indexOf(shown) : -1;
      return { left: el.scrollLeft, expected: idx * el.clientWidth, idx, panels: el.querySelectorAll("[data-day-panel]").length };
    });
    await page.unroute("**/_next/static/**/*.js");
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    findings.push({
      name: "Day (phone): the carousel rests on the day shown before hydration, a neighbour each side",
      hard: true,
      // expected > 0: a still-hidden scroller reads 0 = 0 and must not pass.
      ok: pos != null && pos.panels === 3 && pos.idx === 1 && pos.expected > 0 && Math.abs(pos.left - pos.expected) <= 1,
      detail: pos ? `scrollLeft=${pos.left} expected=${pos.expected} panels=${pos.panels}` : "no carousel",
    });
    // The hold can only be judged when the source could be scrolled to 240px
    // AND the destination is tall enough to hold that position; otherwise WARN.
    const scrolledFrom = await page.evaluate(() => {
      window.scrollTo(0, 240);
      return window.scrollY;
    });
    // A real page.click() first scrolls its target into view — the Day header
    // isn't sticky, so that scroll-into-view undoes the 240px above before the
    // click's own logic ever runs, and every sample below reads scrollY=0
    // through no fault of the app. dispatchEvent fires the same click without
    // that actionability step, which is what this check is actually judging.
    await page.locator('a[aria-label^="Next day"]').dispatchEvent("click");
    await page.waitForURL(new RegExp(`/day/${next}$`), { timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(400);
    const landed = await page.evaluate(() => ({ scrollY: window.scrollY, canHold: document.documentElement.scrollHeight - window.innerHeight >= 240 }));
    const testable = scrolledFrom >= 240 && landed.canHold;
    findings.push({
      name: "Day (phone): an arrow press keeps the vertical position",
      hard: testable,
      ok: !testable || landed.scrollY >= 200,
      detail: testable ? `scrollY=${landed.scrollY}` : `not testable here (source scrolled to ${scrolledFrom}px, destination ${landed.canHold ? "can" : "cannot"} hold 240px)`,
    });
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });

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
    findings.push(...(await checkPhoneSectionSwitch(page, `${baseUrl}${base}/plan`, outDir)));
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
