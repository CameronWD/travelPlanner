/**
 * Shared Playwright plumbing for this repo's browser-driven audits
 * (`scripts/contrast-audit.ts`, the layout audit, the nav audit).
 *
 * Playwright is a devDependency. Its browsers are not downloaded on
 * `npm install` (set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 anywhere an install
 * must never fetch them, e.g. CI); run `npx playwright install chromium` once
 * on a machine that runs an audit.
 */

import { chromium, webkit, type BrowserType, type Page } from "playwright";

export type Theme = "light" | "dark";
export type MapReveal = "wishlist-map-tab" | "show-day-map";

/** The browser launchers the audits use (the layout audit's phone profiles
 * run in WebKit). The one place a harness file takes a value from
 * `playwright` (run.test.ts allowlists only this file). */
export function resolvePlaywright(): { chromium: BrowserType; webkit: BrowserType } {
  return { chromium, webkit };
}

// --------------------------------------------------------------------------
// Loading a page until it has settled
// --------------------------------------------------------------------------

/**
 * True once the page has finished arriving: the document is complete, no
 * Suspense boundary is still streaming (React marks a pending one with a
 * `$?` comment), the app's own buttons are hydrated (React sets
 * `__reactProps$…` on each; a click before that does nothing — a button with
 * no React keys under an element that has them is a third party's, e.g. the
 * map's own controls, and is not waited for), fonts are in, and no new
 * resource has finished for 400ms.
 *
 * `networkidle` can't be used for this: with a Google Maps key the map's
 * worker blobs never "finish", so Chromium never reports the network idle and
 * every map page times out; and WebKit reports idle while /trips is still
 * showing its loading skeleton. Plain JS string — see layout-audit.ts trap 1.
 */
export const SETTLED_JS = `(() => {
  if (document.readyState !== "complete") return false;
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) if (walker.currentNode.data === "$?") return false;
  const hasReact = (el) => Object.keys(el).some((k) => k.startsWith("__react"));
  for (const b of Array.from(document.querySelectorAll("button")).slice(0, 80)) {
    if (hasReact(b)) continue;
    let foreign = false;
    for (let p = b.parentElement; p && !foreign; p = p.parentElement) foreign = hasReact(p);
    if (!foreign) return false;
  }
  if (document.fonts && document.fonts.status !== "loaded") return false;
  const n = performance.getEntriesByType("resource").length;
  const now = performance.now();
  const state = window.__auditSettle || (window.__auditSettle = { n: -1, at: now });
  if (state.n !== n) { state.n = n; state.at = now; return false; }
  return now - state.at >= 400;
})()`;

/** Waits for SETTLED_JS, up to `timeoutMs`; a page that never settles (a
 * poller, a stuck boundary) is carried on with rather than failed — the
 * capture then shows whatever a Traveller would be looking at. */
export async function settle(page: Page, timeoutMs = 12_000): Promise<boolean> {
  return page.waitForFunction(SETTLED_JS, undefined, { timeout: timeoutMs, polling: 100 }).then(
    () => true,
    () => false,
  );
}

export async function gotoSettled(page: Page, url: string, timeoutMs = 30_000): Promise<void> {
  await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
  await settle(page);
}

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------

/** Loads /trips and, if that lands on the Landing at "/", signs in through
 * the dev login's "Continue as You" (inside the Sign in panel, opened via
 * the hero's "Sign in" button). `afterFirstLoad` runs on that first page
 * load, before any sign-in click — the layout audit uses it to refuse a
 * server that isn't `next dev`; a throw from it aborts here. */
export async function ensureAuthenticated(
  page: Page,
  baseUrl: string,
  opts?: { timeoutMs?: number; authStatePath?: string; afterFirstLoad?: (page: Page) => Promise<void> },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const authStatePath = opts?.authStatePath ?? "/tmp/auth.json";
  await gotoSettled(page, `${baseUrl}/trips`, timeoutMs);
  await opts?.afterFirstLoad?.(page);
  // Signed out, /trips redirects to the Landing at "/", where the dev logins
  // sit inside the Sign in panel.
  if (new URL(page.url()).pathname !== "/") return;

  // Both the phone and desktop trees render their own "Sign in" button; CSS
  // hides whichever tree the current viewport isn't showing, so pick the
  // visible one rather than trusting DOM order.
  await page.getByRole("button", { name: "Sign in", exact: true }).filter({ visible: true }).first().click();
  const continueButton = page.getByText("Continue as You", { exact: true });
  if ((await continueButton.count()) === 0) {
    throw new Error(
      `Session at ${authStatePath} is expired/invalid, and no "Continue as You" ` +
        "dev sign-in button was found in the Landing's Sign in panel (ALLOW_DEV_LOGIN may be off). " +
        "Refresh the storageState file and retry.",
    );
  }
  await continueButton.first().click();
  await page.waitForURL(/\/trips/, { timeout: timeoutMs }).catch(() => {});
  await settle(page);
}

