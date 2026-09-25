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
 *     You" dev login button — see ensureAuthenticated() in
 *     scripts/lib/audit-browser.ts — as long as
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
 * THREE TRAPS THIS PROJECT HAS ALREADY FALLEN INTO
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
 *      `.leaflet-marker-icon` (see revealMap() in scripts/lib/audit-browser.ts) and record the
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
 *   3. A gradient reads as "no background" — and can flip a real failure
 *      into a false PASS, not just a wrong number. `effectiveBackground()`
 *      originally read only `getComputedStyle(node).backgroundColor`; a
 *      background-image (which is how every `bg-gradient-to-*` utility here
 *      actually paints — Tailwind's gradient classes set background-image,
 *      never background-color) reports `rgba(0,0,0,0)` there, so the walk
 *      treated it as transparent and kept going, landing on whatever opaque
 *      colour happened to sit further up the tree. Caught in review on
 *      `weather-daylight-card.tsx`'s fixed (non-theme-varying) gradient:
 *      white text on it is ~2.5:1 in BOTH themes, but the old walk measured
 *      light mode against the page background behind the card (reporting
 *      the right verdict for the wrong reason: 1.025:1 against a colour
 *      that isn't actually there) and measured dark mode against the dark
 *      page background *two levels up*, landing on ~16:1 — a clean pass for
 *      text that was still actually failing. A false pass is strictly worse
 *      than a wrong ratio: it drops a real failure from the count instead of
 *      just mis-describing it. There is no cheap way to know the *true*
 *      rendered colour of a gradient without sampling actual pixels (e.g.
 *      drawing the element to a canvas), which this script does not attempt
 *      — so `effectiveBackground()` instead stops dead the instant it meets
 *      a background-image and reports that row as `unmeasurable`, and
 *      `unmeasurable` rows are always `pass: false` and are reported (and
 *      counted toward a non-zero exit) as their own category, never folded
 *      into "clean". An unmeasurable background must never resolve to a
 *      pass — same principle as the zero-node check, at the row level.
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
 * EXEMPTION: WCAG 1.4.3 inactive user interface components (TWO GATES)
 * -----------------
 *   Leaflet's own disabled zoom-in/zoom-out control (`.leaflet-control-zoom-*`,
 *   stock CSS from node_modules/leaflet/dist/leaflet.css: #bbb text on #f4f4f4,
 *   ~1.75:1) fails 3:1 in both themes, on both map surfaces, always — but
 *   WCAG 2.x SC 1.4.3 explicitly scopes the contrast minimum to "text ... that
 *   is part of ... an inactive user interface component", so this specific
 *   failure is not a design-token defect: it is the control's intended
 *   "you can't zoom further" affordance, genuinely exempt by name in the
 *   normative text, not a convenient excuse to silence a red gate.
 *
 *   Without this exemption those 4 rows can never leave the failure list —
 *   Leaflet ships the colours, this app doesn't own them, and they don't vary
 *   by theme — which makes the whole gate permanently red and therefore
 *   useless: nobody reads a check that never passes. But the fix has to be
 *   narrow, or it quietly re-opens the exact hole this script exists to
 *   close (see "THREE TRAPS" above, and the node-count-regression fix below
 *   it) — a bucket that's easy to fall into by *looking* disabled is just a
 *   failure with a rug pulled over it. Review of an earlier version of this
 *   exemption found exactly that: `el.closest('[aria-disabled="true"],
 *   :disabled')` climbs to ANY matching ancestor anywhere in the app, and
 *   `exempted` was excluded from the exit condition — so a future change
 *   nesting genuinely-failing, unrelated text under some other disabled
 *   ancestor (a disabled form button used as a layout wrapper, say) would
 *   silently land in `exempted` and `RESULT: PASS` would still print. The
 *   only backstop was a human reading the printed list every run — the same
 *   "computed and printed, but not counted" shape as the gradient trap and
 *   the node-count trap above. Hence two independent gates, not one:
 *
 *   GATE 1 (semantic, deliberately broad): is this element on SOME
 *   genuinely inactive UI component at all? `el.closest('[aria-disabled="true"],
 *   :disabled')`:
 *     - `[aria-disabled="true"]` matches only the exact string "true" — an
 *       element sitting at `aria-disabled="false"` (which Leaflet also sets,
 *       on the *other* zoom button, the instant you're not at that extreme)
 *       does NOT match. Confirmed directly in
 *       node_modules/leaflet/dist/leaflet-src.js (~line 5570-5583): Leaflet
 *       flips this attribute between "true" and "false" as the real map zoom
 *       crosses min/max, so this reads live interaction state, not a static
 *       marker some stylesheet happened to leave lying around.
 *     - `:disabled` is a browser pseudo-class, true only for real form
 *       controls (button/input/select/textarea/…) carrying the `disabled`
 *       DOM property — the platform's own definition of "inactive", not a
 *       heuristic this script invents.
 *   This selector is kept exactly this broad ON PURPOSE: WCAG 1.4.3's
 *   exemption is about inactive components generally, not about Leaflet, so
 *   narrowing gate 1 itself down to Leaflet's classes would misrepresent
 *   what the standard actually exempts. Gate 1 alone answers "is this kind
 *   of failure even eligible to be excused" — it does not, by itself, excuse
 *   anything.
 *
 *   GATE 2 (identity, deliberately narrow): EXPECTED_EXEMPTIONS, a
 *   module-level allowlist of the SPECIFIC controls this repo has actually
 *   examined and accepted — currently just the two Leaflet zoom buttons
 *   (`a.leaflet-control-zoom-in`, `a.leaflet-control-zoom-out`). Matching is
 *   against the matched ancestor's OWN tag and class (`exemptAncestorTag` /
 *   `exemptAncestorClass` on ProbeRow) — not the text-owning element's:
 *   Leaflet's zoom-button text ("+"/"−") lives in an unclassed inner `<span
 *   aria-hidden="true">`; the class and `aria-disabled` are one level up, on
 *   the `<a>` (verified directly against rendered DOM: `<a
 *   class="leaflet-control-zoom-in leaflet-disabled" aria-disabled="true"
 *   role="button"><span aria-hidden="true">+</span></a>`). `.closest()`
 *   starts its climb at the `<span>` and stops at the `<a>` — so identity
 *   has to be read off the ancestor it actually stopped at, not off the row.
 *
 *   A row must pass BOTH gates to reach the `exempted` bucket and leave
 *   `RESULT: PASS` green:
 *     - Gate 1 passes, gate 2 passes → `exempted`. A real, examined,
 *       accepted exemption. Printed in full, NOT counted toward the exit
 *       code.
 *     - Gate 1 passes, gate 2 fails → `unrecognizedExemptions`. Sits on
 *       *some* disabled ancestor, but not one this repo has ever looked at
 *       and accepted. This is NOT exempt — it is reported as its own
 *       distinct, clearly-labelled category ("UNRECOGNISED EXEMPTIONS", not
 *       "EXEMPTED") and DOES gate the exit code, exactly like a plain
 *       failure. This is the case the old single-gate version could never
 *       produce, and is exactly why gate 2 exists.
 *     - Gate 1 fails → ordinary `failures`, untouched by any of this.
 *
 *   WHAT TO DO WHEN THE AUDIT REPORTS AN UNRECOGNISED EXEMPTION: examine the
 *   printed row (it names the ancestor's tag and class) like any other
 *   failure, then either (a) fix the actual contrast — it's a real failure
 *   until proven otherwise — or (b) if it genuinely is a WCAG-1.4.3-exempt
 *   inactive component, add a considered entry to EXPECTED_EXEMPTIONS naming
 *   that specific control by its own tag/class. Never "fix" it by widening
 *   gate 1's selector or by deleting the specificity out of a gate-2 entry
 *   (e.g. matching on tag alone, or on a substring so short it could match
 *   unrelated markup) — that re-opens the exact hole this two-gate design
 *   closes.
 *
 *   A row that passes despite matching gate 1 is just left as a normal pass
 *   either way; both `exempted` and `unrecognizedExemptions` only ever hold
 *   failures that are being either excused or flagged, never things that
 *   already passed on their own.
 *
 *   Alternative considered and rejected: overriding Leaflet's own disabled
 *   colours in globals.css to hit 3:1. Rejected because the low contrast IS
 *   the correct affordance here (WCAG names this exact case as exempt, not
 *   merely tolerated), so "fixing" it would fight the control's own design
 *   intent to satisfy a check that doesn't apply to it, and it would mean
 *   carrying a permanent CSS override against a third-party stylesheet for a
 *   problem WCAG itself says isn't one.
 *
 * KNOWN GAP: TripCover's gradient fallback is dormant in this sweep
 * -----------------
 *   `components/trip/trip-cover.tsx`'s `MonogramCover` renders
 *   `bg-gradient-to-br from-{coral,sun,teal,lilac} to-muted` with
 *   `text-on-accent/80` (LA-044 changed the exact tokens; the gap below is
 *   unaffected) —
 *   another background-image site, same as trap 3 above, and now correctly
 *   caught as `unmeasurable` if this script ever renders it. But it never
 *   does in this sweep: the one trip it visits (the seeded "EU Christmas
 *   2026", resolved by name) has a rasterised cover image, so `TripCover` always takes the
 *   photo branch, never the monogram-gradient fallback. A real Traveller
 *   reaches `MonogramCover` on any brand-new, coverless trip — this script
 *   just can't exercise that state without creating one (out of scope for a
 *   fixed-trip-id sweep). The fix is generic (any background-image anywhere
 *   in the walk is caught, not just the one this review found), so if a
 *   future route list ever does reach it, it'll report `unmeasurable`
 *   rather than a false pass — but right now it's simply unaudited, and
 *   this note is that being said plainly rather than silently.
 *
 * ON THE NODE-COUNT BASELINE
 * -----------------
 *   Zero nodes on a route is treated as broken (trap 2). A route that
 *   quietly regresses from, say, 400 nodes to 3 — still not literally zero
 *   — would sail past that check, and this sweep's per-route sanity-check
 *   was a human reading the numbers once, which doesn't re-run itself.
 *
 *   An EXACT pinned baseline (assert /help renders precisely 399 nodes,
 *   forever) was considered and rejected as too brittle for this app
 *   specifically: the day route's weather widget pulls live data from
 *   Open-Meteo, so its node count can legitimately shift with the forecast,
 *   and the seeded demo data is expected to evolve over time. An exact
 *   match would need hand-maintenance on every unrelated content change,
 *   which is exactly the kind of noisy gate that trains people to ignore
 *   failures.
 *
 *   Instead: docs/audits/contrast-node-counts.json records this run's node
 *   count per route+theme, and each run flags any route that MORE THAN
 *   HALVED versus that committed file (and was non-trivial to begin with —
 *   see NODE_COUNT_REGRESSION_FLOOR) as a "NODE-COUNT REGRESSION". This is a
 *   real gate, not just a printed note: a regression contributes to the
 *   non-zero exit code exactly like a contrast failure, an unmeasurable row
 *   or a zero-node route (an earlier draft of this check computed and
 *   printed regressions but never wired them into the exit condition —
 *   caught in review as trap 2 reintroduced through a fourth channel: a
 *   check that can print "REGRESSION" and still exit 0 is a silent pass by
 *   definition).
 *
 *   The baseline file only advances for routes that did NOT regress — a
 *   regressed route's PREVIOUS (higher) value is held in the saved file,
 *   not overwritten, unless the run is invoked with
 *   `ACCEPT_NODE_COUNT_BASELINE=1` (or `--accept-baseline`). So a bare
 *   re-run can never be how a collapse launders itself into the new normal:
 *   the same regression keeps failing every subsequent run until someone
 *   either fixes the page or deliberately re-runs with that flag to accept
 *   the lower count as intentional. Content that legitimately GROWS is
 *   never affected by any of this — only `current < previous * 0.5` trips
 *   the check, so a rise always just updates the baseline normally.
 *
 * Run:
 *   NODE_PATH=/usr/local/lib/node_modules npm run audit:contrast
 */

import * as path from "node:path";
import * as fs from "node:fs";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserType, Page, BrowserContextOptions } from "playwright";

import { ErrorPanel, type ErrorPanelProps } from "@/components/ui/error-panel";
import { Button } from "@/components/ui/button";
import {
  resolvePlaywright,
  ensureAuthenticated,
  applyThemeClass,
  revealMap,
  markerCount,
  deriveDayDates,
  middleDate,
  templatePath,
  type Theme,
  type MapReveal,
} from "./lib/audit-browser";
import { TRIP_NAMES, readShareToken, resolveTripIdByName } from "./layout-audit/trips";

type Kind = NonNullable<ErrorPanelProps["kind"]>;
type Layout = NonNullable<ErrorPanelProps["layout"]>;

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const AUTH_STATE_PATH =
  process.env.CONTRAST_AUDIT_AUTH_STATE ?? "/tmp/auth.json";

// The sweep's one seeded trip and its public share link are resolved at run
// time — the trip by name on /trips (the layout audit's "deep" trip), the
// token off that trip's settings page — rather than hard-coded, since a
// hard-coded id silently goes stale the moment seed data is regenerated.
// Either can be pinned with an env override.
const TRIP_NAME = TRIP_NAMES.deep;
const TRIP_ID_OVERRIDE = process.env.CONTRAST_TRIP_ID;
const SHARE_TOKEN_OVERRIDE = process.env.CONTRAST_SHARE_TOKEN;

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
  reveal?: MapReveal;
  note?: string;
}

function tripPath(tripId: string, sub: string): string {
  return `/trips/${tripId}${sub}`;
}

function baseRoutes(tripId: string, shareToken: string): RouteSpec[] {
  const trip = (sub: string) => tripPath(tripId, sub);
  return [
    // --- Public: unauthenticated context ---
    { path: "/", label: "root (redirect)", auth: false },
    { path: "/signin", label: "sign in", auth: false },
    { path: "/privacy", label: "privacy", auth: false },
    { path: "/terms", label: "terms", auth: false },
    {
      path: `/share/${shareToken}`,
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
    { path: trip(""), label: "trip home", auth: true, isMap: true, reveal: "show-day-map" },
    { path: trip("/plan"), label: "trip plan", auth: true },
    { path: trip("/budget"), label: "trip budget", auth: true },
    { path: trip("/calendar"), label: "trip calendar", auth: true },
    {
      path: trip("/wishlist"),
      label: "trip wishlist",
      auth: true,
      isMap: true,
      reveal: "wishlist-map-tab",
    },
    { path: trip("/summary"), label: "trip summary", auth: true, isMap: true },
    { path: trip("/today"), label: "trip today", auth: true },
    { path: trip("/checklists"), label: "trip checklists", auth: true },
    { path: trip("/files"), label: "trip files", auth: true },
    { path: trip("/journal"), label: "trip journal", auth: true },
    { path: trip("/activity"), label: "trip activity", auth: true },
    { path: trip("/settings"), label: "trip settings", auth: true },
    { path: trip("/compare"), label: "trip compare", auth: true },
    { path: trip("/print"), label: "trip print", auth: true },
    { path: trip("/help"), label: "trip help", auth: true },

    // --- Not-found: authenticated context ---
    {
      path: "/trips/does-not-exist",
      label: "not-found (trip)",
      auth: true,
      note: "Renders trips/[tripId]/not-found.tsx.",
    },
  ];
}

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
  /** The resolved, COMPOSITED foreground actually used for the ratio — not
   * the raw `color` CSS value, which can be translucent (e.g. `text-primary/70`)
   * and therefore diverge from what was measured. Null when `unmeasurable`. */
  color: string;
  /** Composited effective background, or an explanatory string when
   * `unmeasurable` is true (there is then no meaningful rgb() to report). */
  bg: string;
  px: number;
  bold: boolean;
  /** Null when `unmeasurable` — there is nothing to compute a ratio from. */
  ratio: number | null;
  need: number;
  /** Always false when `unmeasurable` — an unmeasurable background must
   * never be reported as a pass (see effectiveBackground() below). */
  pass: boolean;
  /** True when an ancestor's background-image made the effective background
   * impossible to determine from computed style alone (gradients, images —
   * Tailwind's bg-gradient-* utilities only ever set background-image, never
   * background-color, so the old walk read them as fully transparent and
   * silently composited against whatever was further up instead). */
  unmeasurable: boolean;
  /** True when this element (or the closest ancestor matching) is a
   * genuinely inactive UI component — `[aria-disabled="true"]` or `:disabled`
   * — per WCAG 1.4.3's exemption for inactive user interface components. This
   * is gate 1 of 2 (the semantic gate) — see the docblock's "EXEMPTION"
   * section. Passing gate 1 alone is NOT enough to leave RESULT green; see
   * EXPECTED_EXEMPTIONS (gate 2) below. exempt=true on a passing row is not
   * reported specially at all. */
  exempt: boolean;
  /** Which selector matched, for the exemption report. Null unless exempt. */
  exemptReason: string | null;
  /** Tag name of the closest ancestor that matched the exemption selector
   * (lowercased), or null if none matched. This is gate 2's raw material —
   * the allowlist matches on THIS ancestor's own identity, not on the
   * text-owning element, because the text-owning node for Leaflet's zoom
   * controls is an inner `<span aria-hidden="true">` with no class of its
   * own; the class and `aria-disabled` live one level up, on the `<a>`. */
  exemptAncestorTag: string | null;
  /** className of the closest matching ancestor (space-separated, as
   * rendered), or null if none matched. See exemptAncestorTag. */
  exemptAncestorClass: string | null;
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
  //
  // Trap 3 (found via review, not by the original prototype): a
  // background-image -- which is how every one of this app's
  // bg-gradient-to-* utilities paints, since Tailwind's gradient classes set
  // only background-image and leave background-color untouched -- is NOT
  // the same as "no background". The old version of this walk read
  // getComputedStyle(node).backgroundColor, saw rgba(0,0,0,0), and treated
  // the node as fully transparent, walking straight past a gradient to
  // whatever opaque colour sat further up. That produced a false PASS: white
  // text on a two-stop gradient (~2.5:1 in both themes) measured as ~16:1 in
  // dark mode, because the walk landed on the dark page background instead
  // of the gradient actually behind the text, and silently dropped a real
  // failure from the count. Measuring the true rendered colour of a
  // gradient would need sampling actual pixels (e.g. drawing the element to
  // a canvas), which this script does not do -- so instead: the walk stops
  // dead the moment it meets a background-image, and the caller reports
  // that row as unmeasurable rather than guessing. An unmeasurable
  // background must never resolve to a pass -- same principle as the
  // zero-node check, just for a single row instead of a whole route.
  const effectiveBackground = (el) => {
    let acc = null;
    let node = el;
    while (node && node !== document.documentElement.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== "none") {
        return { unmeasurable: true };
      }
      const bg = parseColor(style.backgroundColor);
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

    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    // WCAG large-text threshold: >=24px, or >=18.66px bold.
    const large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    const baseRow = {
      text: ownText.slice(0, 80),
      tag: el.tagName.toLowerCase(),
      cls: classNameOf(el).slice(0, 140),
      px: Math.round(px * 10) / 10,
      bold: bold,
      need: need,
    };

    // WCAG 1.4.3 exemption for genuinely inactive UI components -- see the
    // docblock's "EXEMPTION" section for why these two selectors specifically
    // (a live interaction-state attribute, and the platform's own disabled
    // pseudo-class) and not, say, a class name or a colour/opacity heuristic.
    const disabledAncestor = el.closest('[aria-disabled="true"], :disabled');
    const exempt = disabledAncestor !== null;
    const exemptReason = !disabledAncestor
      ? null
      : disabledAncestor.matches('[aria-disabled="true"]')
        ? 'aria-disabled="true"'
        : ":disabled (form control)";
    // Gate 2's raw material (see EXPECTED_EXEMPTIONS in Node-land below) --
    // the ancestor's OWN identity, not the text-owning element's. Leaflet's
    // zoom buttons put the text in an unclassed inner <span aria-hidden>; the
    // class and aria-disabled live on the outer <a>, one level up.
    const exemptAncestorTag = disabledAncestor ? disabledAncestor.tagName.toLowerCase() : null;
    const exemptAncestorClass = disabledAncestor ? classNameOf(disabledAncestor) : null;

    const bg = effectiveBackground(el);
    if (bg.unmeasurable) {
      // Report the raw (possibly translucent) colour here -- there is no
      // effective background to composite it against, so "composited fg"
      // isn't a meaningful thing to compute.
      out.push(
        Object.assign({}, baseRow, {
          color: cs.color,
          bg: "unmeasurable (an ancestor has a background-image -- gradient or image -- that this probe cannot safely composite against; see effectiveBackground())",
          ratio: null,
          pass: false,
          unmeasurable: true,
          exempt: exempt,
          exemptReason: exemptReason,
          exemptAncestorTag: exemptAncestorTag,
          exemptAncestorClass: exemptAncestorClass,
        }),
      );
      continue;
    }

    const composed = fg.a < 1 ? over(fg, bg) : fg;
    const ratio = contrastRatio(composed, bg);

    out.push(
      Object.assign({}, baseRow, {
        // The COMPOSITED foreground, not the raw cs.color -- for opaque text
        // they're identical, but for translucent foregrounds (e.g.
        // text-primary/70) the raw value would diverge from what the ratio
        // was actually computed from.
        color: "rgb(" + Math.round(composed.r) + ", " + Math.round(composed.g) + ", " + Math.round(composed.b) + ")",
        bg: "rgb(" + Math.round(bg.r) + ", " + Math.round(bg.g) + ", " + Math.round(bg.b) + ")",
        ratio: Math.round(ratio * 1000) / 1000,
        pass: ratio >= need,
        unmeasurable: false,
        exempt: exempt,
        exemptReason: exemptReason,
        exemptAncestorTag: exemptAncestorTag,
        exemptAncestorClass: exemptAncestorClass,
      }),
    );
  }
  return out;
})()
`;

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
  /** Rows where the background couldn't be determined (background-image on
   * an ancestor — see effectiveBackground()). Reported and counted as *not
   * clean*, same as a zero-node route — never silently dropped. */
  unmeasured: FailureRecord[];
  /** Rows that failed the contrast minimum, sit on a genuinely inactive
   * UI component (gate 1 — WCAG 1.4.3 exemption), AND match a specific,
   * examined entry in EXPECTED_EXEMPTIONS (gate 2). Reported in full, but
   * deliberately NOT counted toward the exit code — see main(). */
  exempted: FailureRecord[];
  /** Rows that failed the contrast minimum and sit on SOME genuinely
   * inactive UI component (gate 1 passes) but do NOT match anything in
   * EXPECTED_EXEMPTIONS (gate 2 fails). These are NOT exempt — they are
   * failures wearing gate 1's clothes. Reported distinctly from both
   * `failures` and `exempted`, and DO gate the exit code — see main() and
   * the docblock's "EXEMPTION" section. */
  unrecognizedExemptions: FailureRecord[];
}

