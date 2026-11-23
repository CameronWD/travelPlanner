/**
 * Layout audit configuration: device profiles, the local-only guard, the
 * output directory, the route list, and the capture matrix that combines
 * them into the full set of screenshots the audit takes.
 *
 * Pure — no Playwright calls, no network. See docs/specs/2026-09-24-layout-
 * audit.md §2 ("Coverage") for the spec this mirrors, and
 * scripts/contrast-audit.ts's BASE_ROUTES for the route list this extends
 * with trip phases, an "empty" trip, dark mode, print, and overlays.
 */

import * as path from "node:path";

import type { MapReveal, Theme } from "../lib/audit-browser";

// --------------------------------------------------------------------------
// Device profiles
// --------------------------------------------------------------------------

/** All five trip phases a page can be in, including "planning" (the phase of
 * the demo "deep" trip) — used to verify a phase trip's actual phase, not
 * just to pick which trips are phase-sensitive targets. */
export type PhaseName = "sketching" | "planning" | "final-prep" | "travelling" | "past";

export type Engine = "chromium" | "webkit";

/**
 * A named device a capture runs on. Phones run in WebKit with an iPhone user
 * agent at DPR 3; desktops in Chromium. `-browser` phone profiles are a
 * Safari tab with its bars showing (a shorter viewport); `-pwa` profiles are
 * the installed app's full-height viewport. Playwright cannot emulate
 * `display-mode: standalone` or the safe-area insets, so a `-pwa` profile
 * differs from `-browser` ONLY in height: `env(safe-area-inset-*)` is 0 and
 * lib/standalone.ts reads "not installed" in both.
 */
export interface DeviceProfile {
  id: string;
  kind: "phone" | "desktop";
  engine: Engine;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function phone(id: string, width: number, height: number): DeviceProfile {
  return { id, kind: "phone", engine: "webkit", width, height, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA };
}

function desktop(id: string, width: number, height: number, deviceScaleFactor = 1): DeviceProfile {
  return { id, kind: "desktop", engine: "chromium", width, height, deviceScaleFactor, isMobile: false, hasTouch: false };
}

export const PROFILES: DeviceProfile[] = [
  phone("iphone17-browser", 402, 700),
  phone("iphone17-pwa", 402, 874),
  phone("iphone12-browser", 390, 664),
  phone("iphone12-pwa", 390, 844),
  desktop("768", 768, 1024),
  desktop("1024", 1024, 768),
  desktop("1280", 1280, 800),
  desktop("1440", 1440, 900),
  desktop("1920", 1920, 1080),
  // A 14" MacBook Pro's default 1512×982 screen, less the browser's own chrome.
  desktop("mbp14", 1512, 860, 2),
  // A4 at 96dpi, for the print capture only.
  desktop("794", 794, 1123),
];

export function profileFor(id: string): DeviceProfile {
  const profile = PROFILES.find((p) => p.id === id);
  if (!profile) throw new Error(`unknown device profile "${id}"`);
  return profile;
}

// --------------------------------------------------------------------------
// The local-only guard
// --------------------------------------------------------------------------

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function refuseNonLocal(raw: string): never {
  throw new Error(
    `Refusing to audit ${raw}: the layout audit only runs against a local \`next dev\` server (localhost / 127.0.0.1).`,
  );
}

/** Throws unless `raw` parses as a URL whose hostname is exactly "localhost"
 * or "127.0.0.1" — the harness talks to the app only over HTTP, and must
 * never be pointed at a deployed environment (production or otherwise). */
export function assertLocalBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuseNonLocal(raw);
  }
  if (!LOCAL_HOSTNAMES.has(url.hostname)) return refuseNonLocal(raw);
  return url;
}

// --------------------------------------------------------------------------
// Output directory
// --------------------------------------------------------------------------

function defaultOutDir(now: Date): string {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
  return `/tmp/layout-audit/${timestamp}`;
}

/** Throws when `dir` (resolved against `cwd`, the repo checkout — `npm run`
 * always runs from it) is the repo itself or anything under it. A sibling
 * that merely shares the repo's name as a prefix (`/work-audit` next to
 * `/work`) is outside it. Shared by resolveOutDir and crops.ts. */
export function assertOutsideRepo(dir: string, cwd: string): void {
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, dir);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved === root || resolved.startsWith(prefix)) {
    throw new Error(`Refusing to write layout-audit output inside the repo: ${dir}`);
  }
}

