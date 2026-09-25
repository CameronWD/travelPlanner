# Layout Audit — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `npm run audit:layout` — a Playwright harness that screenshots every screen and overlay across 10 widths, runs seven automatic layout checks in-page, and writes a manifest + findings — then run it, have reviewer subagents grade the screenshots, and publish a triage page for Cam.

**Architecture:** A thin entry script (`scripts/layout-audit.ts`) orchestrates small modules under `scripts/layout-audit/`: pure, unit-tested logic (capture matrix, check classifiers, slice maths, trip parsing) is kept separate from the Playwright-touching code (collector string, capture, overlays, trips). The in-page collector is a plain JS **string** (never a function reference — see Global Constraints) that returns raw geometry; Node-side classifiers turn it into findings. Browser helpers shared with `scripts/contrast-audit.ts` move to `scripts/lib/audit-browser.ts`.

**Tech Stack:** TypeScript run by `tsx`; Playwright (global install, NOT a dependency, typed by `scripts/types/playwright-shim.d.ts`); Vitest (jsdom) for unit tests; Next.js 16 dev server as the target.

**Spec:** `docs/specs/2026-09-24-layout-audit.md` (Stage 1). ADR 0062 records the Stage 2 shell decision the reviewers grade against.

## Global Constraints

- Branch `feat/layout-audit` (cut from `beta` at `2e26916`). Never commit to / merge into / rebase onto / push `main` or `beta`. Never push. Never deploy.
- Never run `npm run feedback:resolve` or `npm run feedback:pull`.
- **The harness talks to the app only over HTTP.** It must refuse to run unless `BASE_URL`'s hostname is `localhost` or `127.0.0.1`. No file under `scripts/layout-audit*` or `scripts/lib/audit-browser.ts` may import `scripts/load-env.ts`, `dotenv`, `lib/db`, `@prisma/*`, or anything reading `DATABASE_URL` (`load-env.ts` prefers `.env.production.local` = production).
- The target is `next dev` only (it reads `.env.local` → local Postgres). Never `next start` (it would load `.env.production.local`).
- Output never goes into the repo: default `$LAYOUT_AUDIT_OUT`, else `/tmp/layout-audit/<timestamp>`.
- Playwright is not a project dependency. Resolve it exactly as `contrast-audit.ts` does; extend `scripts/types/playwright-shim.d.ts` for any new API surface rather than using `any`.
- **In-page code is a plain JS string**, passed to `page.evaluate(string)`. Never pass a TS function reference to `page.evaluate` for anything non-trivial: `tsx`/esbuild injects `__name(...)` helpers that don't exist in the page (`ReferenceError: __name is not defined`). One-line arrow functions with no named inner bindings are allowed (contrast-audit does this).
- Leaflet screens wait on `.leaflet-marker-icon` and record the count; never trust `networkidle` alone. Hidden maps are revealed first ("Show day map" button on Home/Day; "Map" tab on Wishlist).
- A zero-capture run, or a capture whose collector returned zero elements, is a failure (exit non-zero) — "a broken probe reports success".
- Widths: `360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560`. Viewport height 800 below 768, 900 at ≥768. Widths ≤430 use `isMobile: true`, `hasTouch: true`, `deviceScaleFactor: 2`; wider use `deviceScaleFactor: 1`.
- Screenshot slices: no image taller than 2000 device px.
- Gates after every task: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- `next dev` re-adds a `nextjs-agent-rules` block to `CLAUDE.md` in the working tree. **Never stage or commit `CLAUDE.md`** — always `git add` explicit paths, never `git add -A`/`.`; leave the working-tree change alone (reverting it just gets re-added).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Stale or missing auth state** (`/tmp/auth.json` absent, expired) — the harness must sign in via "Continue as You" and save a fresh storageState, not crash with ENOENT. Pinned in Task 7.
2. **A phase trip drifted** (e.g. Great Ocean Road ends 2026-09-27 and becomes Past) — the harness must record a coverage gap and print it loudly, never audit the wrong phase silently. Pinned in Task 5 (`verifyPhases`).
3. **Very tall pages** (EU Christmas plan at 360px can exceed 15,000px) — slicing must cover the whole page with no gap or overlap and never emit a zero-height slice. Pinned in Task 4.
4. **Collector finds nothing** (selector drift, page errored into the error boundary) — must count as a failure, not a clean pass. Pinned in Task 3 (collector smoke) and Task 7 (zero-element check).
5. **Pointing at a non-local server** (`BASE_URL=https://…vercel.app`) — refuse before launching a browser. Pinned in Task 2.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/lib/audit-browser.ts` (new) | Shared Playwright plumbing: `resolvePlaywright`, `ensureAuthenticated`, `applyThemeClass`, `revealMapIfNeeded`, `markerCount`, `deriveDayDates` |
| `scripts/contrast-audit.ts` (modify) | Imports the above instead of defining them; behaviour unchanged |
| `scripts/types/playwright-shim.d.ts` (modify) | Extra API surface: screenshots, `setViewportSize`, `emulateMedia`, `storageState`, `fill`, `press`, `keyboard`, `getByRole`, `getByLabel`, locator chaining, context options (`isMobile`, `hasTouch`, `deviceScaleFactor`) |
| `scripts/layout-audit/config.ts` (new) | Widths, viewport-for-width, `assertLocalBaseUrl`, `resolveOutDir`, types `CaptureSpec`, `buildCaptureMatrix` |
| `scripts/layout-audit/checks.ts` (new) | Pure classifiers: raw collector output → `AutoFinding[]` |
| `scripts/layout-audit/collector.ts` (new) | `COLLECTOR_SCRIPT` string (in-page raw geometry) + `RawCollect` type |
| `scripts/layout-audit/capture.ts` (new) | `sliceRanges` (pure) + `captureSlices(page, …)` |
| `scripts/layout-audit/trips.ts` (new) | `parseTripLinks` (pure), `resolveTrips`, `verifyPhases`, `ensureEmptyTrip` |
| `scripts/layout-audit/overlays.ts` (new) | Overlay recipes + `openOverlay(page, recipe)` |
| `scripts/layout-audit.ts` (new) | Entry: CLI, orchestration, `manifest.json`, `findings.auto.json`, exit codes |
| `scripts/layout-audit/crops.ts` (new) | `npm run audit:layout:crops` — turns `findings.json` into cropped JPEG data URIs for the report |
| `app/(app)/trips/[tripId]/page.tsx` (modify) | Adds `<span hidden data-trip-phase={phase} />` — the one permitted app change |
| Tests: `scripts/lib/audit-browser.test.ts`, `scripts/layout-audit/*.test.ts`, `app/(app)/trips/[tripId]/page.test.tsx` | |

---

### Task 1: Extract shared browser helpers from the contrast audit

**Files:**
- Create: `scripts/lib/audit-browser.ts`
- Create: `scripts/lib/audit-browser.test.ts`
- Modify: `scripts/contrast-audit.ts` (remove `isModuleNotFoundError`, `resolvePlaywright` (~lines 338–390), `ensureAuthenticated`, `applyThemeClass`, `revealMapIfNeeded`, `markerCount` (~lines 746–797); rewrite `deriveDayRoute` (~940–967) to call `deriveDayDates`)
- Modify: `scripts/types/playwright-shim.d.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Theme = "light" | "dark";
  export type MapReveal = "wishlist-map-tab" | "show-day-map";
  export function resolvePlaywright(): { chromium: BrowserType };
  export async function ensureAuthenticated(page: Page, baseUrl: string, opts?: { timeoutMs?: number }): Promise<void>;
  export async function applyThemeClass(page: Page, theme: Theme, settleMs?: number): Promise<void>;
  export async function revealMap(page: Page, reveal: MapReveal | undefined, markerWaitMs?: number): Promise<void>;
  export async function markerCount(page: Page): Promise<number>;
  export async function deriveDayDates(page: Page, baseUrl: string, tripId: string): Promise<string[]>; // sorted, unique YYYY-MM-DD from /calendar's a[href*='/day/']
  export function middleDate(dates: string[]): string | null; // pure
  ```

- [ ] **Step 1: Write the failing test** — `scripts/lib/audit-browser.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { middleDate, deriveDayDates, applyThemeClass } from "./audit-browser";

describe("middleDate", () => {
  it("returns null for no dates", () => expect(middleDate([])).toBeNull());
  it("picks the middle of an odd list", () => expect(middleDate(["2026-01-01", "2026-01-02", "2026-01-03"])).toBe("2026-01-02"));
  it("picks the upper-middle of an even list (same as contrast audit)", () =>
    expect(middleDate(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"])).toBe("2026-01-03"));
});

describe("deriveDayDates", () => {
  it("dedupes and sorts the /day/ hrefs found on the trip calendar", async () => {
    const page = {
      goto: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => ["2026-12-09", "2026-12-07", "2026-12-09"]),
    };
    const dates = await deriveDayDates(page as never, "http://localhost:3000", "t1");
    expect(page.goto).toHaveBeenCalledWith("http://localhost:3000/trips/t1/calendar", expect.anything());
    expect(dates).toEqual(["2026-12-07", "2026-12-09"]);
  });
});

describe("applyThemeClass", () => {
  it("adds .dark and waits to settle for dark", async () => {
    const page = { evaluate: vi.fn(async () => undefined), waitForTimeout: vi.fn(async () => undefined) };
    await applyThemeClass(page as never, "dark", 10);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.waitForTimeout).toHaveBeenCalledWith(10);
  });
});
```

Note: `deriveDayDates` must do the regex extraction **inside** `page.evaluate` with a one-line arrow (as contrast-audit does) and the dedupe/sort in Node — the test mocks `evaluate` to return raw dates, so put the match→date mapping in the evaluated arrow and dedupe/sort after.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/lib/audit-browser.test.ts`
Expected: FAIL — cannot find module `./audit-browser`.

- [ ] **Step 3: Implement** — move the bodies verbatim from `contrast-audit.ts` into `scripts/lib/audit-browser.ts`, parameterising `BASE_URL`/timeouts (defaults: nav 30_000, marker 8_000, dark settle 350). Keep every explanatory comment that travels with the moved code (the MODULE_NOT_FOUND note, the Leaflet trap note). `ensureAuthenticated`'s error message keeps naming the storageState path via an optional `opts.authStatePath` string. Then in `contrast-audit.ts` import them and replace:
  - `revealMapIfNeeded(page, spec)` → `if (spec.isMap) await revealMap(page, spec.reveal, MARKER_WAIT_MS)`
  - `deriveDayRoute(page)` keeps its return shape `{ path, date, candidates }` but is built from `deriveDayDates(page, BASE_URL, TRIP_ID)` + `middleDate`, and still throws the same error text when empty.
  - Extend the shim only if `tsc` needs it for this task.

- [ ] **Step 4: Verify**

Run: `npx vitest run scripts/lib/audit-browser.test.ts` → PASS.
Run: `npx tsc --noEmit && npm run lint && npm test && npm run build` → all green.
Run (controller will have a dev server on :3000): `NODE_PATH=/usr/local/lib/node_modules npm run audit:contrast` → ends `RESULT: PASS`. If `/tmp/auth.json` is missing, report that to the controller rather than working around it (Task 7 adds self-bootstrapping for the new harness only).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/audit-browser.ts scripts/lib/audit-browser.test.ts scripts/contrast-audit.ts scripts/types/playwright-shim.d.ts
git commit -m "refactor(audit): share Playwright helpers between audits"
```

---

### Task 2: Capture matrix, viewports and the local-only guard

**Files:**
- Create: `scripts/layout-audit/config.ts`
- Create: `scripts/layout-audit/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const WIDTHS = [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560] as const;
  export type Width = (typeof WIDTHS)[number];
  export type { Theme, MapReveal } from "../lib/audit-browser"; // one definition, shared with Task 1
  export type PhaseName = "sketching" | "planning" | "final-prep" | "travelling" | "past";
  export interface ViewportSpec { width: number; height: number; isMobile: boolean; hasTouch: boolean; deviceScaleFactor: number }
  export function viewportFor(width: number): ViewportSpec;
  export function assertLocalBaseUrl(raw: string): URL; // throws Error mentioning "localhost" otherwise
  export function resolveOutDir(env: Record<string, string | undefined>, now: Date): string;
  export type TripKey = "deep" | "sketching" | "final-prep" | "travelling" | "past" | "empty" | "none";
  export interface RouteDef { label: string; sub: string | null; path?: string; auth: boolean; isMap?: boolean; reveal?: MapReveal; phaseSensitive?: boolean; tripScoped: boolean }
  export interface CaptureSpec {
    id: string;            // `${set}/${label}/${trip}/${width}-${theme}${overlay ? "/" + overlay : ""}${keyboard ? "-kbd" : ""}`
    set: "deep" | "phase" | "empty" | "dark" | "print" | "overlay";
    route: RouteDef;
    trip: TripKey;
    width: number;
    theme: Theme;
    media: "screen" | "print";
    overlay?: string;      // OverlayRecipe.id (Task 6)
    keyboard?: boolean;    // simulated on-screen keyboard (viewport height − 300, focused input)
  }
  export const ROUTES: RouteDef[];
  export interface OverlayMeta { id: string; only?: "phone" | "desktop"; form: boolean } // phone = width < 768
  export function buildCaptureMatrix(input: { overlays: OverlayMeta[]; phaseTripsAvailable: Exclude<TripKey, "deep" | "empty" | "none">[] }): CaptureSpec[];
  ```

`ROUTES` mirrors the contrast audit's list: public (`/` label "root", `/signin`, `/privacy`, `/terms`, `/share/{token}` label "share" — `sub: null`, `tripScoped: false`, `auth: false`; `path` set; the share token is resolved at run time in Task 7 from EU Christmas's settings page, so give it `path: "/share/{token}"` as a template), app (`/trips`, `/trips/new`, `/account`, `/globe` isMap, `/help`, `/whats-new`, `/admin`, `/trips/does-not-exist` label "not-found"), trip-scoped (`""` home isMap reveal show-day-map phaseSensitive, `/plan` phaseSensitive, `/budget`, `/calendar`, `/wishlist` isMap reveal wishlist-map-tab, `/summary` isMap phaseSensitive, `/today` phaseSensitive, `/checklists`, `/files`, `/journal`, `/activity`, `/settings`, `/compare`, `/help`, `/print`, and `/day/{date}` label "day" isMap reveal show-day-map phaseSensitive — `sub: "/day/{date}"`, resolved per trip at run time).

Matrix rules (from the spec's coverage table):
- **deep**: every route × every width × light, trip "deep" for trip-scoped routes, "none" otherwise. `/print` excluded here (it has its own set).
- **phase**: every `phaseSensitive` route × each available phase trip × widths `[375, 768, 1440, 2560]` × light.
- **empty**: every trip-scoped route except `/print` × trip "empty" × `[375, 1440]` × light. (`/day/{date}` included — Task 7 skips it with a recorded "n/a: no dated days" if the empty trip has none.)
- **dark**: every deep route (excluding `/print`) × `[390, 1440]` × dark.
- **print**: `/print` × "deep" × width 794 × light × media "print".
- **overlay**: each overlay × `[360, 390, 1440]` × light, filtered by `only` (`"phone"` keeps 360/390, `"desktop"` keeps 1440); plus, for overlays with `form: true` and `only !== "desktop"`, `[360, 390]` with `keyboard: true`. Overlay captures carry `route` = the recipe's route (Task 7 maps the id back to its recipe), so here use a placeholder RouteDef `{ label: "overlay", sub: null, auth: true, tripScoped: true }`.
- ids are unique.

- [ ] **Step 1: Write the failing test** — `scripts/layout-audit/config.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { WIDTHS, viewportFor, assertLocalBaseUrl, resolveOutDir, buildCaptureMatrix, ROUTES } from "./config";

describe("viewportFor", () => {
  it("phones are mobile, touch, 2x, 800 tall", () =>
    expect(viewportFor(390)).toEqual({ width: 390, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }));
  it("430 is still a phone", () => expect(viewportFor(430).isMobile).toBe(true));
  it("768 and up are desktop, 1x, 900 tall", () =>
    expect(viewportFor(768)).toEqual({ width: 768, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }));
});

describe("assertLocalBaseUrl", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3000/"])("accepts %s", (u) =>
    expect(assertLocalBaseUrl(u).hostname).toMatch(/localhost|127\.0\.0\.1/));
  it.each(["https://teepee.vercel.app", "http://localhost.evil.com", "http://192.168.1.4:3000", "not a url"])("refuses %s", (u) =>
    expect(() => assertLocalBaseUrl(u)).toThrow(/localhost/));
});

describe("resolveOutDir", () => {
  it("prefers LAYOUT_AUDIT_OUT", () => expect(resolveOutDir({ LAYOUT_AUDIT_OUT: "/x/y" }, new Date())).toBe("/x/y"));
  it("defaults to a timestamped /tmp dir", () =>
    expect(resolveOutDir({}, new Date("2026-09-24T10:11:12Z"))).toBe("/tmp/layout-audit/2026-09-24T10-11-12Z"));
  it("refuses a path inside the repo", () => expect(() => resolveOutDir({ LAYOUT_AUDIT_OUT: process.cwd() + "/out" }, new Date())).toThrow(/repo/));
});

describe("buildCaptureMatrix", () => {
  const m = buildCaptureMatrix({
    overlays: [
      { id: "stop-add", form: true },
      { id: "traveller-menu", form: false },
      { id: "mobile-more", only: "phone", form: false },
      { id: "rail-more", only: "desktop", form: false },
      { id: "adjust-dates", only: "desktop", form: true },
    ],
    phaseTripsAvailable: ["sketching", "final-prep", "travelling", "past"],
  });
  const count = (set: string) => m.filter((c) => c.set === set).length;
  const tripRoutes = ROUTES.filter((r) => r.tripScoped);
  const nonPrint = ROUTES.filter((r) => r.sub !== "/print");

  it("deep: every non-print route at all 10 widths, light", () => {
    expect(count("deep")).toBe(nonPrint.length * WIDTHS.length);
    expect(m.filter((c) => c.set === "deep").every((c) => c.theme === "light")).toBe(true);
  });
  it("phase: phase-sensitive routes × 4 trips × 4 widths", () =>
    expect(count("phase")).toBe(ROUTES.filter((r) => r.phaseSensitive).length * 4 * 4));
  it("phase: skips a phase with no trip", () => {
    const m2 = buildCaptureMatrix({ overlays: [], phaseTripsAvailable: ["past"] });
    expect(m2.filter((c) => c.set === "phase").every((c) => c.trip === "past")).toBe(true);
  });
  it("empty: trip routes minus print at 375 and 1440", () =>
    expect(count("empty")).toBe(tripRoutes.filter((r) => r.sub !== "/print").length * 2));
  it("dark: non-print routes at 390 and 1440", () => {
    expect(count("dark")).toBe(nonPrint.length * 2);
    expect(m.filter((c) => c.set === "dark").every((c) => c.theme === "dark")).toBe(true);
  });
  it("print: one A4 print capture", () => {
    const p = m.filter((c) => c.set === "print");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ width: 794, media: "print", trip: "deep" });
  });
  it("overlay: 3 widths for unrestricted ones, 2 for phone-only, 1 for desktop-only, + keyboard for non-desktop forms", () => {
    // stop-add 3 + 2 kbd, traveller-menu 3, mobile-more 2, rail-more 1, adjust-dates 1 (desktop-only form: no kbd)
    expect(count("overlay")).toBe(5 + 3 + 2 + 1 + 1);
    expect(m.filter((c) => c.keyboard).map((c) => `${c.overlay}@${c.width}`).sort()).toEqual(["stop-add@360", "stop-add@390"]);
    expect(m.filter((c) => c.overlay === "mobile-more").map((c) => c.width).sort()).toEqual([360, 390]);
    expect(m.filter((c) => c.overlay === "rail-more").map((c) => c.width)).toEqual([1440]);
  });
  it("ids are unique", () => expect(new Set(m.map((c) => c.id)).size).toBe(m.length));
  it("non-trip routes use trip 'none'", () =>
    expect(m.filter((c) => !c.route.tripScoped && c.set !== "overlay").every((c) => c.trip === "none")).toBe(true));
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run scripts/layout-audit/config.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `config.ts`** to satisfy the tests and the Interfaces block. `assertLocalBaseUrl`: `new URL(raw)` in try/catch; allow exactly hostnames `localhost` and `127.0.0.1`; error text: ``Refusing to audit ${raw}: the layout audit only runs against a local `next dev` server (localhost / 127.0.0.1).``. `resolveOutDir`: timestamp = `now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")`; refuse (throw, message containing "repo") if `path.resolve(dir)` starts with `path.resolve(process.cwd())`.

- [ ] **Step 4: Verify** — the test file PASSES; then the four gates.

- [ ] **Step 5: Commit** — `git add scripts/layout-audit/config.ts scripts/layout-audit/config.test.ts && git commit -m "feat(audit): layout audit capture matrix and local-only guard"`

---

### Task 3: In-page collector and the seven check classifiers

**Files:**
- Create: `scripts/layout-audit/collector.ts`
- Create: `scripts/layout-audit/checks.ts`
- Create: `scripts/layout-audit/checks.test.ts`
- Create: `scripts/layout-audit/collector.test.ts`

**Interfaces:**
- Produces (`collector.ts`):
  ```ts
  export interface Rect { x: number; y: number; w: number; h: number } // document coords (rect + scroll offset)
  export interface RawEl { sel: string; testid?: string; text?: string; rect: Rect }
  export interface RawCollect {
    viewport: { w: number; h: number };
    doc: { scrollW: number; scrollH: number };
    elementCount: number;                                   // all visible elements in body — zero ⇒ broken probe
    widest: RawEl[];                                        // up to 5 elements with the largest right edge beyond viewport.w
    spills: (RawEl & { containerSel: string; containerRect: Rect; inHScroller: boolean; inLeaflet: boolean })[];
    clipped: (RawEl & { scrollW: number; clientW: number; scrollH: number; clientH: number; hasLabel: boolean })[];
    boxes: (RawEl & { kind: "interactive" | "text"; ancestorIdx: number[]; stackOk: boolean; inLeaflet: boolean })[]; // ancestorIdx = indexes into boxes[] of its ancestors
    targets: (RawEl & { ancestorTargetOk: boolean })[];     // only filled when viewport.w <= 430
    chrome: { fixedBottom: Rect[]; lastContent: RawEl | null; safeAreaBottom: number }; // after scrolling to end
    lines: (RawEl & { chars: number; avgGlyph: number })[]; // p, li, dd, blockquote, figcaption with ≥ 2 rendered lines
  }
  export const COLLECTOR_SCRIPT: string; // "(() => { ...; return result; })()"
  ```
- Produces (`checks.ts`):
  ```ts
  export type CheckName = "sideways-scroll" | "spill" | "clipped-text" | "overlap" | "small-target" | "hidden-behind-chrome" | "line-too-long";
  export interface AutoFinding { id: string; check: CheckName; captureId: string; selector: string; text?: string; rect: Rect; detail: string }
  export function classify(raw: RawCollect, captureId: string): AutoFinding[];
  // exported for tests:
  export function checkSideways(raw: RawCollect): Omit<AutoFinding, "id" | "captureId">[];
  export function checkSpill(raw: RawCollect): Omit<AutoFinding, "id" | "captureId">[];
  export function checkClipped(raw: RawCollect): Omit<AutoFinding, "id" | "captureId">[];
  export function checkOverlap(raw: RawCollect): Omit<AutoFinding, "id" | "captureId">[];
  export function checkTargets(raw: RawCollect): Omit<AutoFinding, "id" | "captureId">[];
  export function checkChrome(raw: RawCollect): Omit<AutoFinding, "id" | "captureId">[];
  export function checkLines(raw: RawCollect): Omit<AutoFinding, "id" | "captureId">[];
  ```
  `AutoFinding.id` = `${captureId}#${check}#${selector}` (stable across runs, used by Stage 2 to diff).

**Classifier thresholds** (the spec's §3, made exact):
1. sideways: `doc.scrollW > viewport.w + 1` → one finding, selector = first of `widest` (or `html`), detail `scrollWidth ${scrollW} > ${w}; widest: …`.
2. spill: each `spills` entry with `!inHScroller && !inLeaflet` whose rect extends beyond `containerRect` by **> 2px** on left or right (horizontal spill only — vertical spill inside scroll-hidden containers is the clipped check's job).
3. clipped: `(scrollW > clientW + 1 || scrollH > clientH + 1) && !hasLabel`.
4. overlap: pairs in `boxes` where neither index is in the other's `ancestorIdx`, neither `stackOk` nor `inLeaflet`, and intersection > 4px in **both** axes. Emit once per pair (selector `a ⟂ b`).
5. small-target: only when `viewport.w <= 430`; each `targets` entry with `(rect.w < 44 || rect.h < 44) && !ancestorTargetOk`.
6. hidden-behind-chrome: `lastContent` exists and its rect intersects any `fixedBottom` rect by > 4px vertically, or its bottom is within `safeAreaBottom` of the viewport bottom while fixed chrome exists.
7. line-too-long: `rect.w / avgGlyph > 80` (use `chars` only to skip blocks under 80 characters of text).

**Collector rules** (write as plain JS inside the template string — no TS, no named `function` declarations are required but allowed since the string is not compiled; keep regexes single-escaped as in contrast-audit's PROBE_SCRIPT):
- Visible = `getClientRects().length > 0`, computed `visibility !== "hidden"`, `opacity !== "0"`, and not inside `[hidden]`/`[aria-hidden="true"]` overlays that are closed.
- `sel`: a short path — nearest `[data-testid]` ancestor-or-self as `[data-testid="…"]`, then up to 3 levels of `tag.firstClass:nth-of-type(n)`.
- `text`: first 60 chars of `innerText`, trimmed.
- spills: for each visible element, the nearest ancestor whose computed `overflow-x` is not `visible`, or the viewport; `inHScroller` = some ancestor with `overflow-x` `auto|scroll` and `scrollWidth > clientWidth`; `inLeaflet` = `closest(".leaflet-container")`.
- clipped: elements with own text nodes whose computed `overflow` / `overflow-x` / `overflow-y` is `hidden|clip` or `text-overflow: ellipsis` or `-webkit-line-clamp` set; `hasLabel` = element or ancestor (≤3 levels) has `title`, `aria-label`, or `aria-describedby`.
- boxes: interactive = `a[href], button, input, select, textarea, [role=button], [role=tab], [role=menuitem], [role=link]`; text = `p, h1–h6, li, label, dt, dd` with non-empty text. `stackOk` = element or parent class list matches `/(^|\\s)-space-[xy]-/` or is `[data-slot=badge]` positioned `absolute`.
- targets: interactive set above; `ancestorTargetOk` = an interactive ancestor (≤4 levels) is ≥ 44×44.
- chrome: `window.scrollTo(0, document.documentElement.scrollHeight)`; `fixedBottom` = elements with computed `position: fixed` or `sticky` whose rect bottom ≥ `innerHeight − 1` and height < `innerHeight / 2`; `lastContent` = last visible text/interactive descendant of `main` (or `body` if no `main`); `safeAreaBottom` via a probe div with `padding-bottom: env(safe-area-inset-bottom)`; scroll back to top afterwards.
- lines: `avgGlyph` = `canvas.measureText("abcdefghijklmnopqrstuvwxyz ".repeat(4)).width / 108` with the element's computed `font`; ≥ 2 lines = `rect.h > 1.8 * parseFloat(lineHeight || fontSize*1.4)`.
- Rects in document coordinates: `r.left + scrollX`, `r.top + scrollY`.
- Cap each list at 400 entries (boxes at 1500) to keep the payload sane.

- [ ] **Step 1: Write the failing classifier tests** — `scripts/layout-audit/checks.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { RawCollect } from "./collector";
import { classify, checkSideways, checkSpill, checkClipped, checkOverlap, checkTargets, checkChrome, checkLines } from "./checks";

const R = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
function raw(over: Partial<RawCollect> = {}): RawCollect {
  return {
    viewport: { w: 390, h: 800 }, doc: { scrollW: 390, scrollH: 2000 }, elementCount: 100,
    widest: [], spills: [], clipped: [], boxes: [], targets: [],
    chrome: { fixedBottom: [], lastContent: null, safeAreaBottom: 0 }, lines: [], ...over,
  };
}

describe("checkSideways", () => {
  it("flags a page wider than the viewport", () => {
    const f = checkSideways(raw({ doc: { scrollW: 420, scrollH: 10 }, widest: [{ sel: "table.budget", rect: R(0, 0, 420, 10) }] }));
    expect(f).toHaveLength(1);
    expect(f[0].selector).toBe("table.budget");
  });
  it("ignores a 1px rounding difference", () => expect(checkSideways(raw({ doc: { scrollW: 391, scrollH: 10 } }))).toEqual([]));
});

describe("checkSpill", () => {
  const base = { sel: "div.chip", containerSel: "div.card", containerRect: R(16, 0, 358, 100), inHScroller: false, inLeaflet: false };
  it("flags an element poking out of its clipping container", () =>
    expect(checkSpill(raw({ spills: [{ ...base, rect: R(300, 10, 100, 20) }] }))).toHaveLength(1));
  it("ignores ≤2px", () => expect(checkSpill(raw({ spills: [{ ...base, rect: R(300, 10, 76, 20) }] }))).toEqual([]));
  it("ignores intentional horizontal scrollers and Leaflet", () => {
    expect(checkSpill(raw({ spills: [{ ...base, rect: R(300, 10, 200, 20), inHScroller: true }] }))).toEqual([]);
    expect(checkSpill(raw({ spills: [{ ...base, rect: R(300, 10, 200, 20), inLeaflet: true }] }))).toEqual([]);
  });
});

describe("checkClipped", () => {
  const el = { sel: "span.name", rect: R(0, 0, 100, 20), scrollW: 180, clientW: 100, scrollH: 20, clientH: 20 };
  it("flags truncated text with no way to read it", () => expect(checkClipped(raw({ clipped: [{ ...el, hasLabel: false }] }))).toHaveLength(1));
  it("accepts truncation that has a title/aria-label", () => expect(checkClipped(raw({ clipped: [{ ...el, hasLabel: true }] }))).toEqual([]));
  it("ignores text that fits", () => expect(checkClipped(raw({ clipped: [{ ...el, scrollW: 100, hasLabel: false }] }))).toEqual([]));
});

describe("checkOverlap", () => {
  const box = (sel: string, rect: ReturnType<typeof R>, ancestorIdx: number[] = []) =>
    ({ sel, rect, kind: "interactive" as const, ancestorIdx, stackOk: false, inLeaflet: false });
  it("flags two unrelated boxes overlapping >4px both ways", () =>
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 50, 50)), box("b", R(40, 40, 50, 50))] }))).toHaveLength(1));
  it("ignores a touch/sliver", () =>
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 50, 50)), box("b", R(47, 0, 50, 50))] }))).toEqual([]));
  it("ignores ancestor/descendant", () =>
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 100, 100)), box("b", R(10, 10, 20, 20), [0])] }))).toEqual([]));
  it("ignores intentional stacks", () => {
    const b = { ...box("b", R(40, 40, 50, 50)), stackOk: true };
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 50, 50)), b] }))).toEqual([]);
  });
  it("reports each pair once", () =>
    expect(checkOverlap(raw({ boxes: [box("a", R(0, 0, 50, 50)), box("b", R(40, 40, 50, 50)), box("c", R(200, 0, 5, 5))] }))).toHaveLength(1));
});

describe("checkTargets", () => {
  const t = { sel: "button.icon", rect: R(0, 0, 32, 32), ancestorTargetOk: false };
  it("flags <44px targets on phones", () => expect(checkTargets(raw({ targets: [t] }))).toHaveLength(1));
  it("not on desktop", () => expect(checkTargets(raw({ viewport: { w: 1280, h: 900 }, targets: [t] }))).toEqual([]));
  it("fine when a 44px ancestor is the real target", () => expect(checkTargets(raw({ targets: [{ ...t, ancestorTargetOk: true }] }))).toEqual([]));
});

describe("checkChrome", () => {
  it("flags the last content hidden under the tab bar", () =>
    expect(checkChrome(raw({ chrome: { fixedBottom: [R(0, 1936, 390, 64)], lastContent: { sel: "button.save", rect: R(16, 1940, 200, 44) }, safeAreaBottom: 0 } }))).toHaveLength(1));
  it("passes when content clears the tab bar", () =>
    expect(checkChrome(raw({ chrome: { fixedBottom: [R(0, 1936, 390, 64)], lastContent: { sel: "p", rect: R(16, 1850, 200, 44) }, safeAreaBottom: 0 } }))).toEqual([]));
});

describe("checkLines", () => {
  it("flags a measure over 80 characters", () =>
    expect(checkLines(raw({ lines: [{ sel: "p", rect: R(0, 0, 900, 60), chars: 400, avgGlyph: 8 }] }))).toHaveLength(1));
  it("passes a readable measure", () =>
    expect(checkLines(raw({ lines: [{ sel: "p", rect: R(0, 0, 560, 60), chars: 400, avgGlyph: 8 }] }))).toEqual([]));
  it("skips short text", () =>
    expect(checkLines(raw({ lines: [{ sel: "p", rect: R(0, 0, 900, 60), chars: 40, avgGlyph: 8 }] }))).toEqual([]));
});

describe("classify", () => {
  it("stamps stable ids", () => {
    const f = classify(raw({ doc: { scrollW: 420, scrollH: 10 }, widest: [{ sel: "table", rect: R(0, 0, 420, 10) }] }), "deep/budget/deep/390-light");
    expect(f[0].id).toBe("deep/budget/deep/390-light#sideways-scroll#table");
    expect(f[0].captureId).toBe("deep/budget/deep/390-light");
  });
});
```

- [ ] **Step 2: Write the failing collector smoke test** — `scripts/layout-audit/collector.test.ts` (jsdom has no layout, so this only proves the string parses, runs without `__name`/syntax errors, and returns the right shape):

```ts
import { describe, expect, it } from "vitest";
import { COLLECTOR_SCRIPT } from "./collector";

describe("COLLECTOR_SCRIPT", () => {
  it("is a self-invoking expression string", () => {
    expect(typeof COLLECTOR_SCRIPT).toBe("string");
    expect(COLLECTOR_SCRIPT).not.toMatch(/__name/);
  });
  it("runs in a DOM and returns every RawCollect key", () => {
    document.body.innerHTML = `<main><p>Hello there</p><button>Go</button></main>`;
    HTMLCanvasElement.prototype.getContext = (() => ({ measureText: () => ({ width: 864 }), font: "" })) as never;
    window.scrollTo = () => {};
    const result = (0, eval)(COLLECTOR_SCRIPT);
    for (const k of ["viewport", "doc", "elementCount", "widest", "spills", "clipped", "boxes", "targets", "chrome", "lines"]) {
      expect(result).toHaveProperty(k);
    }
    expect(Array.isArray(result.boxes)).toBe(true);
  });
});
```

(jsdom's `getClientRects()` returns an empty list, so `elementCount` will be 0 here — that's expected in jsdom; the real zero-element guard is in Task 7 against a live page.)

- [ ] **Step 3: Run both to verify they fail** — `npx vitest run scripts/layout-audit/checks.test.ts scripts/layout-audit/collector.test.ts` → FAIL (modules missing).
- [ ] **Step 4: Implement `checks.ts`** (pure; no DOM, no Playwright) per the thresholds above.
- [ ] **Step 5: Implement `collector.ts`** per the collector rules. `COLLECTOR_SCRIPT` must be an expression that evaluates to the result object (`(() => { … return result; })()`), so both `page.evaluate(COLLECTOR_SCRIPT)` and the test's indirect eval work.
- [ ] **Step 6: Verify** — both test files PASS; four gates green.
- [ ] **Step 7: Commit** — `git add scripts/layout-audit/collector.ts scripts/layout-audit/checks.ts scripts/layout-audit/*.test.ts && git commit -m "feat(audit): in-page layout collector and check classifiers"`

---

### Task 4: Full-page screenshot slicing

**Files:**
- Create: `scripts/layout-audit/capture.ts`
- Create: `scripts/layout-audit/capture.test.ts`
- Modify: `scripts/types/playwright-shim.d.ts` (add `screenshot`, `setViewportSize`, `emulateMedia`)

**Interfaces:**
- Consumes: `ViewportSpec` (Task 2).
- Produces:
  ```ts
  export interface Slice { y: number; h: number } // CSS px, document coords
  export function sliceRanges(pageHeightCss: number, deviceScaleFactor: number, maxDevicePx?: number /* 2000 */): Slice[];
  export async function captureSlices(page: Page, opts: { dir: string; baseName: string; width: number; deviceScaleFactor: number }): Promise<string[]>; // absolute file paths
  ```
  `captureSlices` reads `document.documentElement.scrollHeight`, then for each slice calls `page.screenshot({ path, fullPage: true, clip: { x: 0, y: slice.y, width, height: slice.h }, animations: "disabled" })`. File names: `${baseName}.png` when there is one slice, else `${baseName}-part1.png`, `-part2`, …. Creates `dir` recursively.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { sliceRanges, captureSlices } from "./capture";

describe("sliceRanges", () => {
  it("one slice when the page fits", () => expect(sliceRanges(900, 1)).toEqual([{ y: 0, h: 900 }]));
  it("respects device pixels: 2x halves the CSS slice height", () =>
    expect(sliceRanges(2500, 2)).toEqual([{ y: 0, h: 1000 }, { y: 1000, h: 1000 }, { y: 2000, h: 500 }]));
  it("covers a very tall page exactly, no gap, no overlap, no empty slice", () => {
    const s = sliceRanges(15_437, 2);
    expect(s[0].y).toBe(0);
    for (let i = 1; i < s.length; i++) expect(s[i].y).toBe(s[i - 1].y + s[i - 1].h);
    expect(s.at(-1)!.y + s.at(-1)!.h).toBe(15_437);
    expect(s.every((x) => x.h > 0 && x.h * 2 <= 2000)).toBe(true);
  });
  it("rounds fractional heights up so the bottom pixel row is included", () =>
    expect(sliceRanges(900.4, 1)).toEqual([{ y: 0, h: 901 }]));
  it("zero-height page still yields one 1px slice (never an empty list)", () =>
    expect(sliceRanges(0, 1)).toEqual([{ y: 0, h: 1 }]));
});

describe("captureSlices", () => {
  it("names a single slice without a part suffix and clips each slice", async () => {
    const page = { evaluate: vi.fn(async () => 900), screenshot: vi.fn(async () => Buffer.from("")) };
    const files = await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "390-light", width: 390, deviceScaleFactor: 1 });
    expect(files).toEqual(["/tmp/la-test/390-light.png"]);
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ clip: { x: 0, y: 0, width: 390, height: 900 }, fullPage: true }));
  });
  it("suffixes parts when sliced", async () => {
    const page = { evaluate: vi.fn(async () => 2500), screenshot: vi.fn(async () => Buffer.from("")) };
    const files = await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "x", width: 390, deviceScaleFactor: 2 });
    expect(files.map((f) => f.split("/").pop())).toEqual(["x-part1.png", "x-part2.png", "x-part3.png"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run scripts/layout-audit/capture.test.ts` → FAIL.
