/**
 * Layout audit configuration: widths, viewports, the local-only guard, the
 * output directory, the route list, and the capture matrix that combines
 * them into the full set of screenshots the audit takes.
 *
 * Pure — no Playwright calls, no network. See docs/specs/2026-09-24-layout-
 * audit.md §2 ("Coverage") for the spec this mirrors, and
 * scripts/contrast-audit.ts's BASE_ROUTES for the route list this extends
 * with trip phases, an "empty" trip, dark mode, print, and overlays.
 */

import * as path from "node:path";

export type { Theme, MapReveal } from "../lib/audit-browser";
import type { MapReveal, Theme } from "../lib/audit-browser";

// --------------------------------------------------------------------------
// Widths and viewports
// --------------------------------------------------------------------------

export const WIDTHS = [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560] as const;
export type Width = (typeof WIDTHS)[number];

/** All five trip phases a page can be in, including "planning" (the phase of
 * the "deep" trip, EU Christmas) — used to verify a phase trip's actual
 * phase (Task 5), not just to pick which trips are phase-sensitive targets. */
export type PhaseName = "sketching" | "planning" | "final-prep" | "travelling" | "past";

export interface ViewportSpec {
  width: number;
  height: number;
  isMobile: boolean;
  hasTouch: boolean;
  deviceScaleFactor: number;
}

/** Phones (<=430) are mobile/touch/2x with an 800px-tall viewport; desktop
 * widths (>=768) are 1x with a 900px-tall viewport. */
