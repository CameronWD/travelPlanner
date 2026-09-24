/**
 * Trip resolution for the layout audit: finds the audit's fixed cast of
 * trips by name on /trips (rather than hard-coding ids, which would drift
 * the moment seed data is regenerated), verifies each phase-trip's actual
 * Phase against what's expected today via the `[data-trip-phase]` marker
 * added to trips/[tripId]/page.tsx, and creates the one "empty" trip this
 * audit needs (idempotently) through the app's own /trips/new form.
 *
 * Pure matching/verification logic (parseTripLinks, matchTrips,
 * verifyPhases) is unit-tested directly, same split as checks.ts/
 * collector.ts. The three Playwright-driving functions (resolveTrips,
 * ensureEmptyTrip, readPhase) are exercised by the Task 5 live check only —
 * see the task report — since they need a real browser and a real dev
 * server.
 *
 * Nothing here imports lib/db, Prisma, dotenv or scripts/load-env.ts: every
 * fact this module needs about trips comes from the rendered app over HTTP,
 * per the harness's hard "HTTP only" rule.
 */

import type { Page } from "playwright";

import { ensureAuthenticated } from "../lib/audit-browser";
import type { PhaseName, TripKey } from "./config";

// --------------------------------------------------------------------------
// The audit's fixed cast of trips
// --------------------------------------------------------------------------

export const TRIP_NAMES: Record<Exclude<TripKey, "none">, string> = {
  deep: "EU Christmas 2026",
  sketching: "Japan someday",
  "final-prep": "Blue Mountains by rail",
  travelling: "Great Ocean Road, right now",
  past: "Spirit of Tassie",
  empty: "Layout audit — empty",
};

/** What Phase each phase-sensitive trip is expected to be in today
 * (2026-09-24). "empty" has no phase expectation — it's created fresh, not
 * looked up by phase. */
export const EXPECTED_PHASE: Partial<Record<TripKey, PhaseName>> = {
  deep: "planning",
  sketching: "sketching",
  "final-prep": "final-prep",
  travelling: "travelling",
  past: "past",
};

// --------------------------------------------------------------------------
// Parsing /trips into candidate trip links (pure)
// --------------------------------------------------------------------------

export interface TripLink {
  id: string;
  name: string;
}

const TRIP_HREF_RE = /^\/trips\/([^/]+)$/;

/** Keeps only `/trips/<id>` anchors — not `/trips/new`, and not sub-routes
 * like `/trips/<id>/plan` (the regex's `[^/]+$` anchor already excludes
 * those; `/trips/new` is excluded explicitly since it would otherwise match
 * the same shape with id "new"). Dedupes by id, first occurrence wins,
 * since a trip card can link the same id more than once (cover, "Open",
 * etc.) and only the first carries the full name + phase badge text. */
export function parseTripLinks(anchors: { href: string; text: string }[]): TripLink[] {
  const seen = new Set<string>();
  const links: TripLink[] = [];
  for (const { href, text } of anchors) {
    if (href === "/trips/new") continue;
    const match = TRIP_HREF_RE.exec(href);
    if (!match) continue;
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({ id, name: text.trim() });
  }
  return links;
}

// --------------------------------------------------------------------------
// Matching links to the audit's expected trips (pure)
// --------------------------------------------------------------------------

/** Matches each TRIP_NAMES entry against the link whose text *contains* that
 * name (card link text also carries the phase badge, e.g. "PLANNING · 73
 * days"), preferring the shortest matching text when more than one link
 * contains the name — so "EU Christmas 2026" matches "EU Christmas 2026
 * PLANNING · 73 days" rather than a longer, unrelated "AI TRIP - EU
 * Christmas 2026" that happens to also contain the substring. */
export function matchTrips(
  links: TripLink[],
): { found: Partial<Record<Exclude<TripKey, "none">, string>>; missing: Exclude<TripKey, "none">[] } {
  const found: Partial<Record<Exclude<TripKey, "none">, string>> = {};
  const keys = Object.keys(TRIP_NAMES) as Exclude<TripKey, "none">[];
  for (const key of keys) {
    const name = TRIP_NAMES[key];
    const matches = links.filter((l) => l.name.includes(name));
    if (matches.length === 0) continue;
    matches.sort((a, b) => a.name.length - b.name.length);
    found[key] = matches[0].id;
  }
  const missing = keys.filter((key) => found[key] === undefined);
  return { found, missing };
}

// --------------------------------------------------------------------------
// Verifying phases (pure)
// --------------------------------------------------------------------------

export interface PhaseCheck {
  key: TripKey;
  tripId: string;
  expected: PhaseName;
  actual: PhaseName | null;
}

/** Splits phase checks into those that match ("ok") and those that don't
 * ("gaps") — a drifted phase (a trip crossing into its next Phase since
 * this audit's cast was chosen) must be a loud, reported gap, never a
 * silent pass against the wrong phase. */