- [ ] **Step 3: Implement** — `sliceRanges`: `total = Math.max(1, Math.ceil(pageHeightCss))`; `step = Math.floor(maxDevicePx / deviceScaleFactor)`; loop. Extend the shim with `screenshot(options?: { path?: string; fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number }; animations?: "disabled" | "allow"; type?: "png" | "jpeg"; quality?: number }): Promise<Buffer>`, `setViewportSize(size: ViewportSize): Promise<void>`, `emulateMedia(options: { media?: "screen" | "print" | null; colorScheme?: "light" | "dark" | null }): Promise<void>`.
- [ ] **Step 4: Verify** — PASS; four gates.
- [ ] **Step 5: Commit** — `git add scripts/layout-audit/capture.* scripts/types/playwright-shim.d.ts && git commit -m "feat(audit): sliced full-page screenshots"`

---

### Task 5: Trip resolution, phase marker and the empty trip

**Files:**
- Modify: `app/(app)/trips/[tripId]/page.tsx` (inside the returned fragment, first child: `<span hidden data-trip-phase={phase} />`)
- Modify: `app/(app)/trips/[tripId]/page.test.tsx` (new test)
- Create: `scripts/layout-audit/trips.ts`
- Create: `scripts/layout-audit/trips.test.ts`

**Interfaces:**
- Consumes: `TripKey`, `PhaseName` (Task 2); `ensureAuthenticated` (Task 1).
- Produces:
  ```ts
  export const TRIP_NAMES: Record<Exclude<TripKey, "none">, string> = {
    deep: "EU Christmas 2026",
    sketching: "Japan someday",
    "final-prep": "Blue Mountains by rail",
    travelling: "Great Ocean Road, right now",
    past: "Spirit of Tassie",
    empty: "Layout audit — empty",
  };
  export const EXPECTED_PHASE: Partial<Record<TripKey, PhaseName>> = { deep: "planning", sketching: "sketching", "final-prep": "final-prep", travelling: "travelling", past: "past" };
  export interface TripLink { id: string; name: string }
  export function parseTripLinks(anchors: { href: string; text: string }[]): TripLink[]; // href /trips/<id> only (not /trips/new); name = text trimmed; first match wins per id
  export function matchTrips(links: TripLink[]): { found: Partial<Record<Exclude<TripKey, "none">, string>>; missing: Exclude<TripKey, "none">[] }; // name match: link text *starts with* the trip name (cards include phase badges etc.)
  export interface PhaseCheck { key: TripKey; tripId: string; expected: PhaseName; actual: PhaseName | null }
  export function verifyPhases(checks: PhaseCheck[]): { ok: TripKey[]; gaps: { key: TripKey; reason: string }[] };
  export async function resolveTrips(page: Page, baseUrl: string): Promise<{ ids: Partial<Record<Exclude<TripKey, "none">, string>>; gaps: { key: TripKey; reason: string }[] }>;
  export async function ensureEmptyTrip(page: Page, baseUrl: string, existingId?: string): Promise<string>;
  export async function readPhase(page: Page, baseUrl: string, tripId: string): Promise<PhaseName | null>; // reads [data-trip-phase] on Home
  ```