export function viewportFor(width: number): ViewportSpec {
  const isMobile = width <= 430;
  return {
    width,
    height: width < 768 ? 800 : 900,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 2 : 1,
  };
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

/** Output never goes into the repo. Prefers LAYOUT_AUDIT_OUT; otherwise a
 * timestamped directory under /tmp. Refuses (throws) a directory inside the
 * current repo checkout either way. */
export function resolveOutDir(env: Record<string, string | undefined>, now: Date): string {
  const dir = env.LAYOUT_AUDIT_OUT ?? defaultOutDir(now);
  if (path.resolve(dir).startsWith(path.resolve(process.cwd()))) {
    throw new Error(`Refusing to write layout-audit output inside the repo: ${dir}`);
  }
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
  { label: "signin", sub: null, path: "/signin", auth: false, tripScoped: false },
  { label: "privacy", sub: null, path: "/privacy", auth: false, tripScoped: false },
  { label: "terms", sub: null, path: "/terms", auth: false, tripScoped: false },
  // The share token is resolved at run time in Task 7 from EU Christmas's
  // settings page; this is a template, not a literal path.
  { label: "share", sub: null, path: "/share/{token}", auth: false, tripScoped: false },

  // --- App (authenticated, not trip-scoped) ---
  { label: "trips", sub: null, path: "/trips", auth: true, tripScoped: false },
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
  { label: "compare", sub: "/compare", auth: true, tripScoped: true },
  { label: "trip-help", sub: "/help", auth: true, tripScoped: true },
  { label: "print", sub: "/print", auth: true, tripScoped: true },
  // Resolved per trip at run time (Task 7 derives an in-range date).
  {
    label: "day",
    sub: "/day/{date}",
    auth: true,
    isMap: true,
    reveal: "show-day-map",
    phaseSensitive: true,
    tripScoped: true,
  },
];

// --------------------------------------------------------------------------
// Capture matrix
// --------------------------------------------------------------------------

export interface CaptureSpec {
  id: string; // `${set}/${label}/${trip}/${width}-${theme}${overlay ? "/" + overlay : ""}${keyboard ? "-kbd" : ""}`
  set: "deep" | "phase" | "empty" | "dark" | "print" | "overlay";
  route: RouteDef;
  trip: TripKey;
  width: number;
  theme: Theme;
  media: "screen" | "print";
  overlay?: string; // OverlayRecipe.id (Task 6)
  keyboard?: boolean; // simulated on-screen keyboard (viewport height − 300, focused input)
}

export interface OverlayMeta {
  id: string;
  only?: "phone" | "desktop";
  form: boolean;
} // phone = width < 768

const PHASE_WIDTHS = [375, 768, 1440, 2560];
const EMPTY_WIDTHS = [375, 1440];
const DARK_WIDTHS = [390, 1440];
const OVERLAY_WIDTHS = [360, 390, 1440];
const OVERLAY_KEYBOARD_WIDTHS = [360, 390];
const PRINT_WIDTH = 794;

/** Placeholder route for overlay captures. Task 7 maps `overlay` (the
 * recipe id) back to its real route via the Task 6 recipe table; the
 * capture matrix itself doesn't need that route to build the id or count. */
const OVERLAY_ROUTE: RouteDef = { label: "overlay", sub: null, auth: true, tripScoped: true };

function tripForRoute(route: RouteDef, tripIfScoped: TripKey): TripKey {
  return route.tripScoped ? tripIfScoped : "none";
}

function makeCapture(params: {
  set: CaptureSpec["set"];
  route: RouteDef;
  trip: TripKey;
  width: number;
  theme: Theme;
  media?: "screen" | "print";
  overlay?: string;
  keyboard?: boolean;
}): CaptureSpec {
  const { set, route, trip, width, theme, media = "screen", overlay, keyboard } = params;
  const id = `${set}/${route.label}/${trip}/${width}-${theme}${overlay ? `/${overlay}` : ""}${keyboard ? "-kbd" : ""}`;
  const spec: CaptureSpec = { id, set, route, trip, width, theme, media };
  if (overlay !== undefined) spec.overlay = overlay;
  if (keyboard !== undefined) spec.keyboard = keyboard;
  return spec;
}

/**
 * Builds every screenshot the audit takes, per the spec's coverage table
 * (docs/specs/2026-09-24-layout-audit.md §2):
 *
 * - deep: every non-print route × all 10 widths × light.
 * - phase: every phase-sensitive route × each available phase trip ×
 *   [375, 768, 1440, 2560] × light.
 * - empty: every trip-scoped route except /print × trip "empty" ×
 *   [375, 1440] × light.
 * - dark: every non-print route × [390, 1440] × dark.
 * - print: /print × trip "deep" × 794 × light × media "print".
 * - overlay: each overlay × [360, 390, 1440] (filtered by `only`) × light;
 *   plus, for form overlays not desktop-only, [360, 390] with keyboard:true.
 */
export function buildCaptureMatrix(input: {
  overlays: OverlayMeta[];
  phaseTripsAvailable: Exclude<TripKey, "deep" | "empty" | "none">[];
}): CaptureSpec[] {
  const specs: CaptureSpec[] = [];
  const nonPrintRoutes = ROUTES.filter((r) => r.sub !== "/print");
  const printRoute = ROUTES.find((r) => r.sub === "/print");

  // deep
  for (const route of nonPrintRoutes) {
    for (const width of WIDTHS) {
      specs.push(makeCapture({ set: "deep", route, trip: tripForRoute(route, "deep"), width, theme: "light" }));
    }
  }

  // phase
  const phaseRoutes = ROUTES.filter((r) => r.phaseSensitive);
  for (const route of phaseRoutes) {
    for (const trip of input.phaseTripsAvailable) {
      for (const width of PHASE_WIDTHS) {
        specs.push(makeCapture({ set: "phase", route, trip, width, theme: "light" }));
      }
    }
  }

  // empty
  const emptyRoutes = ROUTES.filter((r) => r.tripScoped && r.sub !== "/print");
  for (const route of emptyRoutes) {
    for (const width of EMPTY_WIDTHS) {
      specs.push(makeCapture({ set: "empty", route, trip: "empty", width, theme: "light" }));
    }
  }

  // dark
  for (const route of nonPrintRoutes) {
    for (const width of DARK_WIDTHS) {
      specs.push(makeCapture({ set: "dark", route, trip: tripForRoute(route, "deep"), width, theme: "dark" }));
    }
  }

  // print
  if (printRoute) {
    specs.push(
      makeCapture({ set: "print", route: printRoute, trip: "deep", width: PRINT_WIDTH, theme: "light", media: "print" }),
    );
  }

  // overlay
  for (const overlay of input.overlays) {
    const widths = OVERLAY_WIDTHS.filter((w) => {
      if (overlay.only === "phone") return w < 768;
      if (overlay.only === "desktop") return w >= 768;
      return true;
    });
    for (const width of widths) {
      specs.push(makeCapture({ set: "overlay", route: OVERLAY_ROUTE, trip: "deep", width, theme: "light", overlay: overlay.id }));
    }
    if (overlay.form && overlay.only !== "desktop") {
      for (const width of OVERLAY_KEYBOARD_WIDTHS) {
        specs.push(
          makeCapture({
            set: "overlay",
            route: OVERLAY_ROUTE,
            trip: "deep",
            width,
            theme: "light",
            overlay: overlay.id,
            keyboard: true,
          }),
        );
      }
    }
  }

  return specs;
}