// --------------------------------------------------------------------------
// Gate 2 of the exemption: an explicit allowlist of the specific inactive
// controls this repo has actually examined and accepted as exempt. See the
// docblock's "EXEMPTION" section for the full two-gate rationale — in short,
// gate 1 (`[aria-disabled="true"], :disabled` in the probe script above) is
// deliberately broad, because WCAG 1.4.3's exemption for inactive UI
// components is general, not Leaflet-specific. Narrowing THAT selector to
// Leaflet's own classes would misrepresent the standard. So narrowing
// happens here instead, as a second, independent gate: a failing+exempt row
// only leaves the exit code green if it ALSO matches one of these entries by
// the matched ancestor's own tag/class identity — never by "something
// disabled sits above it", which is gate 1's job and gate 1's job alone.
// --------------------------------------------------------------------------

interface ExemptionAllowlistEntry {
  /** Human-readable name, used only in reporting. */
  name: string;
  /** True if `row`'s matched disabled ancestor (exemptAncestorTag /
   * exemptAncestorClass — see ProbeRow) is specifically this control. Must
   * check the ancestor's own tag/class, never merely `row.exempt`. */
  matches: (row: ProbeRow) => boolean;
}

function ancestorHasClass(row: ProbeRow, cls: string): boolean {
  return (row.exemptAncestorClass ?? "").split(/\s+/).includes(cls);
}