`matchTrips` note: card link text contains the badge text too (e.g. "PLANNING · 73 days"), so match by the trip name appearing in the text — use `text.includes(name)` and prefer the shortest text among matches, so "EU Christmas 2026" does not match "AI TRIP - EU Christmas".

`ensureEmptyTrip`: if `existingId` given, return it. Else `goto /trips/new`, fill `input[name="name"]` with `TRIP_NAMES.empty`, leave dates blank, click the `Create trip` submit button, `waitForURL(/\/trips\/(?!new)[^/]+$/)`, return the id parsed from the URL. It creates data **only** through the local app's own form.

- [ ] **Step 1: Write the failing app test** — append to `app/(app)/trips/[tripId]/page.test.tsx` inside the existing `describe`:

```tsx
  it("exposes the derived Phase as a hidden data-trip-phase marker (for the layout audit)", async () => {
    await renderTripHome();
    const marker = document.querySelector("[data-trip-phase]");
    expect(marker).not.toBeNull();
    expect(marker).toHaveAttribute("hidden");
    // BASE_TRIP is Jan 2026 and "today" is real time, so the phase is past — assert it's a known phase, not a specific one.
    expect(["sketching", "planning", "final-prep", "travelling", "past"]).toContain(marker!.getAttribute("data-trip-phase"));
  });
```

