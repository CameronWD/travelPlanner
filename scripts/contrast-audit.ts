/**
 * Contrast audit — walks every reachable page route (both themes) and
 * measures WCAG contrast against what actually rendered.
 *
 * WHAT IT MEASURES
 * -----------------
 * For every element that owns its own directly-rendered text, this script:
 *   1. Reads the element's resolved `color` and `font-size`/`font-weight`.
 *   2. Composites the *effective* background by walking up the DOM,
 *      multiplying through every ancestor's alpha until it hits a fully
 *      opaque background (or runs out of ancestors, in which case it
 *      assumes white — the browser's own default canvas colour).
 *   3. Computes the WCAG 2.x contrast ratio between the two, and compares it
 *      against 4.5:1 (or 3:1 for large text: >=24px, or >=18.66px bold).
 *
 * Step 2 is the part that matters: reading a CSS *token's* colour (or a
 * component's declared `bg-*` class) tells you what was intended, not what a
 * Traveller's eyes receive once translucent overlays, glass panels and
 * nested cards stack on top of each other. A token can be named
 * "foreground" and still render at a failing ratio if it sits on a
 * semi-transparent card two levels down. Composited-against-render is the
 * only measurement that catches that, which is exactly what caught a real
 * failing 4.499 that a token-name-based check had read as a passing 4.618
 * earlier in this project.
 *
 * PREREQUISITES
 * -----------------
 *   - A running dev server (`npm run dev`) reachable at BASE_URL.
 *   - `npx playwright install chromium` — once, locally. Playwright itself
 *     is NOT a project dependency (see "why not a dependency" below); this
 *     environment has it installed globally instead, so:
 *
 *       NODE_PATH=/usr/local/lib/node_modules npm run audit:contrast
 *
 *     If your environment installed Playwright differently (e.g. as an
 *     actual local devDependency), just: `npm run audit:contrast`.
 *   - A logged-in session at /tmp/auth.json (Playwright storageState JSON).
 *     If it's expired, the script signs back in itself via the "Continue as
 *     You" dev login button — see ensureAuthenticated() below — as long as
 *     ALLOW_DEV_LOGIN=true is set (it is, in .env, for local/demo use).
 *
 * CONFIGURATION (env vars)
 * -----------------
 *   BASE_URL               Base URL to audit. Default http://localhost:3000.
 *   CONTRAST_AUDIT_AUTH_STATE   Path to the Playwright storageState JSON.
 *                                Default /tmp/auth.json.
 *
 * WHY NOT A DEPENDENCY
 * -----------------
 *   `playwright` ships ~300MB of browser binaries. Most contributors won't
 *   run this script often enough to justify that on every `npm install`.
 *   It's intentionally kept out of package.json; scripts/types/playwright-
 *   shim.d.ts gives `tsc --noEmit` just enough type surface to still
 *   typecheck this file without the real package installed.
 *
 * TWO TRAPS THIS PROJECT HAS ALREADY FALLEN INTO
 * -----------------
 *   1. Leaflet renders after `networkidle`. Every map on this site
 *      (globe, wishlist, route/summary, day) mounts via
 *      `next/dynamic(..., { ssr: false })`, and Leaflet's own marker layer
 *      finishes painting *after* the network goes idle — `networkidle` says
 *      "no more requests", not "Leaflet is done". Measuring right after
 *      `page.goto(..., { waitUntil: "networkidle" })` reads the page before
 *      markers exist. That previously undercounted pins by 21 and made an
 *      unrelated token fix look three times more effective than it actually
 *      was. Fix: for every map route, explicitly wait on
 *      `.leaflet-marker-icon` (see revealMapIfNeeded()) and record the
 *      marker count rather than trusting network idle. Two of the four map
 *      surfaces (wishlist, day/home) also hide their map behind a toggle
 *      button by default ("Map" tab, "Show day map") — the script clicks
 *      that open first, since a collapsed map that never mounted looks
 *      identical to a broken probe if you don't check.
 *
 *   2. A broken probe reports success. If the colour regex below ends up
 *      double-escaped (`\\(` where `\(` is meant), it matches nothing,
 *      measures zero nodes on every route, and reports a clean sweep — the
 *      exact failure mode that hid two real failures on the day route until
 *      it was found by accident. So: this script treats "zero text nodes
 *      measured on a route" as being exactly as bad as a real contrast
 *      failure. It exits non-zero either way. A silent pass is worse than no
 *      audit at all.
 *
 * ERROR BOUNDARIES (Step 3 judgement call)
 * -----------------
 *   There are 23 `error.tsx` files plus app/global-error.tsx. None of them
 *   are reachable by navigation — they only render when a route throws, and
 *   nothing in this app deliberately throws on demand. Every `error.tsx`
 *   (global-error.tsx is the one exception — it replaces the whole document
 *   and is intentionally inline-styled, with no Tailwind classes to audit)
 *   composes the same shared `ErrorPanel` component. So instead of skipping
 *   these surfaces, this script renders `ErrorPanel` itself, server-side,
 *   via `react-dom/server`, for all 4 `kind` values x both `layout` values,
 *   and swaps it into an already-loaded, already-styled page's <body> in the
 *   real browser (so it picks up the real compiled Tailwind CSS and the
 *   real `.dark` class state) before running the same probe over it. No new
 *   route ships for this — see auditErrorPanelHarness().
 *
 *   One more wrinkle found along the way: none of the three `not-found.tsx`
 *   files (app/(app)/not-found.tsx, trips/[tripId]/not-found.tsx,
 *   share/[token]/not-found.tsx) actually use ErrorPanel, despite a stray
 *   comment in error-panel.tsx claiming otherwise — they're each hand-rolled
 *   markup. They're covered anyway, for real, by navigation: see the
 *   "not-found" entries in ROUTES below.
 *
 * Run:
 *   NODE_PATH=/usr/local/lib/node_modules npm run audit:contrast
 */