const EXPECTED_EXEMPTIONS: ExemptionAllowlistEntry[] = [
  {
    name: "Leaflet zoom-in control (a.leaflet-control-zoom-in)",
    matches: (row) => row.exemptAncestorTag === "a" && ancestorHasClass(row, "leaflet-control-zoom-in"),
  },
  {
    name: "Leaflet zoom-out control (a.leaflet-control-zoom-out)",
    matches: (row) => row.exemptAncestorTag === "a" && ancestorHasClass(row, "leaflet-control-zoom-out"),
  },
];

function matchesExpectedExemption(row: ProbeRow): boolean {
  return EXPECTED_EXEMPTIONS.some((entry) => entry.matches(row));
}

function splitRows(
  rows: ProbeRow[],
  route: string,
  theme: Theme,
): {
  failures: FailureRecord[];
  unmeasured: FailureRecord[];
  exempted: FailureRecord[];
  unrecognizedExemptions: FailureRecord[];
} {
  const failures: FailureRecord[] = [];
  const unmeasured: FailureRecord[] = [];
  const exempted: FailureRecord[] = [];
  const unrecognizedExemptions: FailureRecord[] = [];
  for (const r of rows) {
    const record: FailureRecord = { ...r, route, theme };
    if (r.unmeasurable) {
      unmeasured.push(record);
    } else if (!r.pass) {
      // Gate 1: is this on SOME genuinely inactive control at all?
      if (r.exempt) {
        // Gate 2: is it SPECIFICALLY one this repo has examined and
        // accepted? Only both gates together excuse the failure — gate 1
        // alone is not exemption, it's just "not yet flagged as one".
        if (matchesExpectedExemption(r)) exempted.push(record);
        else unrecognizedExemptions.push(record);
      } else {
        failures.push(record);
      }
    }
  }
  return { failures, unmeasured, exempted, unrecognizedExemptions };
}