- [ ] **Step 2: Write the failing harness tests** — `scripts/layout-audit/trips.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseTripLinks, matchTrips, verifyPhases, TRIP_NAMES } from "./trips";

describe("parseTripLinks", () => {
  it("keeps /trips/<id> links, drops /trips/new and sub-routes, dedupes by id", () => {
    expect(parseTripLinks([
      { href: "/trips/new", text: "New trip" },
      { href: "/trips/abc", text: "  EU Christmas 2026  PLANNING · 73 days " },
      { href: "/trips/abc", text: "Open" },
      { href: "/trips/abc/plan", text: "Plan" },
      { href: "/help", text: "Help" },
    ])).toEqual([{ id: "abc", name: "EU Christmas 2026  PLANNING · 73 days" }]);
  });
});

describe("matchTrips", () => {
  it("matches by name and prefers the tightest match", () => {
    const { found, missing } = matchTrips([
      { id: "ai", name: "AI TRIP - EU Christmas" },
      { id: "eu", name: "EU Christmas 2026 PLANNING" },
      { id: "jp", name: "Japan someday" },
    ]);
    expect(found.deep).toBe("eu");
    expect(found.sketching).toBe("jp");
    expect(missing).toContain("past");
    expect(missing).toContain("empty");
  });
  it("uses the literal names from the spec", () => expect(TRIP_NAMES.deep).toBe("EU Christmas 2026"));
});

describe("verifyPhases", () => {
  it("passes matching phases and records drift as a gap", () => {
    const r = verifyPhases([
      { key: "travelling", tripId: "t", expected: "travelling", actual: "past" },
      { key: "past", tripId: "p", expected: "past", actual: "past" },
      { key: "sketching", tripId: "s", expected: "sketching", actual: null },
    ]);
    expect(r.ok).toEqual(["past"]);
    expect(r.gaps.map((g) => g.key)).toEqual(["travelling", "sketching"]);
    expect(r.gaps[0].reason).toMatch(/expected travelling.*past/);
    expect(r.gaps[1].reason).toMatch(/no data-trip-phase marker/);
  });
});
```