/** Output never goes into the repo. Prefers LAYOUT_AUDIT_OUT; otherwise a
 * timestamped directory under /tmp. Refuses (throws) a directory inside the
 * current repo checkout either way. */
export function resolveOutDir(env: Record<string, string | undefined>, now: Date, cwd: string = process.cwd()): string {
  const dir = env.LAYOUT_AUDIT_OUT ?? defaultOutDir(now);
  assertOutsideRepo(dir, cwd);
  return dir;
}

// --------------------------------------------------------------------------
// Routes (mirrors scripts/contrast-audit.ts's BASE_ROUTES, extended with
// phase-sensitivity and trip-scoping for the capture matrix below)
// --------------------------------------------------------------------------

export type TripKey = "deep" | "sketching" | "final-prep" | "travelling" | "past" | "empty" | "none";

export interface RouteDef {
  label: string;
  sub: string | null;
  path?: string;
  auth: boolean;
  isMap?: boolean;
  reveal?: MapReveal;
  phaseSensitive?: boolean;
  tripScoped: boolean;
}

export const ROUTES: RouteDef[] = [
  // --- Public (unauthenticated) ---
  { label: "root", sub: null, path: "/", auth: false, tripScoped: false },
  { label: "privacy", sub: null, path: "/privacy", auth: false, tripScoped: false },
  { label: "terms", sub: null, path: "/terms", auth: false, tripScoped: false },
  // The share token is resolved at run time from the deep trip's
  // settings page; this is a template, not a literal path.
  { label: "share", sub: null, path: "/share/{token}", auth: false, tripScoped: false },

  // --- App (authenticated, not trip-scoped) ---
  { label: "trips", sub: null, path: "/trips", auth: true, isMap: true, tripScoped: false },
  { label: "new-trip", sub: null, path: "/trips/new", auth: true, tripScoped: false },
  { label: "account", sub: null, path: "/account", auth: true, tripScoped: false },
  { label: "globe", sub: null, path: "/globe", auth: true, isMap: true, tripScoped: false },
  { label: "help", sub: null, path: "/help", auth: true, tripScoped: false },
  { label: "whats-new", sub: null, path: "/whats-new", auth: true, tripScoped: false },
  { label: "admin", sub: null, path: "/admin", auth: true, tripScoped: false },
  { label: "not-found", sub: null, path: "/trips/does-not-exist", auth: true, tripScoped: false },

  // --- Trip-scoped ---
  { label: "home", sub: "", auth: true, isMap: true, reveal: "show-day-map", phaseSensitive: true, tripScoped: true },
  { label: "plan", sub: "/plan", auth: true, phaseSensitive: true, tripScoped: true },
  { label: "budget", sub: "/budget", auth: true, tripScoped: true },
  { label: "calendar", sub: "/calendar", auth: true, tripScoped: true },
  { label: "wishlist", sub: "/wishlist", auth: true, isMap: true, reveal: "wishlist-map-tab", tripScoped: true },
  { label: "summary", sub: "/summary", auth: true, isMap: true, phaseSensitive: true, tripScoped: true },
  { label: "today", sub: "/today", auth: true, phaseSensitive: true, tripScoped: true },
  { label: "checklists", sub: "/checklists", auth: true, tripScoped: true },
  { label: "files", sub: "/files", auth: true, tripScoped: true },
  { label: "journal", sub: "/journal", auth: true, tripScoped: true },
  { label: "activity", sub: "/activity", auth: true, tripScoped: true },
  { label: "settings", sub: "/settings", auth: true, tripScoped: true },
  { label: "reviews", sub: "/reviews", auth: true, tripScoped: true },
  { label: "more", sub: "/more", auth: true, tripScoped: true },
  { label: "trip-help", sub: "/help", auth: true, tripScoped: true },
  { label: "print", sub: "/print", auth: true, tripScoped: true },
  // Resolved per trip at run time (LAYOUT_AUDIT_DAY, or a derived in-range
  // date). Its map is a dialog now: the `day-map` overlay.
  {
    label: "day",
    sub: "/day/{date}",
    auth: true,
    phaseSensitive: true,
    tripScoped: true,
  },
  // A day with an accommodation check-in on it (LAYOUT_AUDIT_CHECKIN_DAY);
  // deep trip only.
  { label: "day-checkin", sub: "/day/{checkin}", auth: true, tripScoped: true },
];