async function auditRoute(page: Page, spec: RouteSpec, theme: Theme): Promise<RouteResult> {
  await page.goto(`${BASE_URL}${spec.path}`, {
    waitUntil: "networkidle",
    timeout: NAV_TIMEOUT_MS,
  });
  await applyThemeClass(page, theme, DARK_SETTLE_MS);

  let markers: number | undefined;
  if (spec.isMap) {
    await revealMap(page, spec.reveal, MARKER_WAIT_MS);
    markers = await markerCount(page);
  }

  const rows = await page.evaluate<ProbeRow[]>(PROBE_SCRIPT);
  const { failures, unmeasured, exempted, unrecognizedExemptions } = splitRows(rows, spec.path, theme);

  return {
    route: spec.path,
    label: spec.label,
    theme,
    nodeCount: rows.length,
    markerCount: markers,
    failures,
    unmeasured,
    exempted,
    unrecognizedExemptions,
  };
}

/** Derives a date inside the trip's own range by reading its calendar page,
 * rather than hard-coding one. */
async function deriveDayRoute(
  page: Page,
  tripId: string,
): Promise<{ path: string; date: string; candidates: number }> {
  const dates = await deriveDayDates(page, BASE_URL, tripId);
  // Middle of the range rather than the first/last day, to land on a day
  // with a full agenda rather than a possibly-thin arrival/departure day.
  const chosen = middleDate(dates);
  if (!chosen) {
    throw new Error(
      `Could not derive a day route: no /day/{date} links found on ${tripPath(tripId, "/calendar")}. ` +
        "Check the trip id and that demo data is seeded.",
    );
  }
  return { path: tripPath(tripId, `/day/${chosen}`), date: chosen, candidates: dates.length };
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
  await applyThemeClass(page, theme, DARK_SETTLE_MS);

  const results: RouteResult[] = [];
  for (const kind of ERROR_PANEL_KINDS) {
    for (const layout of ERROR_PANEL_LAYOUTS) {
      const html = renderErrorPanelCombo(kind, layout);
      await page.evaluate((h) => {
        document.body.innerHTML = h;
      }, html);

      const rows = await page.evaluate<ProbeRow[]>(PROBE_SCRIPT);
      const route = `error-panel(kind=${kind},layout=${layout})`;
      const { failures, unmeasured, exempted, unrecognizedExemptions } = splitRows(rows, route, theme);

      results.push({
        route,
        label: `ErrorPanel harness — ${kind}/${layout}`,
        theme,
        nodeCount: rows.length,
        failures,
        unmeasured,
        exempted,
        unrecognizedExemptions,
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

function printExempted(f: FailureRecord): void {
  console.log(`\n  [${f.theme.toUpperCase()}] ${f.route}`);
  console.log(`    ratio ${f.ratio}:1 (needs ${f.need}:1) — ${f.px}px${f.bold ? " bold" : ""} — EXEMPT: ${f.exemptReason}`);
  console.log(`    text: ${JSON.stringify(f.text)}`);
  console.log(`    fg ${f.color} on bg ${f.bg}`);
  console.log(`    class: "${f.cls}"`);
}

function printUnrecognizedExemption(f: FailureRecord): void {
  console.log(`\n  [${f.theme.toUpperCase()}] ${f.route}`);
  console.log(
    `    ratio ${f.ratio}:1 (needs ${f.need}:1) — ${f.px}px${f.bold ? " bold" : ""} — ` +
      `UNRECOGNISED EXEMPTION (sits on ${f.exemptReason}, ancestor <${f.exemptAncestorTag} class="${f.exemptAncestorClass}">, ` +
      `but no EXPECTED_EXEMPTIONS entry matches it — NOT exempt, treated as a failure)`,
  );
  console.log(`    text: ${JSON.stringify(f.text)}`);
  console.log(`    fg ${f.color} on bg ${f.bg}`);
  console.log(`    class: "${f.cls}"`);
}

function printUnmeasured(f: FailureRecord): void {
  console.log(`\n  [${f.theme.toUpperCase()}] ${f.route}`);
  console.log(`    ${f.bg}`);
  console.log(`    text: ${JSON.stringify(f.text)} — ${f.px}px${f.bold ? " bold" : ""}`);
  console.log(`    fg (raw, not composited — no background to composite against): ${f.color}`);
  console.log(`    class: "${f.cls}"`);
}

// --------------------------------------------------------------------------
// Node-count baseline (informational regression check — see the docblock's
// "ON THE NODE-COUNT BASELINE" note for why this is a relative, self-
// updating check rather than an exact pinned count.)
// --------------------------------------------------------------------------

const NODE_COUNT_BASELINE_PATH = path.join(process.cwd(), "docs", "audits", "contrast-node-counts.json");
// A route has to regress by more than half, AND have been non-trivial to
// begin with (guards against noise on routes that were already tiny, e.g.
// an empty-state page going from 7 nodes to 5), to be flagged. This is
// deliberately coarse: it exists to catch "the page stopped rendering and
// collapsed to a handful of nodes", not to police normal content edits. A
// RISE never trips this — only `current < previous * FACTOR` is checked, so
// content legitimately growing (more nodes) is never flagged.
const NODE_COUNT_REGRESSION_FACTOR = 0.5;
const NODE_COUNT_REGRESSION_FLOOR = 10;

// A regression is a gate failure like any other (see main()'s exit-code
// check) — the baseline file is NOT overwritten with a regressed count by
// default, precisely so that re-running the tool can't be how a collapse
// quietly becomes the new normal. Adopting a lower count on purpose (a
// deliberate content shrink someone actually looked at) requires this flag,
// so it's a decision, not a side effect of running the tool again.
const ACCEPT_NODE_COUNT_BASELINE =
  process.env.ACCEPT_NODE_COUNT_BASELINE === "1" || process.argv.includes("--accept-baseline");

function loadNodeCountBaseline(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(NODE_COUNT_BASELINE_PATH, "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

function saveNodeCountBaseline(counts: Record<string, number>): void {
  fs.mkdirSync(path.dirname(NODE_COUNT_BASELINE_PATH), { recursive: true });
  fs.writeFileSync(NODE_COUNT_BASELINE_PATH, JSON.stringify(counts, null, 2) + "\n");
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
  await ensureAuthenticated(bootPage, BASE_URL, { timeoutMs: NAV_TIMEOUT_MS, authStatePath: AUTH_STATE_PATH });
  const tripId = TRIP_ID_OVERRIDE || (await resolveTripIdByName(bootPage, BASE_URL, TRIP_NAME));
  if (!tripId) {
    throw new Error(
      `No trip named "${TRIP_NAME}" on ${BASE_URL}/trips. Seed the demo data, or set CONTRAST_TRIP_ID.`,
    );
  }
  const shareToken = SHARE_TOKEN_OVERRIDE || (await readShareToken(bootPage, BASE_URL, tripId));
  if (!shareToken) {
    throw new Error(
      `No share link on ${tripPath(tripId, "/settings")}. Create one there, or set CONTRAST_SHARE_TOKEN.`,
    );
  }
  console.log(
    `Trip ${tripId} (${TRIP_ID_OVERRIDE ? "CONTRAST_TRIP_ID" : `"${TRIP_NAME}" on /trips`}); ` +
      `share token ${SHARE_TOKEN_OVERRIDE ? "from CONTRAST_SHARE_TOKEN" : "read from its settings"}.`,
  );
  const day = await deriveDayRoute(bootPage, tripId);
  await bootCtx.close();
  console.log(
    `Derived day route ${day.path} (${day.candidates} day links found on the trip's calendar; ` +
      "picked the middle one).",
  );

  const routes: RouteSpec[] = [
    ...baseRoutes(tripId, shareToken),
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
  const allUnmeasured: FailureRecord[] = [];
  const allExempted: FailureRecord[] = [];
  const allUnrecognizedExemptions: FailureRecord[] = [];
  const zeroNodeRoutes: string[] = [];

  for (const theme of ["light", "dark"] as const) {
    const contextOpts: BrowserContextOptions = { viewport: VIEWPORT, colorScheme: theme };
    const anonCtx = await browser.newContext(contextOpts);
    const authCtx = await browser.newContext({ ...contextOpts, storageState: AUTH_STATE_PATH });
    const anonPage = await anonCtx.newPage();
    const authPage = await authCtx.newPage();
    await ensureAuthenticated(authPage, BASE_URL, { timeoutMs: NAV_TIMEOUT_MS, authStatePath: AUTH_STATE_PATH });

    for (const spec of routes) {
      const page = spec.auth ? authPage : anonPage;
      const result = await auditRoute(page, spec, theme);
      allResults.push(result);
      allFailures.push(...result.failures);
      allUnmeasured.push(...result.unmeasured);
      allExempted.push(...result.exempted);
      allUnrecognizedExemptions.push(...result.unrecognizedExemptions);
      if (result.nodeCount === 0) zeroNodeRoutes.push(`[${theme}] ${result.route}`);
      const markerNote = result.markerCount !== undefined ? `, markers=${result.markerCount}` : "";
      const unmeasuredNote = result.unmeasured.length > 0 ? `, unmeasured=${result.unmeasured.length}` : "";
      const exemptedNote = result.exempted.length > 0 ? `, exempted=${result.exempted.length}` : "";
      const unrecognizedNote =
        result.unrecognizedExemptions.length > 0 ? `, UNRECOGNISED-EXEMPT=${result.unrecognizedExemptions.length}` : "";
      console.log(
        `[${theme}] ${result.route} — nodes=${result.nodeCount}${markerNote}, failures=${result.failures.length}${unmeasuredNote}${exemptedNote}${unrecognizedNote}`,
      );
    }

    const errorPanelResults = await auditErrorPanelHarness(authPage, theme);
    for (const result of errorPanelResults) {
      allResults.push(result);
      allFailures.push(...result.failures);
      allUnmeasured.push(...result.unmeasured);
      allExempted.push(...result.exempted);
      allUnrecognizedExemptions.push(...result.unrecognizedExemptions);
      if (result.nodeCount === 0) zeroNodeRoutes.push(`[${theme}] ${result.route}`);
      const unmeasuredNote = result.unmeasured.length > 0 ? `, unmeasured=${result.unmeasured.length}` : "";
      const exemptedNote = result.exempted.length > 0 ? `, exempted=${result.exempted.length}` : "";
      const unrecognizedNote =
        result.unrecognizedExemptions.length > 0 ? `, UNRECOGNISED-EXEMPT=${result.unrecognizedExemptions.length}` : "";
      console.log(
        `[${theme}] ${result.route} — nodes=${result.nodeCount}, failures=${result.failures.length}${unmeasuredNote}${exemptedNote}${unrecognizedNote}`,
      );
    }

    await anonCtx.close();
    await authCtx.close();
  }

  await browser.close();

  const totalNodes = allResults.reduce((sum, r) => sum + r.nodeCount, 0);

  // Node-count regression check — a gate, not just a printed note (see the
  // docblock's "ON THE NODE-COUNT BASELINE" note for the rationale). Compares
  // this run's per-route-per-theme node counts against the last committed
  // baseline, flags any route that collapsed by more than half, and feeds
  // that into the same exit-code/RESULT decision as failures/unmeasured/
  // zero-node below — a regression that's only printed and never gates
  // anything is exactly the "reports success silently" failure mode this
  // whole script exists to catch.
  //
  // The baseline file itself only advances for routes that did NOT regress.
  // A regressed route holds its PREVIOUS (higher) value in the saved file
  // unless ACCEPT_NODE_COUNT_BASELINE is set — so simply re-running the tool
  // can never be how a collapse launders itself into the new normal; the
  // same regression re-triggers on every subsequent run until someone
  // either fixes the page or deliberately accepts the new, lower count.
  const previousCounts = loadNodeCountBaseline();
  const nextBaseline: Record<string, number> = { ...previousCounts };
  const nodeCountRegressions: string[] = [];
  for (const r of allResults) {
    // Keyed by path template, not the literal path, so a reseed that
    // changes the trip id / share token / day date keeps its history.
    const key = `${r.theme}:${templatePath(r.route, { trip: tripId, token: shareToken, date: day.date })}`;
    const previous = previousCounts[key];
    const isRegression =
      typeof previous === "number" &&
      previous >= NODE_COUNT_REGRESSION_FLOOR &&
      r.nodeCount < previous * NODE_COUNT_REGRESSION_FACTOR;

    if (isRegression) {
      nodeCountRegressions.push(`${key}: ${previous} -> ${r.nodeCount}`);
      // Hold at the previous value unless explicitly accepted — a rise
      // never lands here (isRegression requires a drop), so growth always
      // takes the normal branch below regardless of this flag.
      nextBaseline[key] = ACCEPT_NODE_COUNT_BASELINE ? r.nodeCount : previous;
    } else {
      nextBaseline[key] = r.nodeCount;
    }
  }
  saveNodeCountBaseline(nextBaseline);

  console.log("\n" + "=".repeat(72));
  console.log(
    `Routes measured: ${new Set(allResults.map((r) => r.route)).size}  ` +
      `Total (route x theme) passes: ${allResults.length}  ` +
      `Total text nodes: ${totalNodes}  ` +
      `Failures: ${allFailures.length}  ` +
      `Unmeasured: ${allUnmeasured.length}  ` +
      `Exempted: ${allExempted.length}  ` +
      `Unrecognised exemptions: ${allUnrecognizedExemptions.length}  ` +
      `Node-count regressions: ${nodeCountRegressions.length}`,
  );

  if (zeroNodeRoutes.length > 0) {
    console.log(
      `\nZERO-NODE ROUTES (probe broke, or the route is broken — see the docblock's trap 2):`,
    );
    for (const r of zeroNodeRoutes) console.log(`  ${r}`);
  }

  if (nodeCountRegressions.length > 0) {
    console.log(
      `\nNODE-COUNT REGRESSIONS (more than halved vs. the committed baseline — this is a gate failure, not just a note):`,
    );
    for (const r of nodeCountRegressions) console.log(`  ${r}`);
    if (!ACCEPT_NODE_COUNT_BASELINE) {
      console.log(
        "  (baseline file left unchanged for these routes; re-running will flag the same regressions again. " +
          "If this drop is real and intended, re-run with ACCEPT_NODE_COUNT_BASELINE=1 to adopt it.)",
      );
    }
  }

  if (allUnmeasured.length > 0) {
    console.log(`\nUNMEASURED (${allUnmeasured.length}) — background could not be determined, NOT counted as a pass:`);
    for (const u of allUnmeasured) printUnmeasured(u);
  }

  if (allExempted.length > 0) {
    console.log(
      `\nEXEMPTED (${allExempted.length}) — fail the contrast minimum, sit on a genuinely inactive UI ` +
        `component (gate 1: WCAG 1.4.3's exemption for inactive user interface components), AND match a ` +
        `specific, examined entry in EXPECTED_EXEMPTIONS (gate 2 — see the docblock's "EXEMPTION" section). ` +
        `Printed in full, every row, and NOT counted toward RESULT below — this bucket exists to make the ` +
        `exemption visible, not to hide it:`,
    );
    for (const e of allExempted) printExempted(e);
  }

  if (allUnrecognizedExemptions.length > 0) {
    console.log(
      `\nUNRECOGNISED EXEMPTIONS (${allUnrecognizedExemptions.length}) — fail the contrast minimum and sit on ` +
        `SOME genuinely inactive UI component (gate 1 passes), but do NOT match anything in ` +
        `EXPECTED_EXEMPTIONS (gate 2 fails). These are NOT exempt — treated exactly like FAILURES below and ` +
        `counted toward a non-zero exit. See the docblock's "EXEMPTION" section for what to do: examine each ` +
        `one, then either fix the contrast or add a considered EXPECTED_EXEMPTIONS entry — never widen the ` +
        `gate-1 selector to make this go away:`,
    );
    for (const u of allUnrecognizedExemptions) printUnrecognizedExemption(u);
  }

  if (allFailures.length > 0) {
    console.log(`\nFAILURES (${allFailures.length}):`);
    for (const f of allFailures) printFailure(f);
  }

  console.log("\n" + "=".repeat(72));

  if (
    allFailures.length > 0 ||
    zeroNodeRoutes.length > 0 ||
    allUnmeasured.length > 0 ||
    nodeCountRegressions.length > 0 ||
    allUnrecognizedExemptions.length > 0
  ) {
    console.log(
      `RESULT: FAIL — ${allFailures.length} contrast failure(s), ${allUnmeasured.length} unmeasured row(s), ` +
        `${zeroNodeRoutes.length} zero-node route(s), ${nodeCountRegressions.length} node-count regression(s), ` +
        `${allUnrecognizedExemptions.length} unrecognised exemption(s). ` +
        `(${allExempted.length} exempted row(s) not counted — see EXEMPTED above.)`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `RESULT: PASS — no contrast failures, no unmeasured rows, no zero-node routes, no node-count regressions, ` +
        `no unrecognised exemptions. (${allExempted.length} exempted row(s) not counted — see EXEMPTED above.)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