- [ ] **Step 3: Run to verify both fail** — `npx vitest run "app/(app)/trips/[tripId]/page.test.tsx" scripts/layout-audit/trips.test.ts` → the new tests FAIL.
- [ ] **Step 4: Implement** — the one-line app change (a hidden `<span>` as the fragment's **first** child, so it can't become a `:last-child` and shift sibling spacing), then `trips.ts`. `resolveTrips` = `ensureAuthenticated`, `goto /trips`, evaluate `Array.from(document.querySelectorAll('a[href^="/trips/"]')).map(a => ({ href: a.getAttribute("href") || "", text: a.textContent || "" }))`, `parseTripLinks` → `matchTrips` → for each found phase key `readPhase` → `verifyPhases`; missing (non-empty) keys become gaps with reason `no trip named "<name>" on /trips`. Extend the shim with `fill(value: string)`, `Page.getByRole(role, { name })`, `Page.waitForURL` already exists.
- [ ] **Step 5: Verify** — both PASS; four gates.
- [ ] **Step 6: Commit** — `git add "app/(app)/trips/[tripId]/page.tsx" "app/(app)/trips/[tripId]/page.test.tsx" scripts/layout-audit/trips.* scripts/types/playwright-shim.d.ts && git commit -m "feat(audit): resolve audit trips by name and verify their phase"`