export function verifyPhases(checks: PhaseCheck[]): { ok: TripKey[]; gaps: { key: TripKey; reason: string }[] } {
  const ok: TripKey[] = [];
  const gaps: { key: TripKey; reason: string }[] = [];
  for (const { key, tripId, expected, actual } of checks) {
    if (actual === null) {
      gaps.push({ key, reason: `trip ${tripId}: no data-trip-phase marker found on Home` });
    } else if (actual !== expected) {
      gaps.push({ key, reason: `trip ${tripId}: expected ${expected}, found ${actual}` });
    } else {
      ok.push(key);
    }
  }
  return { ok, gaps };
}

// --------------------------------------------------------------------------
// Browser-driving (live only — see the Task 5 report for the live check)
// --------------------------------------------------------------------------

/** One-line expression string, not a TS function reference — see the "why a
 * string, not a function" note in contrast-audit.ts / collector.ts: tsx's
 * esbuild wraps named bindings in a `__name(...)` helper that page.evaluate's
 * function-reference form would try (and fail) to call inside the page. */
const TRIP_LINKS_JS = `Array.from(document.querySelectorAll('a[href^="/trips/"]')).map((a) => ({ href: a.getAttribute("href") || "", text: a.textContent || "" }))`;

const READ_PHASE_JS = `(() => { const el = document.querySelector('[data-trip-phase]'); return el ? el.getAttribute('data-trip-phase') : null; })()`;

/** Reads the derived Phase off a trip's Home page via the hidden
 * `[data-trip-phase]` marker (added in trips/[tripId]/page.tsx). Null if the
 * marker isn't present (a broken/errored Home page, not a valid phase). */
export async function readPhase(page: Page, baseUrl: string, tripId: string): Promise<PhaseName | null> {
  await page.goto(`${baseUrl}/trips/${tripId}`, { waitUntil: "networkidle" });
  const phase = await page.evaluate<string | null>(READ_PHASE_JS);
  return (phase as PhaseName | null) ?? null;
}

/**
 * Resolves the audit's fixed cast of trips by name on /trips, then verifies
 * each phase-sensitive trip's actual Phase against EXPECTED_PHASE. A trip
 * that can't be found on /trips, or whose Home page reports a different
 * Phase than expected, becomes a gap — this must never fail silently (see
 * global-constraints.md Review Focus #2: a drifted phase trip, e.g. Great
 * Ocean Road crossing into Past, must be a loud, reported gap).
 */
export async function resolveTrips(
  page: Page,
  baseUrl: string,
): Promise<{ ids: Partial<Record<Exclude<TripKey, "none">, string>>; gaps: { key: TripKey; reason: string }[] }> {
  await ensureAuthenticated(page, baseUrl);
  await page.goto(`${baseUrl}/trips`, { waitUntil: "networkidle" });

  const anchors = await page.evaluate<{ href: string; text: string }[]>(TRIP_LINKS_JS);
  const links = parseTripLinks(anchors);
  const { found, missing } = matchTrips(links);

  const gaps: { key: TripKey; reason: string }[] = missing.map((key) => ({
    key,
    reason: `no trip named "${TRIP_NAMES[key]}" on /trips`,
  }));

  const phaseChecks: PhaseCheck[] = [];
  for (const [key, expected] of Object.entries(EXPECTED_PHASE) as [Exclude<TripKey, "none">, PhaseName][]) {
    const tripId = found[key];
    if (!tripId) continue; // already reported above via `missing`
    const actual = await readPhase(page, baseUrl, tripId);
    phaseChecks.push({ key, tripId, expected, actual });
  }
  gaps.push(...verifyPhases(phaseChecks).gaps);

  return { ids: found, gaps };
}

const NEW_TRIP_URL_RE = /\/trips\/([^/]+)$/;

/**
 * Ensures the audit's "empty" trip exists, creating it through the app's own
 * /trips/new form if it doesn't (never by writing to the database directly —
 * this is the harness's one permitted way to create data). Idempotent: pass
 * the id a prior resolveTrips already found and this returns it unchanged,
 * so repeat runs reuse the same trip instead of creating duplicates.
 */
export async function ensureEmptyTrip(page: Page, baseUrl: string, existingId?: string): Promise<string> {
  if (existingId) return existingId;

  await page.goto(`${baseUrl}/trips/new`, { waitUntil: "networkidle" });
  await page.locator('input[name="name"]').fill(TRIP_NAMES.empty);
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.waitForURL(/\/trips\/(?!new)[^/]+$/);

  const match = NEW_TRIP_URL_RE.exec(page.url());
  if (!match) {
    throw new Error(`ensureEmptyTrip: could not parse a trip id out of the post-create URL: ${page.url()}`);
  }
  return match[1];
}
