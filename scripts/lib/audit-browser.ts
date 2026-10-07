/**
 * Shared Playwright plumbing for this repo's browser-driven audits
 * (`scripts/contrast-audit.ts`, the layout audit, the nav audit).
 *
 * Playwright is a devDependency. Its browsers are not downloaded on
 * `npm install` (set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 anywhere an install
 * must never fetch them, e.g. CI); run `npx playwright install chromium` once
 * on a machine that runs an audit.
 */

import { chromium, type BrowserType, type Page } from "playwright";

export type Theme = "light" | "dark";
export type MapReveal = "wishlist-map-tab" | "show-day-map";

/** The Chromium launcher every audit uses. The one place a harness file
 * takes a value from `playwright` (run.test.ts allowlists only this file). */
export function resolvePlaywright(): { chromium: BrowserType } {
  return { chromium };
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
  await page.goto(`${baseUrl}/trips`, {
    waitUntil: "networkidle",
    timeout: timeoutMs,
  });
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
// Maps (trap 1: Leaflet renders after networkidle — see contrast-audit.ts's
// docblock for the full story)
// --------------------------------------------------------------------------

/** Trap 1: click open the maps that mount collapsed, then wait for real markers. */
export async function revealMap(page: Page, reveal: MapReveal | undefined, markerWaitMs = 8_000): Promise<void> {
  if (reveal === "show-day-map") {
    const toggle = page.locator('button:has-text("Show day map")');
    if ((await toggle.count()) > 0) await toggle.first().click();
  } else if (reveal === "wishlist-map-tab") {
    const tab = page.getByText("Map", { exact: true });
    if ((await tab.count()) > 0) await tab.first().click();
  }

  await page
    .waitForSelector(".leaflet-marker-icon", { timeout: markerWaitMs })
    .catch(() => {
      // No marker appeared in time. Could be a genuinely empty map (e.g. an
      // empty wishlist) or a real regression — markerCount() below records
      // the number either way, and Step 6 in the report says which this is.
    });
}

export async function markerCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll(".leaflet-marker-icon").length);
}

// --------------------------------------------------------------------------
// Deriving a day route inside a trip's own range
// --------------------------------------------------------------------------

/** Reads the trip's calendar page and returns the sorted, deduped set of
 * YYYY-MM-DD dates linked from it, rather than hard-coding one. */
export async function deriveDayDates(page: Page, baseUrl: string, tripId: string): Promise<string[]> {
  await page.goto(`${baseUrl}/trips/${tripId}/calendar`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
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