---

### Task 6: Overlay recipes

**Files:**
- Create: `scripts/layout-audit/overlays.ts`
- Create: `scripts/layout-audit/overlays.test.ts`
- Modify: `scripts/types/playwright-shim.d.ts` (`Page.getByRole(role, { name?: string | RegExp; exact?: boolean })`, `Locator.filter({ hasText })`, `Locator.isVisible()`, `Locator.waitFor({ state, timeout })`, `Locator.getAttribute(name)`, `Locator.locator(selector)`, `Locator.focus()`, `Page.keyboard.press(key)`)

**Interfaces:**
- Consumes: `OverlayMeta` (Task 2).
- Produces:
  ```ts
  export type Role = "button" | "menuitem" | "tab" | "link";
  export type Step =
    | { click: { role: Role; name: string; exact?: boolean } } // name: literal, or "/source/flags" for a RegExp; may contain {stop}
    | { press: string }                                      // e.g. "Escape", "Control+k"
    | { deriveStop: true };                                  // sets {stop} from the first [data-testid="drag-handle-stop"]'s aria-label minus "Reorder "
  export interface OverlayRecipe extends OverlayMeta {
    route: string;          // sub-path on the deep trip when tripScoped ("/plan"), else an app path ("/trips", "/globe")
    tripScoped: boolean;
    steps: Step[];
    expect: { role: "dialog" | "menu"; name?: string; hasText?: string }; // name: literal or "/re/"
  }
  export const OVERLAYS: OverlayRecipe[];
  export const SUBMIT_LABELS: readonly string[]; // labels a recipe must never click
  export function parseName(name: string, vars: Record<string, string>): string | RegExp;
  export async function openOverlay(page: Page, recipe: OverlayRecipe): Promise<{ ok: true } | { ok: false; reason: string }>;
  export async function focusFirstInput(page: Page, recipe: OverlayRecipe): Promise<void>; // first visible input/textarea inside the open overlay; no-op if none
  ```