// --------------------------------------------------------------------------
// Theme
// --------------------------------------------------------------------------

export async function applyThemeClass(page: Page, theme: Theme, settleMs = 350): Promise<void> {
  if (theme === "dark") {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(settleMs);
  } else {
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  }
}

// --------------------------------------------------------------------------
// Maps (trap 1: the map renders after networkidle — see contrast-audit.ts's
// docblock for the full story)
// --------------------------------------------------------------------------

/**
 * Trap 1: click open the maps that mount collapsed, then wait for a real pin
 * or the keyless fallback, whichever lands first. Returns the pin count: 0 is
 * normal keyless, so a keyed run asserts > 0 per surface.
 */
export async function revealMap(page: Page, reveal: MapReveal | undefined, markerWaitMs = 8_000): Promise<number> {
  if (reveal === "show-day-map") {
    // The Day view is a paged carousel (ADR 0065): the previous and next
    // days are rendered offscreen with their own toggles, so click the one
    // whose box actually lies inside the viewport, not the first in the DOM.
    const toggles = page.locator('button:has-text("Show day map")');
    const viewport = page.viewportSize();
    for (let i = 0; i < (await toggles.count()); i++) {
      const box = await toggles.nth(i).boundingBox();
      if (box && box.x >= 0 && (!viewport || box.x + box.width <= viewport.width)) {
        await toggles.nth(i).click();
        break;
      }
    }
  } else if (reveal === "wishlist-map-tab") {
    const tab = page.getByText("Map", { exact: true });
    if ((await tab.count()) > 0) await tab.first().click();
  }

  await page
    .waitForSelector(".tp-map-pin, [data-map-fallback]", { timeout: markerWaitMs })
    .catch(() => {
      // Neither a pin nor the fallback appeared in time. Could be a genuinely
      // empty map (e.g. an empty wishlist) or a real regression — the count
      // below records the number either way.
    });
  return markerCount(page);
}

export async function markerCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll(".tp-map-pin").length);
}

// --------------------------------------------------------------------------
// Deriving a day route inside a trip's own range
// --------------------------------------------------------------------------

/** Reads the trip's calendar page and returns the sorted, deduped set of
 * YYYY-MM-DD dates linked from it, rather than hard-coding one. */
export async function deriveDayDates(page: Page, baseUrl: string, tripId: string): Promise<string[]> {
  await gotoSettled(page, `${baseUrl}/trips/${tripId}/calendar`);
  const dates = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href*='/day/']"))
      .map((a) => a.getAttribute("href") ?? "")
      .map((href) => href.match(/\/day\/(\d{4}-\d{2}-\d{2})/)?.[1])
      .filter((d): d is string => Boolean(d)),
  );
  return Array.from(new Set(dates)).sort();
}

/** Middle of a sorted date range rather than the first/last day, to land on
 * a day with a full agenda rather than a possibly-thin arrival/departure
 * day. Pure — null for an empty list. */
export function middleDate(dates: string[]): string | null {
  if (dates.length === 0) return null;
  return dates[Math.floor(dates.length / 2)];
}

/** Swaps each run-time value in a route path (a trip id, a share token, a
 * derived day date) for a stable `{name}` placeholder, so anything keyed by
 * path — the contrast audit's node-count baseline — survives a reseed that
 * changes the ids. Empty values are skipped. Pure. */
export function templatePath(routePath: string, values: Record<string, string>): string {
  let out = routePath;
  for (const [name, value] of Object.entries(values)) {
    if (value) out = out.split(value).join(`{${name}}`);
  }
  return out;
}