// --------------------------------------------------------------------------
// Capture matrix
// --------------------------------------------------------------------------

export type SetName = "deep" | "phase" | "empty" | "dark" | "print" | "overlay" | "loading";

/** Everything a run can do: the matrix's sets plus the two modes that are
 * not per-capture (the resize crawl and the layout-shift measurement). */
export const ALL_SETS = ["deep", "phase", "empty", "dark", "print", "overlay", "loading", "resize", "cls"] as const;
export type RunSet = (typeof ALL_SETS)[number];

/** LAYOUT_AUDIT_SETS: a comma list of RunSet names; unset or blank = all.
 * Throws on an unknown name, so a typo can't silently run nothing. */
export function parseSets(raw: string | undefined): Set<RunSet> {
  const names = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) return new Set(ALL_SETS);
  for (const n of names) {
    if (!(ALL_SETS as readonly string[]).includes(n)) {
      throw new Error(`LAYOUT_AUDIT_SETS: unknown set "${n}" (expected any of ${ALL_SETS.join(", ")})`);
    }
  }
  return new Set(names as RunSet[]);
}

export interface CaptureSpec {
  /** Pages: `${set}/${routeLabel}/${trip}/${profile}-${theme}`; overlays:
   * `overlay/${overlayId}/${profile}-${theme}[-kbd]` — the same shape as each
   * capture's shot path under `shots/` (run.ts shotLocation), so a
   * LAYOUT_AUDIT_ONLY filter reads like the folder it re-shoots. */
  id: string;
  set: SetName;
  route: RouteDef;
  trip: TripKey;
  /** DeviceProfile.id. */
  profile: string;
  /** The profile's viewport width, kept on the spec for readers of the manifest. */
  width: number;
  theme: Theme;
  media: "screen" | "print";
  overlay?: string; // OverlayRecipe.id
  keyboard?: boolean; // simulated on-screen keyboard (viewport height − 300, focused input)
}

export interface OverlayMeta {
  id: string;
  only?: "phone" | "desktop";
  form: boolean;
}

const DESKTOP_PAGE_PROFILES = ["768", "1024", "1280", "1440", "1920", "mbp14"];
const DEEP_PROFILES = ["iphone12-pwa", "iphone17-pwa", "iphone17-browser", ...DESKTOP_PAGE_PROFILES];
const PAIR_PROFILES = ["iphone17-pwa", "mbp14"];
const OVERLAY_PROFILES = ["iphone17-browser", "iphone17-pwa", "iphone12-browser", "mbp14"];
const OVERLAY_KEYBOARD_PROFILES = ["iphone17-browser", "iphone12-browser", "iphone17-pwa"];
const PRINT_PROFILE = "794";

/** The routes whose loading state is captured (set "loading"). */
export const LOADING_ROUTE_LABELS = [
  "trips",
  "home",
  "plan",
  "day",
  "budget",
  "calendar",
  "checklists",
  "wishlist",
  "reviews",
  "files",
  "journal",
];

/** The routes whose cold-load layout shift is measured (cls.json): the
 * loading routes plus the rest of the pages a Traveller lands on. */
export const CLS_ROUTE_LABELS = [...LOADING_ROUTE_LABELS, "globe", "account", "summary", "settings", "activity", "today", "more", "whats-new"];

export const SHIFT_PROFILE_IDS = ["iphone17-pwa", "1440"] as const;

/** Placeholder route for overlay captures: the recipe (overlays.ts) carries
 * the real route; an overlay id leaves this label out (see makeCapture). */
const OVERLAY_ROUTE: RouteDef = { label: "overlay", sub: null, auth: true, tripScoped: true };

function tripForRoute(route: RouteDef, tripIfScoped: TripKey): TripKey {
  return route.tripScoped ? tripIfScoped : "none";
}

function makeCapture(params: {
  set: SetName;
  route: RouteDef;
  trip: TripKey;
  profile: string;
  theme: Theme;
  media?: "screen" | "print";
  overlay?: string;
  keyboard?: boolean;
}): CaptureSpec {
  const { set, route, trip, profile, theme, media = "screen", overlay, keyboard } = params;
  const where = overlay !== undefined ? `overlay/${overlay}` : `${set}/${route.label}/${trip}`;
  const id = `${where}/${profile}-${theme}${keyboard ? "-kbd" : ""}`;
  const spec: CaptureSpec = { id, set, route, trip, profile, width: profileFor(profile).width, theme, media };
  if (overlay !== undefined) spec.overlay = overlay;
  if (keyboard !== undefined) spec.keyboard = keyboard;
  return spec;
}