**The harness only ever OPENS overlays. It never types into a field, never ticks a checkbox, and never clicks a submit, confirm or destructive button.** Trigger text equals submit text for several forms ("Add Stop", "Add Item", "Add Transport", "Add Accommodation", "Add Chapter") — so a recipe clicks its trigger exactly once, before any dialog is open, and before every click step `openOverlay` checks that no `[role=dialog][data-state=open]` is present (an open *menu* is fine — that's how menu → menuitem recipes work) and returns `{ ok: false, reason: "a dialog is already open" }` otherwise. `SUBMIT_LABELS` = `["Delete forever", "Delete", "Discard variant", "Promote to real plan", "Promote anyway", "Make rough", "Firm up this leg", "Save", "Save changes", "Save dates", "Save template", "Create", "Apply trim", "Drop", "Confirm", "Send", "Invite", "Schedule", "Add note"]`.

`openOverlay` semantics: substitute vars; for each `click` step, `page.getByRole(role, { name: parseName(...), exact })` → if `count() === 0` return `{ ok: false, reason: \`trigger not found: ${role} "${name}"\` }`, else `.first().click({ timeout: 5000 })`. `deriveStop` with no drag handle → `{ ok: false, reason: "no stop on the page" }`. After the steps, wait up to 5s for `getByRole(expect.role, expect.name ? { name } : {})` (then `.filter({ hasText })` if set) to be visible; timeout → `{ ok: false, reason: "overlay did not open: …" }`. Use `getByRole`, never `getByText`/`getByLabel` — many triggers exist twice in the DOM with one copy `display:none`, and `getByRole` skips hidden ones.

**The recipes** (source: a read of every overlay component, 2026-09-24; "phone" = the 360/390 captures, "desktop" = 1440). Put exactly these in `OVERLAYS`; they are data, so order them as listed:

| id | route | only | form | steps | expect |
|---|---|---|---|---|---|
| `traveller-menu` | `/trips` (app) | | no | click button "Open traveller menu" | menu "Open traveller menu" |
| `command-palette` | `/trips` (app) | | yes | click button "Search (⌘K)" | dialog "Command palette" |
| `feedback` | `/trips` (app) | | yes | click button "Leave feedback about Teepee" | dialog "Feedback" |
| `trip-actions` | `/trips` (app) | | no | click button "Trip actions" | menu |
| `fork-switcher` | `/plan` | | no | click button `/Open plan switcher/` | menu |
| `new-variant` | `/plan` | | yes | click button `/Open plan switcher/`; click menuitem "New variant" | dialog, hasText "Variant name" |
| `notifications` | `/plan` | | no | click button `/^Notifications/` | menu, hasText "Notifications" |
| `mobile-more` | `/plan` | phone | no | click button "More" (exact) | dialog "More navigation" |
| `rail-more` | `/plan` | desktop | no | click button "More trip sections" (exact) | menu |
| `stop-add` | `/plan` | | yes | click button "Add Stop" (exact) | dialog "Add Stop" |
| `stop-edit` | `/plan` | | yes | deriveStop; click button "Edit {stop}" (exact) | dialog "Edit {stop}" |
| `stop-menu` | `/plan` | phone | no | deriveStop; click button "More actions for {stop}" (exact) | menu |
| `adjust-dates` | `/plan` | desktop | yes | click button `/^More actions for /`; click menuitem "Adjust dates" | dialog `/^Adjust dates/` |
| `delete-stop` | `/plan` | desktop | no | deriveStop; click button "Delete {stop}" (exact) | dialog `/^Delete "/` |
| `accommodation-add` | `/plan` | | yes | click button "Add Accommodation" (exact) | dialog `/Add Accommodation|has no dates yet/` |
| `transport-add` | `/plan` | | yes | click button "Add transport" (exact) | dialog "Add Transport" |
| `transport-edit` | `/plan` | | yes | click button "Edit Transport" (exact) | dialog "Edit Transport" |
| `cost-add` | `/plan` | | yes | click button "Add Cost" (exact) | dialog "Add Cost" |
| `item-add` | `/plan` | | yes | click button "Add Thing to Do" (exact) | dialog "Add Item" |
| `chapters-menu` | `/plan` | | no | click button "Chapters" (exact) | menu |
| `chapter-add` | `/plan` | | yes | click button "Chapters" (exact); click menuitem "New Chapter" | dialog "Add Chapter" |
| `make-it-fit` | `/plan` | | yes | click button "Make it fit" | dialog "Make it fit" |
| `notes-popover` | `/plan` | desktop | yes | click button `/^Notes/` | dialog, hasText "Add a note" |
| `wishlist-add` | `/wishlist` | | yes | click button "Add an idea" (exact) | dialog "Add Item" |
| `schedule-item` | `/wishlist` | | no | click button `/^Schedule /` | dialog "Schedule Item" |
| `add-from-globe` | `/wishlist` | | yes | click button "Add from Globe" (exact) | dialog "Add from Globe" |
| `promote-fork` | `/compare` | | no | click button `/^Promote /` | dialog `/^Promote /` |
| `duplicate-trip` | `/settings` | | yes | click button "Duplicate trip" (exact) | dialog "Duplicate this trip?" |
| `delete-trip` | `/settings` | | yes | click button "Delete trip" (exact) | dialog "Delete this trip?" |
| `checklist-edit` | `/checklists` | | yes | click button "Edit Item" (exact) | dialog "Edit Item" |
| `save-template` | `/checklists` | | yes | click tab `/Packing/`; click button "Save as template" (exact) | dialog "Save as template" |
| `other-cost-add` | `/budget` | | yes | click button "Add Cost" (exact) | dialog "Add Other Cost" |
| `marker-add` | `/globe` (app) | | yes | click button "Add marker" (exact) | dialog "Add Marker" |
| `globe-share` | `/globe` (app) | | yes | click button "Share" (exact) | dialog "Share your Globe" |

Notes for the implementer:
- Several recipes may legitimately not open on EU Christmas (`make-it-fit` needs a hard end date the plan overruns; `promote-fork` needs a fork; `schedule-item` needs a wishlist item; `stop-edit`/`stop-menu`/`delete-stop` need a stop with a drag handle — if `drag-handle-stop` only renders on rough stops, fall back in `deriveStop` to the first `h3` inside the itinerary list and say so in a code comment). A recipe that can't open is a **coverage gap in the manifest**, which is the correct outcome — don't special-case the data.
- `delete-stop`, `delete-trip` open confirmations only; the harness never clicks inside them (enforced by `SUBMIT_LABELS`).
- In Task 7's live smoke run, every recipe must either open or produce a gap whose reason is true. If a recipe fails because its trigger name is wrong (not because the data lacks the precondition), fix the recipe.

- [ ] **Step 1: Write the failing test** — `scripts/layout-audit/overlays.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { OVERLAYS, SUBMIT_LABELS, parseName, openOverlay } from "./overlays";

describe("parseName", () => {
  it("returns literals untouched", () => expect(parseName("Add Stop", {})).toBe("Add Stop"));
  it("turns /…/ into a RegExp", () => {
    const r = parseName("/^Edit /", {});
    expect(r).toBeInstanceOf(RegExp);
    expect((r as RegExp).test("Edit Paris")).toBe(true);
  });
  it("substitutes {stop}", () => expect(parseName("Edit {stop}", { stop: "Vienna" })).toBe("Edit Vienna"));
  it("escapes substituted text inside a RegExp", () =>
    expect((parseName("/^Edit {stop}$/", { stop: "St. Anton (AT)" }) as RegExp).test("Edit St. Anton (AT)")).toBe(true));
});

describe("OVERLAYS", () => {
  it("has unique ids", () => expect(new Set(OVERLAYS.map((o) => o.id)).size).toBe(OVERLAYS.length));
  it("covers the 34 recipes from the plan", () => expect(OVERLAYS).toHaveLength(34));
  it("never clicks a submit/confirm/destructive label", () => {
    for (const o of OVERLAYS)
      for (const s of o.steps)
        if ("click" in s) expect(SUBMIT_LABELS, `${o.id} clicks "${s.click.name}"`).not.toContain(s.click.name);
  });
  it("every name parses", () => {
    for (const o of OVERLAYS) {
      for (const s of o.steps) if ("click" in s) expect(() => parseName(s.click.name, { stop: "X" })).not.toThrow();
      if (o.expect.name) expect(() => parseName(o.expect.name!, { stop: "X" })).not.toThrow();
    }
  });
  it("recipes using {stop} derive it first", () => {
    for (const o of OVERLAYS) {
      const idx = o.steps.findIndex((s) => "click" in s && s.click.name.includes("{stop}"));
      if (idx >= 0) expect(o.steps.slice(0, idx).some((s) => "deriveStop" in s), o.id).toBe(true);
    }
  });
});

describe("openOverlay", () => {
  it("reports a missing trigger as a gap instead of throwing", async () => {
    const empty = { count: vi.fn(async () => 0), first: vi.fn() };
    const page = { getByRole: vi.fn(() => empty), locator: vi.fn(() => ({ count: async () => 0 })) };
    const recipe = OVERLAYS.find((o) => o.id === "make-it-fit")!;
    await expect(openOverlay(page as never, recipe)).resolves.toEqual({ ok: false, reason: 'trigger not found: button "Make it fit"' });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run scripts/layout-audit/overlays.test.ts` → FAIL.
- [ ] **Step 3: Implement `overlays.ts`** and the shim additions. `parseName`: substitute `{stop}` (regex-escaped when the name is a `/…/` pattern), then if it matches `^/(.*)/([a-z]*)$` build `new RegExp(src, flags)`.
- [ ] **Step 4: Verify** — PASS; four gates.
- [ ] **Step 5: Commit** — `git add scripts/layout-audit/overlays.* scripts/types/playwright-shim.d.ts && git commit -m "feat(audit): overlay recipes for the layout audit"`

---

### Task 7: The entry script — orchestration, outputs, exit codes

**Files:**
- Create: `scripts/layout-audit.ts`
- Create: `scripts/layout-audit/run.ts` (pure helpers used by the entry: `summarise`, `exitCodeFor`)
- Create: `scripts/layout-audit/run.test.ts`
- Modify: `package.json` (`"audit:layout": "tsx scripts/layout-audit.ts"`, `"audit:layout:crops": "tsx scripts/layout-audit/crops.ts"` — the latter added in Task 8)
- Modify: `scripts/types/playwright-shim.d.ts` (`BrowserContext.storageState({ path })`, context options `isMobile`, `hasTouch`, `deviceScaleFactor`)

**Interfaces:**
- Consumes: everything above.
- Produces (`run.ts`):
  ```ts
  export interface CaptureRecord {
    id: string; set: CaptureSpec["set"]; route: string; routeLabel: string; trip: TripKey; tripId?: string; phase?: PhaseName | null;
    width: number; theme: Theme; media: "screen" | "print"; overlay?: string; keyboard?: boolean;
    files: string[]; markerCount?: number; elementCount: number; findings: number; error?: string; skipped?: string; ms: number;
  }
  export interface Manifest { startedAt: string; finishedAt: string; baseUrl: string; outDir: string; trips: Record<string, string>; gaps: { key: string; reason: string }[]; captures: CaptureRecord[] }
  export function summarise(m: Manifest): string; // multi-line console summary: totals, errors, zero-element captures, gaps, findings by check
  export function exitCodeFor(m: Manifest): 0 | 1; // 1 if captures is empty, any capture has error, or any non-skipped capture has elementCount === 0
  ```
- Output files (the contract Task 8 and the review steps read):
  - `<out>/manifest.json` — `Manifest`
  - `<out>/findings.auto.json` — `AutoFinding[]`
  - `<out>/shots/<set>/<routeLabel>/<trip>/<width>-<theme>[ -kbd].png` (+ `-partN`) — overlay captures go under `shots/overlay/<overlayId>/<width>-<theme>…`

Entry behaviour:
1. `assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3000")` **before** anything else; `resolveOutDir`; `mkdir -p`.
2. `resolvePlaywright()`; launch chromium.
3. Auth bootstrap: `authStatePath = process.env.LAYOUT_AUDIT_AUTH_STATE ?? "/tmp/auth.json"`. If the file doesn't exist, create a fresh context without storageState; else with it. `ensureAuthenticated`; then `context.storageState({ path: authStatePath })` so later contexts reuse it.
4. `resolveTrips`; `ensureEmptyTrip(page, base, ids.empty)`; resolve the share token: goto EU Christmas `/settings`, read the first `a[href*="/share/"]` or text matching `/\/share\/([0-9a-f-]{36})/`; if none, record gap `share: no share link on settings` and skip share captures (`skipped`). Resolve day dates per trip with `deriveDayDates` + `middleDate`; a trip with none → its day captures are `skipped: "n/a: no dated days"` (not an error).
5. `buildCaptureMatrix({ overlays: OVERLAYS.map(({ id, only, form }) => ({ id, only, form })), phaseTripsAvailable })` with `phaseTripsAvailable` = phase keys that passed `verifyPhases`.
6. Group captures by `(width, theme, auth)` and reuse one context per group (`viewportFor(width)`, `colorScheme: theme`, storageState for auth). Per capture, in this order:
   1. `goto` the route (overlay captures: the recipe's route, on the deep trip when `tripScoped`) with `waitUntil: "networkidle"`, 30s.
   2. `applyThemeClass`; `emulateMedia({ media })`; `revealMap` for map routes (skip the marker wait for print).
   3. Overlay captures only: `openOverlay(page, recipe)`. `{ ok: false }` → record `skipped: "coverage gap: <reason>"` **and** push a manifest gap `{ key: "overlay:<id>", reason }`, then move on. Keyboard variant: `setViewportSize({ width, height: height − 300 })` then `focusFirstInput(page, recipe)`.
   4. `waitForTimeout(300)` for motion to settle; `page.evaluate(COLLECTOR_SCRIPT)`; `classify`; `captureSlices`.
   5. Overlay captures: press `Escape`; restore the viewport size.
   Wrap each capture in try/catch → `error` in the record; one failing capture never aborts the run.
7. Log one line per capture: `[set] routeLabel trip width-theme — elements=N findings=M markers=K (ms)`.
8. Write `manifest.json` and `findings.auto.json`; print `summarise`; `process.exitCode = exitCodeFor(manifest)`.
9. File docblock in the style of `contrast-audit.ts`: what it does, prerequisites (`npm run dev`, `NODE_PATH=/usr/local/lib/node_modules`, `ALLOW_DEV_LOGIN=true`), env vars (`BASE_URL`, `LAYOUT_AUDIT_OUT`, `LAYOUT_AUDIT_AUTH_STATE`, `LAYOUT_AUDIT_ONLY` — a substring filter on capture ids for quick re-runs), the **hard safety rule** and why, and the traps (esbuild `__name`, Leaflet, broken-probe).

- [ ] **Step 1: Write the failing test** — `scripts/layout-audit/run.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { exitCodeFor, summarise, type Manifest, type CaptureRecord } from "./run";

const cap = (o: Partial<CaptureRecord> = {}): CaptureRecord => ({
  id: "deep/plan/deep/390-light", set: "deep", route: "/trips/x/plan", routeLabel: "plan", trip: "deep",
  width: 390, theme: "light", media: "screen", files: ["a.png"], elementCount: 200, findings: 0, ms: 10, ...o,
});
const man = (captures: CaptureRecord[], gaps: Manifest["gaps"] = []): Manifest => ({
  startedAt: "", finishedAt: "", baseUrl: "http://localhost:3000", outDir: "/tmp/x", trips: {}, gaps, captures,
});

describe("exitCodeFor", () => {
  it("0 for a clean run", () => expect(exitCodeFor(man([cap()]))).toBe(0));
  it("1 when nothing was captured", () => expect(exitCodeFor(man([]))).toBe(1));
  it("1 when any capture errored", () => expect(exitCodeFor(man([cap(), cap({ id: "b", error: "timeout" })]))).toBe(1));
  it("1 when a capture measured zero elements (broken probe)", () => expect(exitCodeFor(man([cap({ elementCount: 0 })]))).toBe(1));
  it("skipped captures don't fail the run", () => expect(exitCodeFor(man([cap(), cap({ id: "d", skipped: "n/a: no dated days", elementCount: 0, files: [] })]))).toBe(0));
  it("findings alone don't fail Stage 1", () => expect(exitCodeFor(man([cap({ findings: 12 })]))).toBe(0));
});

describe("summarise", () => {
  it("names gaps and errors loudly", () => {
    const s = summarise(man([cap({ id: "b", error: "timeout" })], [{ key: "travelling", reason: "expected travelling, got past" }]));
    expect(s).toMatch(/COVERAGE GAP.*travelling/);
    expect(s).toMatch(/ERROR.*b.*timeout/);
  });
});

// The hard safety rule, pinned: nothing in the harness may import code that can reach a database
// (scripts/load-env.ts prefers .env.production.local — production).
describe("safety: no database-capable imports", () => {
  const files = [
    "scripts/layout-audit.ts",
    "scripts/lib/audit-browser.ts",
    ...readdirSync("scripts/layout-audit")
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `scripts/layout-audit/${f}`),
  ];
  it.each(files)("%s", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).not.toMatch(/(?:from\s+|require\(\s*|import\(\s*)["'][^"']*(?:load-env|lib\/db|@prisma\/|dotenv)[^"']*["']/);
    expect(src).not.toMatch(/process\.env\.DATABASE_URL/);
  });
});
```
(add `import { readFileSync, readdirSync } from "node:fs";` at the top of the test file.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run scripts/layout-audit/run.test.ts` → FAIL.
- [ ] **Step 3: Implement `run.ts`, then `scripts/layout-audit.ts`, the npm script, and the shim additions.**
- [ ] **Step 4: Unit verify** — PASS; four gates.
- [ ] **Step 5: Live smoke run** (dev server on :3000 is started by the controller; if it isn't running, say so and stop):

```bash
NODE_PATH=/usr/local/lib/node_modules LAYOUT_AUDIT_OUT=/tmp/layout-audit/smoke LAYOUT_AUDIT_ONLY="deep/plan/deep/390-light" npm run audit:layout
```
Expected: exit 0, one capture with `elementCount > 0`, a PNG under `/tmp/layout-audit/smoke/shots/deep/plan/deep/`. Then `LAYOUT_AUDIT_ONLY="overlay/"` at the same out dir: every overlay either captured or recorded as a gap. Then `rm /tmp/auth.json; LAYOUT_AUDIT_ONLY="deep/trips/none/1440-light" npm run audit:layout` → still exit 0 (auth bootstrap). Open two PNGs with the Read tool and confirm they show the real page (not a sign-in screen, not an error panel). Report the counts in your summary.
- [ ] **Step 6: Commit** — `git add scripts/layout-audit.ts scripts/layout-audit/run.* scripts/types/playwright-shim.d.ts package.json && git commit -m "feat(audit): npm run audit:layout"`

---

### Task 8: Crops for the triage page

**Files:**
- Create: `scripts/layout-audit/crops.ts`
- Create: `scripts/layout-audit/crops.test.ts`
- Modify: `package.json` (`"audit:layout:crops": "tsx scripts/layout-audit/crops.ts"`)

**Interfaces:**
- Consumes: the reviewed `findings.json` in the out dir (written by the controller's review step — shape below) and the PNGs it references.
- Produces: `<out>/report-data.json` = `ReportFinding[]` (same as `ReviewedFinding` plus `img: string` — a `data:image/jpeg;base64,…` URI) and prints its total byte size.
  ```ts
  export type Grade = "Broken" | "Ugly" | "Polish";
  export interface ReviewedFinding {
    id: string; route: string; screen: string; widths: number[]; themes: ("light" | "dark")[]; grade: Grade;
    title: string; what: string; where?: string; suggestedFix: string;
    screenshot: { file: string; crop: { x: number; y: number; w: number; h: number } }; // crop in image pixels
  }
  export function paddedCrop(crop: { x: number; y: number; w: number; h: number }, img: { w: number; h: number }, pad?: number /* 48 */, maxW?: number /* 1200 */): { x: number; y: number; w: number; h: number; scale: number };
  ```
  `crops.ts` CLI: `npm run audit:layout:crops -- <outDir>`. For each finding: read PNG size from its header (bytes 16–23, big-endian width/height — no image library), compute `paddedCrop`, then render it with Playwright: `page.setContent(<img src="file-as-data-uri" style="position:absolute;left:-x;top:-y">)` at viewport `w×h`, `page.screenshot({ type: "jpeg", quality: 70, clip: {0,0,w,h} })`, downscaled via `deviceScaleFactor: scale` context. Warn (don't fail) if the total exceeds 12 MB, and in that case re-run at quality 55.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { paddedCrop, pngSize } from "./crops";

describe("paddedCrop", () => {
  it("pads and clamps to the image", () =>
    expect(paddedCrop({ x: 10, y: 10, w: 100, h: 50 }, { w: 400, h: 400 })).toEqual({ x: 0, y: 0, w: 158, h: 108, scale: 1 }));
  it("scales wide crops down to maxW", () => {
    const c = paddedCrop({ x: 0, y: 0, w: 2560, h: 400 }, { w: 2560, h: 2000 });
    expect(c.w).toBe(2560);
    expect(c.scale).toBeCloseTo(1200 / 2560);
  });
});

describe("pngSize", () => {
  it("reads width/height from the IHDR header", () => {
    const buf = Buffer.alloc(24);
    buf.writeUInt32BE(390, 16);
    buf.writeUInt32BE(1600, 20);
    expect(pngSize(buf)).toEqual({ w: 390, h: 1600 });
  });
});
```
(add `export function pngSize(buf: Buffer): { w: number; h: number }` to the interface.)

- [ ] **Step 2: Run to verify it fails** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — PASS; four gates. Live check: using the smoke out dir from Task 7, write a one-finding `findings.json` pointing at one of its PNGs, run `NODE_PATH=/usr/local/lib/node_modules npm run audit:layout:crops -- /tmp/layout-audit/smoke`, and confirm `report-data.json` has one `img` beginning `data:image/jpeg;base64,`.
- [ ] **Step 5: Commit** — `git add scripts/layout-audit/crops.* package.json && git commit -m "feat(audit): cropped JPEGs for the layout triage page"`

---

## After the tasks: run, review, report (controller)

These are operational steps the controller runs after the final whole-branch review — not implementer tasks.

- [ ] **R1. Full run.** Dev server up; `NODE_PATH=/usr/local/lib/node_modules LAYOUT_AUDIT_OUT=/tmp/layout-audit/stage1 npm run audit:layout`. Must exit 0. Read the summary; fix harness defects (via a subagent) and re-run until clean.
- [ ] **R2. Visual review batches.** Group captures by `routeLabel` (overlays by overlay id); split any group with > 45 image files. One fresh reviewer subagent per batch (general-purpose, parallel, ≤ 8 in flight). Each gets: the spec's §4 bar verbatim, the Shell rule, the kit pointer (`design_handoff/playground-2/` — tell it which kit files match the screen), the phase-3 gaps log path, its file list, its `findings.auto.json` subset, and the output schema `ReviewedFinding` (Task 8). It writes `/tmp/layout-audit/stage1/review/<batch>.json`. Reviewers must not edit the repo.
- [ ] **R3. Merge.** Concatenate batches; merge findings that share a component across screens into one (list every screen); assign ids `LA-001…` ordered by grade then screen; write `/tmp/layout-audit/stage1/findings.json`.
- [ ] **R4. Crops.** `npm run audit:layout:crops -- /tmp/layout-audit/stage1`.
- [ ] **R5. Triage page.** Load `artifact-design` and `artifact-capabilities`; build the private artifact from `report-data.json` (grouped by screen, grade filter, Fix / Skip / Discuss + note persisted via the page's shared state so the controller can read the choices back).
- [ ] **R6. Text summary.** Write `docs/audits/2026-09-24-layout-audit.md` (counts by grade and screen, one line per finding with its `LA-` id, coverage gaps, how to re-run); commit on the branch.
- [ ] **R7. Stop.** Give Cam the artifact link and the headline counts; wait for triage.
