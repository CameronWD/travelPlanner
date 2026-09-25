/**
 * Shared Playwright plumbing for this repo's browser-driven audits
 * (`scripts/contrast-audit.ts`, and the layout audit that reuses it).
 *
 * Playwright itself is deliberately NOT a project dependency — see the
 * docblock in contrast-audit.ts for the full rationale (a ~300MB browser-
 * binary install most contributors won't need on every `npm install`).
 * `scripts/types/playwright-shim.d.ts` gives `tsc --noEmit` just enough type
 * surface to still typecheck this file without the real package installed.
 */

import * as path from "node:path";
import { execFileSync } from "node:child_process";

import type { BrowserType, Page } from "playwright";

export type Theme = "light" | "dark";
export type MapReveal = "wishlist-map-tab" | "show-day-map";

// --------------------------------------------------------------------------
// Resolving Playwright at runtime (not a static import — see below)
// --------------------------------------------------------------------------
//
// `playwright` is deliberately not a project dependency (see the docblock),
// so plain `require("playwright")` only succeeds if it happens to live
// somewhere Node's default resolution already looks: this script's own
// node_modules chain, or a directory listed in NODE_PATH. That covers a
// local `npm install --no-save playwright` and an environment that already
// exports NODE_PATH — but not a bare `npm run audit:contrast` in a
// container/machine where Playwright was installed globally and NODE_PATH
// isn't set, which is exactly this environment. `npm run` does not
// magically add npm's global root to Node's module resolution.
//
// So: try the normal resolution first: if that fails, ask npm itself where
// its global packages live (`npm root -g`) — NOT hard-coded, since that
// path differs by machine (this container vs. a Mac's Homebrew prefix,
// for instance) — and try requiring Playwright from there directly. If
// neither works, fail with an actionable message instead of a raw
// MODULE_NOT_FOUND stack trace.
// Node reports a failed `require("playwright")` and a failed
// `require("/abs/path/to/playwright")` with differently-shaped messages
// (the bare specifier vs. the full resolved path), so this only checks the
// one thing both forms guarantee: the `MODULE_NOT_FOUND` error code. That's
// slightly broader than matching "playwright" by name — a MODULE_NOT_FOUND
// thrown from deep inside Playwright's own dependency chain would also be
// swallowed here and reported as "not found" rather than surfaced verbatim
// — but the fallback error message below still points at the right fix
// (reinstall Playwright) in that case too, so the tradeoff is fine.
function isModuleNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND";
}

export function resolvePlaywright(): { chromium: BrowserType } {
  // Deliberately dynamic (not a static `import`) — see the comment above.
  const req = require as NodeRequire;

  try {
    return req("playwright");
  } catch (err) {
    if (!isModuleNotFoundError(err)) throw err;
  }

  let globalRoot: string | null = null;
  try {
    globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim() || null;
  } catch {
    globalRoot = null;
  }

  if (globalRoot) {
    try {
      return req(path.join(globalRoot, "playwright"));
    } catch (err) {
      if (!isModuleNotFoundError(err)) throw err;
    }
  }

  throw new Error(
    [
      "Playwright is required to run this audit, and could not be found.",
      "",
      "It is deliberately NOT a project dependency — see the docblock at the",
      "top of contrast-audit.ts — so it needs a one-time install of its own:",
      "",
      "  npx playwright install chromium",
      "",
      "If that alone doesn't fix it, Playwright's Node package itself isn't",
      "resolvable from here. Either install it locally without saving it to",
      "package.json:",
      "",
      "  npm install --no-save playwright && npx playwright install chromium",
      "",
      "...or, if it's installed globally somewhere this check didn't find" +
        (globalRoot ? ` (checked "${globalRoot}")` : ' ("npm root -g" itself failed)') +
        ",",
      "point Node at that location directly:",
      "",
      "  NODE_PATH=/path/to/global/node_modules npm run audit:contrast",
    ].join("\n"),
  );
}

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------

/** Loads /trips and, if that lands on /signin, signs in through the dev
 * login's "Continue as You". `afterFirstLoad` runs on that first page load,
 * before any sign-in click — the layout audit uses it to refuse a server
 * that isn't `next dev`; a throw from it aborts here. */
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
  if (!page.url().includes("/signin")) return;

  const continueButton = page.getByText("Continue as You", { exact: true });
  if ((await continueButton.count()) === 0) {
    throw new Error(
      `Session at ${authStatePath} is expired/invalid, and no "Continue as You" ` +
        "dev sign-in button was found on /signin (ALLOW_DEV_LOGIN may be off). " +
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