import * as path from "node:path";
import { execFileSync } from "node:child_process";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserType, Page, BrowserContextOptions } from "playwright";

import { ErrorPanel, type ErrorPanelProps } from "@/components/ui/error-panel";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
type Kind = NonNullable<ErrorPanelProps["kind"]>;
type Layout = NonNullable<ErrorPanelProps["layout"]>;

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

function resolvePlaywright(): { chromium: BrowserType } {
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
      "top of this file — so it needs a one-time install of its own:",
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

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const AUTH_STATE_PATH =
  process.env.CONTRAST_AUDIT_AUTH_STATE ?? "/tmp/auth.json";

const TRIP_ID = "cmueo582d00b0q1lo9lf5taru";
const SHARE_TOKEN = "014b029f-d13b-4e09-8648-5aef72f8c702";

const VIEWPORT = { width: 1280, height: 1100 };
const NAV_TIMEOUT_MS = 30_000;
const MARKER_WAIT_MS = 8_000;
const DARK_SETTLE_MS = 350;

// --------------------------------------------------------------------------
// Route list (Step 2). "reveal" names a UI toggle that must be clicked
// before a map's markers exist in the DOM at all — see trap 1 above.
// --------------------------------------------------------------------------

interface RouteSpec {
  path: string;
  label: string;
  auth: boolean;
  isMap?: boolean;
  reveal?: "wishlist-map-tab" | "show-day-map";
  note?: string;
}

function tripPath(sub: string): string {
  return `/trips/${TRIP_ID}${sub}`;
}

const BASE_ROUTES: RouteSpec[] = [
  // --- Public: unauthenticated context ---
  { path: "/", label: "root (redirect)", auth: false },
  { path: "/signin", label: "sign in", auth: false },
  { path: "/privacy", label: "privacy", auth: false },
  { path: "/terms", label: "terms", auth: false },
  {
    path: `/share/${SHARE_TOKEN}`,
    label: "public share",
    auth: false,
    isMap: true,
  },

  // --- App: authenticated context ---
  { path: "/trips", label: "trips list", auth: true },
  { path: "/trips/new", label: "new trip", auth: true },
  { path: "/account", label: "account", auth: true },
  { path: "/globe", label: "globe", auth: true, isMap: true },
  { path: "/help", label: "help", auth: true },
  { path: "/whats-new", label: "what's new", auth: true },
  {
    path: "/admin",
    label: "admin",
    auth: true,
    note:
      "ADMIN_EMAILS is unset in this environment, so requireAdmin() calls " +
      "notFound() here and this route renders app/(app)/not-found.tsx. " +
      "Kept in the sweep deliberately: it's the only route in this codebase " +
      "that reaches that boundary through a real notFound() call rather " +
      "than a synthetic unmatched URL (see the docblock note on why a bare " +
      "made-up path doesn't reach it).",
  },

  // --- Trip: authenticated context, one seeded trip ---
  { path: tripPath(""), label: "trip home", auth: true, isMap: true, reveal: "show-day-map" },
  { path: tripPath("/plan"), label: "trip plan", auth: true },
  { path: tripPath("/budget"), label: "trip budget", auth: true },
  { path: tripPath("/calendar"), label: "trip calendar", auth: true },
  {
    path: tripPath("/wishlist"),
    label: "trip wishlist",
    auth: true,
    isMap: true,
    reveal: "wishlist-map-tab",
  },
  { path: tripPath("/summary"), label: "trip summary", auth: true, isMap: true },
  { path: tripPath("/today"), label: "trip today", auth: true },
  { path: tripPath("/checklists"), label: "trip checklists", auth: true },
  { path: tripPath("/files"), label: "trip files", auth: true },
  { path: tripPath("/journal"), label: "trip journal", auth: true },
  { path: tripPath("/activity"), label: "trip activity", auth: true },
  { path: tripPath("/settings"), label: "trip settings", auth: true },
  { path: tripPath("/compare"), label: "trip compare", auth: true },
  { path: tripPath("/print"), label: "trip print", auth: true },
  { path: tripPath("/help"), label: "trip help", auth: true },

  // --- Not-found: authenticated context ---
  {
    path: "/trips/does-not-exist",
    label: "not-found (trip)",
    auth: true,
    note: "Renders trips/[tripId]/not-found.tsx.",
  },
];
// A synthetic top-level path like "/this-page-does-not-exist" is
// deliberately NOT in this list: there is no root app/not-found.tsx and no
// layout segment matches it, so Next serves its own unstyled default 404
// instead of any of this app's boundaries (verified while building this
// script). It would measure Next's framework page, not ours, so it isn't
// useful to audit here. /admin above is what actually reaches
// app/(app)/not-found.tsx through real app code.

// --------------------------------------------------------------------------
// The in-browser probe (Step 1 — ported from /tmp/probe.txt, not rewritten).
// Runs inside the page via page.evaluate(), so DOM/window globals below are
// resolved in the browser, never in this Node process.
// --------------------------------------------------------------------------

interface ProbeRow {
  text: string;
  tag: string;
  cls: string;
  color: string;
  bg: string;
  px: number;
  bold: boolean;
  ratio: number;
  need: number;
  pass: boolean;
}

// IMPORTANT: this is a plain JS *string*, not a TypeScript function, and it
// is passed to page.evaluate() as a source string (see the call sites
// below), not as a function reference. That's deliberate, not an oversight:
// esbuild (which `tsx` uses to transpile this file) wraps named
// function/const bindings like the ones below in a `__name(fn, "name")`
// helper call to preserve `.name` for debugging. That helper is defined once
// at the top of the compiled *module*; Playwright's function-reference
// form of page.evaluate() serialises the target function via `.toString()`
// and runs *only that extracted text* inside the page, with no access to
// the rest of the module — so the extracted source calls a `__name` that
// was never sent, and the probe throws `ReferenceError: __name is not
// defined` on every route (found the hard way while building this script).
// A plain source string sidesteps the whole problem: there's nothing for
// esbuild to instrument, because none of this text is compiled by esbuild
// at all — it's inert until the browser itself evaluates it.
const PROBE_SCRIPT = `
(() => {
  // Trap 2 lives right here: this regex MUST stay single-escaped. Written as
  // "\\\\(" instead of "\\(" still compiles, matches nothing, and every route
  // silently measures zero nodes -- the exact bug that once made this script
  // report a clean sweep while measuring nothing at all. The zero-node exit
  // check in main() is the safety net if this regresses anyway.
  const parseColor = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((x) => parseFloat(x));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const luminance = (c) => {
    const f = (v) => {
      const n = v / 255;
      return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };

  const contrastRatio = (a, b) => {
    const sorted = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (sorted[0] + 0.05) / (sorted[1] + 0.05);
  };

  // The compositing walk: go up the DOM multiplying through every
  // ancestor's alpha until an opaque background is found. This is what
  // makes the measurement match the actual rendered cascade instead of
  // whatever a single element's own background-color declares -- a card
  // with a translucent tint sitting over another surface only shows its
  // true rendered colour once you've composited both.
  const effectiveBackground = (el) => {
    let acc = null;
    let node = el;
    while (node && node !== document.documentElement.parentElement) {
      const bg = parseColor(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) acc = acc ? over(acc, bg) : bg;
      if (acc && acc.a >= 0.999) return acc;
      node = node.parentElement;
    }
    return acc || { r: 255, g: 255, b: 255, a: 1 };
  };

  const classNameOf = (el) => {
    const cn = el.className;
    if (cn && typeof cn === "object" && "baseVal" in cn) return String(cn.baseVal);
    return typeof cn === "string" ? cn : "";
  };

  const out = [];
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    // Only elements with their own directly-rendered text (not text that
    // belongs to a descendant element) -- otherwise every ancestor of a
    // paragraph would double-count the same words.
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent || "").trim())
      .join(" ")
      .trim();
    if (!ownText) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    const fg = parseColor(cs.color);
    if (!fg) continue;
    const bg = effectiveBackground(el);
    const composed = fg.a < 1 ? over(fg, bg) : fg;
    const ratio = contrastRatio(composed, bg);

    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    // WCAG large-text threshold: >=24px, or >=18.66px bold.
    const large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;

    out.push({
      text: ownText.slice(0, 80),
      tag: el.tagName.toLowerCase(),
      cls: classNameOf(el).slice(0, 140),
      color: cs.color,
      bg: "rgb(" + Math.round(bg.r) + ", " + Math.round(bg.g) + ", " + Math.round(bg.b) + ")",
      px: Math.round(px * 10) / 10,
      bold: bold,
      ratio: Math.round(ratio * 1000) / 1000,
      need: need,
      pass: ratio >= need,
    });
  }
  return out;
})()
`;

// --------------------------------------------------------------------------
// Playwright helpers
// --------------------------------------------------------------------------

async function ensureAuthenticated(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/trips`, {
    waitUntil: "networkidle",
    timeout: NAV_TIMEOUT_MS,
  });
  if (!page.url().includes("/signin")) return;

  const continueButton = page.getByText("Continue as You", { exact: true });
  if ((await continueButton.count()) === 0) {
    throw new Error(
      `Session at ${AUTH_STATE_PATH} is expired/invalid, and no "Continue as You" ` +
        "dev sign-in button was found on /signin (ALLOW_DEV_LOGIN may be off). " +
        "Refresh the storageState file and retry.",
    );
  }
  await continueButton.first().click();
  await page.waitForURL(/\/trips/, { timeout: NAV_TIMEOUT_MS }).catch(() => {});
}

async function applyThemeClass(page: Page, theme: Theme): Promise<void> {
  if (theme === "dark") {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(DARK_SETTLE_MS);
  } else {
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  }
}

/** Trap 1: click open the maps that mount collapsed, then wait for real markers. */
async function revealMapIfNeeded(page: Page, spec: RouteSpec): Promise<void> {
  if (!spec.isMap) return;

  if (spec.reveal === "show-day-map") {
    const toggle = page.locator('button:has-text("Show day map")');
    if ((await toggle.count()) > 0) await toggle.first().click();
  } else if (spec.reveal === "wishlist-map-tab") {
    const tab = page.getByText("Map", { exact: true });
    if ((await tab.count()) > 0) await tab.first().click();
  }

  await page
    .waitForSelector(".leaflet-marker-icon", { timeout: MARKER_WAIT_MS })
    .catch(() => {
      // No marker appeared in time. Could be a genuinely empty map (e.g. an
      // empty wishlist) or a real regression — markerCount() below records
      // the number either way, and Step 6 in the report says which this is.
    });
}

async function markerCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll(".leaflet-marker-icon").length);
}

// --------------------------------------------------------------------------
// Auditing
// --------------------------------------------------------------------------

interface FailureRecord extends ProbeRow {
  route: string;
  theme: Theme;
}

interface RouteResult {
  route: string;
  label: string;
  theme: Theme;
  nodeCount: number;
  markerCount?: number;
  failures: FailureRecord[];
}

async function auditRoute(page: Page, spec: RouteSpec, theme: Theme): Promise<RouteResult> {
  await page.goto(`${BASE_URL}${spec.path}`, {
    waitUntil: "networkidle",
    timeout: NAV_TIMEOUT_MS,
  });
  await applyThemeClass(page, theme);

  let markers: number | undefined;
  if (spec.isMap) {
    await revealMapIfNeeded(page, spec);
    markers = await markerCount(page);
  }

  const rows = await page.evaluate<ProbeRow[]>(PROBE_SCRIPT);
  const failures: FailureRecord[] = rows
    .filter((r) => !r.pass)
    .map((r) => ({ ...r, route: spec.path, theme }));

  return {
    route: spec.path,
    label: spec.label,
    theme,
    nodeCount: rows.length,
    markerCount: markers,
    failures,
  };
}

/** Derives a date inside the trip's own range by reading its calendar page,
 * rather than hard-coding one. */
async function deriveDayRoute(page: Page): Promise<{ path: string; date: string; candidates: number }> {
  await page.goto(`${BASE_URL}${tripPath("/calendar")}`, {
    waitUntil: "networkidle",
    timeout: NAV_TIMEOUT_MS,
  });
  const dates = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href*='/day/']"))
      .map((a) => a.getAttribute("href") ?? "")
      .map((href) => href.match(/\/day\/(\d{4}-\d{2}-\d{2})/)?.[1])
      .filter((d): d is string => Boolean(d)),
  );
  const unique = Array.from(new Set(dates)).sort();
  if (unique.length === 0) {
    throw new Error(
      `Could not derive a day route: no /day/{date} links found on ${tripPath("/calendar")}. ` +
        "Check the trip id and that demo data is seeded.",
    );
  }
  // Middle of the range rather than the first/last day, to land on a day
  // with a full agenda rather than a possibly-thin arrival/departure day.
  const chosen = unique[Math.floor(unique.length / 2)];
  return { path: tripPath(`/day/${chosen}`), date: chosen, candidates: unique.length };
}

// --------------------------------------------------------------------------
// Error boundary harness (Step 3) — see the docblock's "ERROR BOUNDARIES"
// section for why this exists instead of skipping them.
// --------------------------------------------------------------------------

const ERROR_PANEL_KINDS: Kind[] = ["error", "offline", "not-found", "forbidden"];
const ERROR_PANEL_LAYOUTS: Layout[] = ["page", "card"];

function renderErrorPanelCombo(kind: Kind, layout: Layout): string {
  return renderToStaticMarkup(
    React.createElement(ErrorPanel, {
      kind,
      layout,
      digest: "a1b2c3",
      actions: React.createElement(
        React.Fragment,
        null,
        React.createElement(Button, { key: "retry" }, "Try again"),
        React.createElement(Button, { key: "back", variant: "secondary" }, "Back to trips"),
      ),
    }),
  );
}

async function auditErrorPanelHarness(page: Page, theme: Theme): Promise<RouteResult[]> {
  // Load a real, already-styled page first so the harness picks up the
  // actual compiled Tailwind CSS, fonts and .dark class handling — nothing
  // here is a new route, it's the existing /trips shell with its <body>
  // swapped for the panel markup.
  await page.goto(`${BASE_URL}/trips`, {
    waitUntil: "networkidle",
    timeout: NAV_TIMEOUT_MS,
  });
  await applyThemeClass(page, theme);

  const results: RouteResult[] = [];
  for (const kind of ERROR_PANEL_KINDS) {
    for (const layout of ERROR_PANEL_LAYOUTS) {
      const html = renderErrorPanelCombo(kind, layout);
      await page.evaluate((h) => {
        document.body.innerHTML = h;
      }, html);

      const rows = await page.evaluate<ProbeRow[]>(PROBE_SCRIPT);
      const route = `error-panel(kind=${kind},layout=${layout})`;
      const failures: FailureRecord[] = rows
        .filter((r) => !r.pass)
        .map((r) => ({ ...r, route, theme }));

      results.push({
        route,
        label: `ErrorPanel harness — ${kind}/${layout}`,
        theme,
        nodeCount: rows.length,
        failures,
      });
    }
  }
  return results;
}

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------

function printFailure(f: FailureRecord): void {
  console.log(`\n  [${f.theme.toUpperCase()}] ${f.route}`);
  console.log(`    ratio ${f.ratio}:1 (needs ${f.need}:1) — ${f.px}px${f.bold ? " bold" : ""}`);
  console.log(`    text: ${JSON.stringify(f.text)}`);
  console.log(`    fg ${f.color} on bg ${f.bg}`);
  console.log(`    class: "${f.cls}"`);
}

async function main(): Promise<void> {
  let chromium: BrowserType;
  try {
    ({ chromium } = resolvePlaywright());
  } catch (err) {
    // A resolution failure here is a documented, expected-to-happen-
    // sometimes prerequisite problem, not a bug — print just the actionable
    // message (see resolvePlaywright()), not a Node module-resolution stack.
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch();

  // Derive the day route once, up front, from a short-lived context.
  const bootCtx = await browser.newContext({ viewport: VIEWPORT, storageState: AUTH_STATE_PATH });
  const bootPage = await bootCtx.newPage();
  await ensureAuthenticated(bootPage);
  const day = await deriveDayRoute(bootPage);
  await bootCtx.close();
  console.log(
    `Derived day route ${day.path} (${day.candidates} day links found on the trip's calendar; ` +
      "picked the middle one).",
  );

  const routes: RouteSpec[] = [
    ...BASE_ROUTES,
    {
      path: day.path,
      label: "trip day",
      auth: true,
      isMap: true,
      reveal: "show-day-map",
    },
  ];

  const allResults: RouteResult[] = [];
  const allFailures: FailureRecord[] = [];
  const zeroNodeRoutes: string[] = [];

  for (const theme of ["light", "dark"] as const) {
    const contextOpts: BrowserContextOptions = { viewport: VIEWPORT, colorScheme: theme };
    const anonCtx = await browser.newContext(contextOpts);
    const authCtx = await browser.newContext({ ...contextOpts, storageState: AUTH_STATE_PATH });
    const anonPage = await anonCtx.newPage();
    const authPage = await authCtx.newPage();
    await ensureAuthenticated(authPage);

    for (const spec of routes) {
      const page = spec.auth ? authPage : anonPage;
      const result = await auditRoute(page, spec, theme);
      allResults.push(result);
      allFailures.push(...result.failures);
      if (result.nodeCount === 0) zeroNodeRoutes.push(`[${theme}] ${result.route}`);
      const markerNote = result.markerCount !== undefined ? `, markers=${result.markerCount}` : "";
      console.log(
        `[${theme}] ${result.route} — nodes=${result.nodeCount}${markerNote}, failures=${result.failures.length}`,
      );
    }

    const errorPanelResults = await auditErrorPanelHarness(authPage, theme);
    for (const result of errorPanelResults) {
      allResults.push(result);
      allFailures.push(...result.failures);
      if (result.nodeCount === 0) zeroNodeRoutes.push(`[${theme}] ${result.route}`);
      console.log(
        `[${theme}] ${result.route} — nodes=${result.nodeCount}, failures=${result.failures.length}`,
      );
    }

    await anonCtx.close();
    await authCtx.close();
  }

  await browser.close();

  const totalNodes = allResults.reduce((sum, r) => sum + r.nodeCount, 0);

  console.log("\n" + "=".repeat(72));
  console.log(
    `Routes measured: ${new Set(allResults.map((r) => r.route)).size}  ` +
      `Total (route x theme) passes: ${allResults.length}  ` +
      `Total text nodes: ${totalNodes}  ` +
      `Failures: ${allFailures.length}`,
  );

  if (zeroNodeRoutes.length > 0) {
    console.log(
      `\nZERO-NODE ROUTES (probe broke, or the route is broken — see the docblock's trap 2):`,
    );
    for (const r of zeroNodeRoutes) console.log(`  ${r}`);
  }

  if (allFailures.length > 0) {
    console.log(`\nFAILURES (${allFailures.length}):`);
    for (const f of allFailures) printFailure(f);
  }

  console.log("\n" + "=".repeat(72));

  if (allFailures.length > 0 || zeroNodeRoutes.length > 0) {
    console.log(
      `RESULT: FAIL — ${allFailures.length} contrast failure(s), ${zeroNodeRoutes.length} zero-node route(s).`,
    );
    process.exitCode = 1;
  } else {
    console.log("RESULT: PASS — no contrast failures, no zero-node routes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