/**
 * Builds every screenshot the audit takes:
 *
 * - deep: every route × iphone12-pwa, iphone17-pwa, iphone17-browser and the
 *   six desktop profiles × light.
 * - phase: every phase-sensitive route × each available phase trip ×
 *   [iphone17-pwa, mbp14] × light.
 * - empty: every trip-scoped route except /print and day-checkin × trip
 *   "empty" × [iphone17-pwa, mbp14] × light.
 * - dark: the deep set's routes × [iphone17-pwa, mbp14] × dark.
 * - print: /print × trip "deep" × A4 × light × media "print" — on top of
 *   /print's on-screen captures, not instead of them.
 * - overlay: each overlay × [iphone17-browser, iphone17-pwa,
 *   iphone12-browser, mbp14] (filtered by `only`) × light; plus, for form
 *   overlays not desktop-only, the keyboard-up variant at both phone browser
 *   profiles and iphone17-pwa.
 * - loading: LOADING_ROUTE_LABELS × [iphone17-pwa, mbp14] × light (what is
 *   on screen 150ms and 800ms into a load — see loading.ts).
 *
 * `sets` keeps only the named sets (the resize crawl and CLS are not
 * captures and are not built here).
 */
export function buildCaptureMatrix(input: {
  overlays: OverlayMeta[];
  phaseTripsAvailable: Exclude<TripKey, "deep" | "empty" | "none">[];
  sets?: ReadonlySet<string>;
}): CaptureSpec[] {
  const specs: CaptureSpec[] = [];
  const printRoute = ROUTES.find((r) => r.sub === "/print");

  for (const route of ROUTES) {
    for (const profile of DEEP_PROFILES) {
      specs.push(makeCapture({ set: "deep", route, trip: tripForRoute(route, "deep"), profile, theme: "light" }));
    }
  }

  const phaseRoutes = ROUTES.filter((r) => r.phaseSensitive);
  for (const route of phaseRoutes) {
    for (const trip of input.phaseTripsAvailable) {
      for (const profile of PAIR_PROFILES) {
        specs.push(makeCapture({ set: "phase", route, trip, profile, theme: "light" }));
      }
    }
  }

  const emptyRoutes = ROUTES.filter((r) => r.tripScoped && r.sub !== "/print" && r.label !== "day-checkin");
  for (const route of emptyRoutes) {
    for (const profile of PAIR_PROFILES) {
      specs.push(makeCapture({ set: "empty", route, trip: "empty", profile, theme: "light" }));
    }
  }

  for (const route of ROUTES) {
    for (const profile of PAIR_PROFILES) {
      specs.push(makeCapture({ set: "dark", route, trip: tripForRoute(route, "deep"), profile, theme: "dark" }));
    }
  }

  if (printRoute) {
    specs.push(
      makeCapture({ set: "print", route: printRoute, trip: "deep", profile: PRINT_PROFILE, theme: "light", media: "print" }),
    );
  }

  for (const overlay of input.overlays) {
    const fits = (id: string) => overlay.only === undefined || profileFor(id).kind === overlay.only;
    for (const profile of OVERLAY_PROFILES.filter(fits)) {
      specs.push(makeCapture({ set: "overlay", route: OVERLAY_ROUTE, trip: "deep", profile, theme: "light", overlay: overlay.id }));
    }
    if (overlay.form) {
      for (const profile of OVERLAY_KEYBOARD_PROFILES.filter(fits)) {
        specs.push(
          makeCapture({ set: "overlay", route: OVERLAY_ROUTE, trip: "deep", profile, theme: "light", overlay: overlay.id, keyboard: true }),
        );
      }
    }
  }

  for (const label of LOADING_ROUTE_LABELS) {
    const route = ROUTES.find((r) => r.label === label);
    if (!route) continue;
    for (const profile of PAIR_PROFILES) {
      specs.push(makeCapture({ set: "loading", route, trip: tripForRoute(route, "deep"), profile, theme: "light" }));
    }
  }

  return input.sets ? specs.filter((s) => input.sets!.has(s.set)) : specs;
}
