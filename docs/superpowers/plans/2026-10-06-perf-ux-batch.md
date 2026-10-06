# Performance and UX batch (2026-10-06) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut TEEPEE's server load and client bundle, remove every silent failure, and ship the small UX fixes the 2026-10-06 sweep ranked Tier 1 and Tier 2, plus the Photon typeahead.

**Architecture:** Four independent clusters on one branch. Server data (warmer throttle, Day loader split, parallel page queries, fetch revalidation, indexes); client performance (one tree per breakpoint, lazy maps/dialogs/motion, React Compiler, cover sizes, service-worker bounds); UX (failure toasts, deep links, cost defaults, Stop edit, dirty guard, nights stepper, Share chooser, optimistic updates); tooling, Photon and docs. Tasks inside a cluster are ordered; clusters do not depend on each other except where an Interfaces block says so.

**Tech Stack:** Next.js 16.3 (App Router, server actions, Turbopack), React 19.2, Prisma 7 + `@prisma/adapter-pg` on Postgres, Tailwind 4, Radix, `motion` 12, Leaflet 1.9, zod 4, vitest 4 + Testing Library, Playwright (audits only).

**Spec:** `docs/specs/2026-10-06-perf-ux-batch.md` and `docs/specs/2026-10-06-typeahead-photon.md`. Findings: `docs/audits/2026-10-06-perf-ux-library-sweep.md`. Glossary: `CONTEXT.md`.

## Global Constraints

- Node `>=20.19`; Next `16.3.4`; React `19.2.4`; Prisma `7.10.0` — do not bump these.
- Read `node_modules/next/dist/docs/01-app/` before writing Next-specific code; this version differs from training data.
- No `loading.tsx` anywhere under `app/(app)/` except `app/(app)/trips/loading.tsx` (ADR 0063; a convention test pins it). No `template.tsx`.
- Trip URLs use the slug (`lib/trip-path.ts`, ADR 0064); `revalidatePath` must target the path the page actually renders at.
- No paid or keyed service; no new data processor without a sentence on `/privacy` and its test (ADR 0059). Photon and Speed Insights are the only two this batch adds.
- Nominatim: at most one request per second, never from a typeahead (ADR 0069). Photon serves the typeahead.
- `use cache` / `cacheLife` are NOT available (`cacheComponents` is off, NAV-01). Use `fetch(..., { next: { revalidate } })` and React `cache()`.
- UI copy follows `CONTEXT.md` terms: Stop, Traveller, Share link (never bare "share"), Settlement "Before you go" / "On the trip", Pinned, Saved for offline, Flag.
- Every task keeps `npx vitest run`, `npx tsc --noEmit` and `npm run lint` green; unit tests mock `@/lib/db` with `vi.mock`; `TZ=UTC` is set by `npm test`.
- Commit each task separately; Conventional Commits; body says why; end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Never run `npm run feedback:pull|resolve|accept`, never deploy, never touch `main`.

## Review Focus

1. **A Trip with no dates, or a Travelling Trip whose today is outside its date range** — the warmer must still warm the section pages and must not throw on the day window (Task owning §A: add a test for `startDate === null` and for `today` after `endDate`).
2. **A Day page whose neighbours fall outside the Trip** (first and last day) — the shared loader must serve `null` neighbours without a second trip read (§B task: test the first-day case).
3. **An action whose `revalidatePath` targets `/trips/<id>` while the page lives at `/trips/<slug>`** — removing `router.refresh()` there would leave stale UI (§J task: test every touched action revalidates `tripPath(slug)`).
4. **A failed delete while offline** — the toast must say the offline message, the dialog must stay open, and nothing must be optimistically removed (§E and §W tasks: test `success:false` with the `OFFLINE_MESSAGE` and test the optimistic revert).
5. **A Photon response with a feature missing coordinates, or a non-FeatureCollection body** — the combobox must get `status:"error"` or skip the feature, never throw (Photon §A task: test both).

---

> **DRAFT — section 2 (Tasks 15–30) is still being written; sections 1, 3 and 4 are final.**

## Section 1 — Server and data (spec §A, §B, §C, §U, §V, §X server-only + S3)

### Task 1: Offline warm-set helpers — day window, freshness, connection  (spec §A)

**Files:**
- Modify: `lib/offline.ts:10-96`
- Test: `lib/offline.test.ts`

**Interfaces:**
- Consumes: `addDays`, `daysBetween` (`lib/dates.ts`); type `TripPhase` (`lib/trip-phase.ts`)
- Produces:
  - `export const TRAVELLING_WARM_RADIUS_DAYS = 7`
  - `export const WARM_FRESH_MS = 6 * 60 * 60 * 1000`
  - `export interface WarmDayWindow { phase?: TripPhase; today?: string }`
  - `export function warmDayDates(startDate: string | null, endDate: string | null, window?: WarmDayWindow): string[]`
  - `export function isWarmFresh(warmedAt: number | null, now: number): boolean`
  - `export interface ConnectionHint { saveData?: boolean; effectiveType?: string }`
  - `export function isConstrainedConnection(connection: ConnectionHint | null | undefined): boolean`
  - `tripOfflinePaths(tripRef, startDate, endDate, attachments = [], coverUrl = null, dayWindow: WarmDayWindow = {})`, which gains a 6th parameter

- [ ] **Step 1: Write the failing test.** Append to `lib/offline.test.ts`, and change line 2's import to also pull `warmDayDates, isWarmFresh, isConstrainedConnection, WARM_FRESH_MS`:
```ts
describe('warmDayDates (spec 2026-10-06 §A)', () => {
  it('returns every day, capped at MAX_WARM_DAYS, outside Travelling', () => {
    expect(warmDayDates('2026-07-01', '2026-07-03', { phase: 'planning', today: '2026-06-01' })).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(warmDayDates('2026-01-01', '2027-02-05')).toHaveLength(MAX_WARM_DAYS);
  });
  it('while Travelling returns only the days within 7 either side of today', () => {
    const days = warmDayDates('2026-07-01', '2026-08-30', { phase: 'travelling', today: '2026-07-20' });
    expect(days[0]).toBe('2026-07-13');
    expect(days[days.length - 1]).toBe('2026-07-27');
    expect(days).toHaveLength(15);
  });
  it('clamps the Travelling window to the Trip', () => {
    expect(warmDayDates('2026-07-01', '2026-07-05', { phase: 'travelling', today: '2026-07-02' })).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']);
  });
  it('is empty without both dates', () => {
    expect(warmDayDates(null, '2026-07-05')).toEqual([]);
  });
});

describe('tripOfflinePaths day window (spec 2026-10-06 §A)', () => {
  it('passes the window through to the day pages', () => {
    const paths = tripOfflinePaths('t1', '2026-07-01', '2026-08-30', [], null, { phase: 'travelling', today: '2026-07-20' });
    const days = paths.filter((p) => p.startsWith('/trips/t1/day/'));
    expect(days).toHaveLength(15);
    expect(days).toContain('/trips/t1/day/2026-07-20');
    expect(days).not.toContain('/trips/t1/day/2026-07-01');
  });
});

describe('isWarmFresh', () => {
  const now = 1_800_000_000_000;
  it('is fresh under 6 hours, stale at 6 hours or with no warm yet', () => {
    expect(isWarmFresh(now - WARM_FRESH_MS + 1000, now)).toBe(true);
    expect(isWarmFresh(now - WARM_FRESH_MS, now)).toBe(false);
    expect(isWarmFresh(null, now)).toBe(false);
  });
  it('treats a timestamp in the future (clock change) as stale', () => {
    expect(isWarmFresh(now + 60_000, now)).toBe(false);
  });
});

describe('isConstrainedConnection', () => {
  it('is true for Save-Data, slow-2g and 2g', () => {
    expect(isConstrainedConnection({ saveData: true })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: 'slow-2g' })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: '2g' })).toBe(true);
  });
  it('is false for 3g/4g or when the browser reports nothing', () => {
    expect(isConstrainedConnection({ effectiveType: '4g', saveData: false })).toBe(false);
    expect(isConstrainedConnection({ effectiveType: '3g' })).toBe(false);
    expect(isConstrainedConnection(undefined)).toBe(false);
  });
});
```
- [ ] **Step 2: Run the test to confirm it fails**
Run: `npx vitest run lib/offline.test.ts -t "warmDayDates"`
Expected: FAIL with "warmDayDates is not a function" (or an import error).
- [ ] **Step 3: Implement.** In `lib/offline.ts`, add `import type { TripPhase } from '@/lib/trip-phase';` after line 11. After `MAX_WARM_DAYS` (line 18), add:
```ts
/** Days either side of today warmed while a Trip is Travelling (spec 2026-10-06 §A). */
export const TRAVELLING_WARM_RADIUS_DAYS = 7;

/**
 * A full warm newer than this counts as fresh: the automatic warm on opening
 * a Trip skips its page paths (spec 2026-10-06 §A). "Save again" ignores it.
 */
export const WARM_FRESH_MS = 6 * 60 * 60 * 1000;

/** Which days to warm: the Trip's Phase and its own today (trip layout). */
export interface WarmDayWindow {
  phase?: TripPhase;
  today?: string;
}

/**
 * The Day pages worth warming. While Travelling: the days within
 * TRAVELLING_WARM_RADIUS_DAYS of today, clamped to the Trip. Otherwise every
 * day. Both capped at MAX_WARM_DAYS. Pure.
 */
export function warmDayDates(
  startDate: string | null,
  endDate: string | null,
  window: WarmDayWindow = {},
): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  let from = startDate;
  let to = endDate;
  if (window.phase === 'travelling' && window.today) {
    const lo = addDays(window.today, -TRAVELLING_WARM_RADIUS_DAYS);
    const hi = addDays(window.today, TRAVELLING_WARM_RADIUS_DAYS);
    if (lo > from) from = lo;
    if (hi < to) to = hi;
    if (to < from) return [];
  }
  const span = Math.min(daysBetween(from, to), MAX_WARM_DAYS - 1);
  const dates: string[] = [];
  for (let i = 0; i <= span; i++) dates.push(addDays(from, i));
  return dates;
}

/** True when the last full warm finished under WARM_FRESH_MS ago. A future timestamp is not fresh. */
export function isWarmFresh(warmedAt: number | null, now: number): boolean {
  if (warmedAt === null) return false;
  const age = now - warmedAt;
  return age >= 0 && age < WARM_FRESH_MS;
}

/** The part of the Network Information API the warmer reads (not in TS's DOM lib). */
export interface ConnectionHint {
  saveData?: boolean;
  effectiveType?: string;
}

/** A connection that asks to save data: Save-Data on, or 2G or slower (spec 2026-10-06 §A). */
export function isConstrainedConnection(connection: ConnectionHint | null | undefined): boolean {
  if (!connection) return false;
  return connection.saveData === true || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}
```
In `tripOfflinePaths`, add a sixth parameter `dayWindow: WarmDayWindow = {},` after `coverUrl` (line 54). Replace lines 73-78, the `if (startDate && endDate …)` loop, with:
```ts
  for (const date of warmDayDates(startDate, endDate, dayWindow)) {
    paths.push(`${base}/day/${date}`);
  }
```
In the JSDoc above `tripOfflinePaths`, replace "+ one page per dated day (capped)" with "+ the Day pages from `warmDayDates` (around today while Travelling, capped)".
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run lib/offline.test.ts`
Expected: PASS. The existing `tripOfflinePaths` cases still pass, because no window means every day.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/offline.ts lib/offline.test.ts
git commit -m "feat(offline): day window, freshness and connection helpers

The warmer re-rendered every Day page on each Trip open, on any connection
(audit P1). These pure helpers let it warm only the days around today while
Travelling, skip pages warmed in the last 6 hours, and skip Save-Data/2G.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Warmer skips fresh page warms and constrained connections  (spec §A)

**Files:**
- Modify: `lib/offline-status.ts:27-28, 80-105`
- Modify: `components/offline-warmer.tsx` (whole effect, lines 1-68)
- Test: `lib/offline-status.test.ts`, `components/offline-warmer.test.tsx`

**Interfaces:**
- Consumes: `isWarmFresh`, `isConstrainedConnection`, `ConnectionHint`, `isAttachmentRoute`, `isCoverRoute` (`lib/offline.ts`, Task 1); `getStatus`, `beginWarm`, `finishWarm`, `cancelWarm`, `subscribe` (`lib/offline-status.ts`)
- Produces: `export function takeWarmRequest(tripId: string): boolean` in `lib/offline-status.ts`

- [ ] **Step 1: Write the failing tests.** Append to `lib/offline-status.test.ts` and add `takeWarmRequest` to its import:
```ts
describe("takeWarmRequest (spec 2026-10-06 §A)", () => {
  it("is true once after each Save again, false otherwise", () => {
    expect(takeWarmRequest("t1")).toBe(false);
    requestWarm("t1");
    expect(takeWarmRequest("t1")).toBe(true);
    expect(takeWarmRequest("t1")).toBe(false);
  });
  it("resetOfflineStatus forgets handled requests too", () => {
    requestWarm("t1");
    resetOfflineStatus();
    expect(takeWarmRequest("t1")).toBe(false);
  });
});
```
In `components/offline-warmer.test.tsx`, add this helper after `stubIdleCallbackSync`:
```ts
function stubConnection(connection: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
}
```
Add `stubConnection(undefined);` to the existing `afterEach`. Replace the test "restarts the warm when re-rendered with a different path list" (lines 160-171) with:
```ts
  it("a new path list inside the 6 hours fetches only the new file, not the pages", async () => {
    stubNavigator({ onLine: true, hasController: true });
    vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
    const { rerender } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    rerender(<OfflineWarmer tripId="t1" paths={["/a", "/api/attachments/new"]} />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/attachments/new", { cache: "no-store" });
  });
```
Append inside the `describe("OfflineWarmer")` block:
```ts
  describe("once per few hours (spec 2026-10-06 §A)", () => {
    const HOUR = 60 * 60 * 1000;

    it("skips the pages when the last full save is under 6 hours old, but still fetches an uncached file", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
      const savedAt = Date.now() - HOUR;
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(savedAt));

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan", "/api/attachments/new"]} />);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/attachments/new", { cache: "no-store" }));
      expect(fetchMock).not.toHaveBeenCalledWith("/trips/t1/plan", expect.anything());
      expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt });
    });

    it("warms the pages again once the last save is 6 hours old", async () => {
      stubNavigator({ onLine: true, hasController: true });
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(Date.now() - 7 * HOUR));
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" }));
    });

    it("Save again warms the pages even inside the 6 hours", async () => {
      stubNavigator({ onLine: true, hasController: true });
      const savedAt = Date.now() - HOUR;
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(savedAt));
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => requestWarm("t1"));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" }));
      await vi.waitFor(() => expect(getStatus("t1").savedAt).toBeGreaterThan(savedAt));
    });

    it("skips the automatic warm on a Save-Data connection", async () => {
      stubNavigator({ onLine: true, hasController: true });
      stubConnection({ saveData: true });
      render(<OfflineWarmer tripId="t1" paths={["/a", "/api/attachments/x"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getStatus("t1").state).toBe("idle");
    });

    it("skips the automatic warm on 2G", async () => {
      stubNavigator({ onLine: true, hasController: true });
      stubConnection({ effectiveType: "2g" });
      render(<OfflineWarmer tripId="t1" paths={["/a"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still runs Save again on a constrained connection (an explicit request)", async () => {
      stubNavigator({ onLine: true, hasController: true });
      stubConnection({ saveData: true });
      render(<OfflineWarmer tripId="t1" paths={["/a"]} />);
      await new Promise((r) => setTimeout(r, 0));
      act(() => requestWarm("t1"));
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/a", { cache: "no-store" }));
    });
  });
```
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run lib/offline-status.test.ts components/offline-warmer.test.tsx`
Expected: FAIL. `takeWarmRequest` is not exported, and "skips the pages…" sees `/trips/t1/plan` fetched.
- [ ] **Step 3: Implement.** In `lib/offline-status.ts`, after line 28 (`const listeners = …`), add:
```ts
/** Per Trip, the requestId the warmer last acted on (see takeWarmRequest). */
const handledRequests = new Map<string, number>();
```
After `requestWarm` (line 84), add:
```ts
/**
 * True exactly once per "Save again": the first warm run after requestWarm()
 * bumped this Trip's requestId. Any other run is the automatic warm on
 * opening the Trip (spec 2026-10-06 §A), which may skip its page paths.
 */
export function takeWarmRequest(tripId: string): boolean {
  const { requestId } = getStatus(tripId);
  const handled = handledRequests.get(tripId) ?? 0;
  handledRequests.set(tripId, requestId);
  return requestId !== handled;
}
```
Change `resetOfflineStatus` (lines 103-105) to:
```ts
export function resetOfflineStatus(): void {
  statuses.clear();
  handledRequests.clear();
}
```
In the file docblock, replace the `savedAt` paragraph (lines 9-11) with:
```ts
 * `savedAt` is kept in localStorage per Trip so the row still says "Saved
 * for offline · 2h ago" after a reload, when the in-memory state is gone but
 * the service worker cache is not. It is the spec's "warmedAt" (spec
 * 2026-10-06 §A): only a run that warmed the pages updates it, so the
 * 6-hour skip in the warmer can't keep extending itself.
```
Replace `components/offline-warmer.tsx` with:
```tsx
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { beginWarm, cancelWarm, finishWarm, getStatus, subscribe, takeWarmRequest } from "@/lib/offline-status";
import { isAttachmentRoute, isConstrainedConnection, isCoverRoute, isWarmFresh, type ConnectionHint } from "@/lib/offline";

/**
 * Background-warms the SW cache with a trip's key pages so they're available
 * offline later — the Trip becomes Saved for offline (CONTEXT.md). Fire-and-
 * forget; never throws; renders nothing. The network-first SW caches each
 * successful GET as an offline fallback.
 *
 * Once per few hours (spec 2026-10-06 §A): the automatic run on opening a
 * Trip skips the page paths when the last full warm is under 6 hours old,
 * and skips everything on a connection that asks to save data. "Save again"
 * in Settings bumps `requestId`, re-runs this effect and always warms the
 * pages. Attachments and the cover keep their own already-cached check.
 *
 * Progress goes to lib/offline-status.ts so the Trip's Settings row can show
 * it.
 */
export function OfflineWarmer({ tripId, paths }: { tripId: string; paths: string[] }) {
  const requestId = useSyncExternalStore(subscribe, () => getStatus(tripId).requestId, () => 0);
  // The server layout hands us a fresh `paths` array on every render (each
  // revalidation — a Plan edit, a Settings toggle — builds a new array even
  // when the paths themselves are unchanged). Depending on `paths` directly
  // would cancel and restart the warm on every one of those re-renders, so
  // depend on this content-based key instead and rebuild the list from it.
  const pathsKey = paths.join("\n");

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    // Only warm when a SW is actually controlling the page (prod); otherwise
    // these fetches do nothing useful — and the status stays "Not saved yet".
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;

    const pathList = pathsKey === "" ? [] : pathsKey.split("\n");
    let cancelled = false;
    const warm = async () => {
      if (cancelled) return;
      const forced = takeWarmRequest(tripId);
      // Never on a connection that asks to save data — unless the Traveller
      // pressed "Save again" (CONTEXT.md "Saved for offline").
      const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection;
      if (!forced && isConstrainedConnection(connection)) return;
      const warmPages = forced || !isWarmFresh(getStatus(tripId).savedAt, Date.now());
      if (warmPages) beginWarm(tripId);
      for (const path of pathList) {
        if (cancelled) return;
        // `path` is origin-relative, but isAttachmentRoute/isCoverRoute parse
        // a full URL, so resolve it against the current origin first.
        const absoluteUrl = new URL(path, window.location.origin).toString();
        // Attachments and the cover are immutable once cached (an Attachment
        // id never changes content; the cover changes its own `?v=`), so they
        // skip on a cache hit. Pages always re-fetch when they are warmed, so
        // "Save again" really refreshes them.
        const isFile = isAttachmentRoute(absoluteUrl) || isCoverRoute(absoluteUrl);
        if (!isFile && !warmPages) continue;
        if (isFile && typeof caches !== "undefined" && (await caches.match(path).catch(() => undefined))) continue;
        try {
          await fetch(path, { cache: "no-store" });
        } catch {
          // ignore — best-effort warming
        }
      }
      // Only a run that warmed the pages counts as a save (its timestamp is
      // what the 6-hour skip reads).
      if (!cancelled && warmPages) finishWarm(tripId);
    };
    // Defer to idle so it never competes with the page the user is viewing.
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(() => void warm());
    else setTimeout(() => void warm(), 1500);

    return () => {
      cancelled = true;
      cancelWarm(tripId);
    };
  }, [tripId, pathsKey, requestId]);

  return null;
}
```
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run lib/offline-status.test.ts components/offline-warmer.test.tsx components/trip/settings`
Expected: PASS.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/offline-status.ts lib/offline-status.test.ts components/offline-warmer.tsx components/offline-warmer.test.tsx
git commit -m "perf(offline): warm a Trip's pages once per few hours

Every Trip open re-rendered 10-70 full pages with no-store, on mobile data
too (audit P1). The automatic run now skips pages warmed in the last 6
hours and skips Save-Data/2G entirely; Save again still forces a full warm.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Trip layout — one wave, slug on the shell select, capped warm list, day window  (spec §A, §C)

**Files:**
- Modify: `lib/trip-shell-reads.ts:27-42`
- Modify: `app/(app)/trips/[tripId]/layout.tsx:6, 52-77, 107`
- Test: `app/(app)/trips/[tripId]/layout.test.tsx`, `lib/trip-shell-reads.test.ts:27`

**Interfaces:**
- Consumes: `tripOfflinePaths(…, dayWindow)` (Task 1); `readTripShell`, `readUnreadActivityCount`, `readRecentActivity`, `readForks`
- Produces: `TRIP_SHELL_SELECT.slug: true`, so `TripShell` gains `slug: string | null`

- [ ] **Step 1: Write the failing tests.** In `lib/trip-shell-reads.test.ts` line 27, add `"slug"` to the key list. In `app/(app)/trips/[tripId]/layout.test.tsx`, add `import { addDays } from "@/lib/dates";` and `import { todayISOInZone } from "@/lib/tz";` after line 2, then append:
```tsx
describe("TripLayout reads (spec 2026-10-06 §C)", () => {
  it("reads the Trip row once — the slug rides on the shell select", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, slug: "test-trip" });
    await renderLayout();
    expect(mockDb.trip.findUnique).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rail-trip")).toHaveAttribute("data-slug", "test-trip");
  });

  it("lists at most 200 Attachments for the warm, newest first, selecting only what the warm needs", async () => {
    await renderLayout();
    expect(mockDb.attachment.findMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1" },
      select: { url: true, size: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });
});

describe("TripLayout offline day window (spec 2026-10-06 §A)", () => {
  it("while Travelling warms only the Day pages within a week of today", async () => {
    // No Stops → the Trip's today is UTC's (lib/trip-today.ts).
    const today = todayISOInZone("UTC");
    const start = addDays(today, -20);
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: start, endDate: addDays(today, 20) });
    await renderLayout();
    const days = screen.getByTestId("offline-warmer").getAttribute("data-paths")!.split(" ").filter((p) => p.includes("/day/"));
    expect(days).toHaveLength(15);
    expect(days).toContain(`/trips/trip-1/day/${today}`);
    expect(days).not.toContain(`/trips/trip-1/day/${start}`);
  });
});
```
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run "app/(app)/trips/[tripId]/layout.test.tsx" lib/trip-shell-reads.test.ts`
Expected: FAIL. `findUnique` is called 2 times (shell + `tripSlugFor`), the attachment args lack `orderBy`/`take`, there are 41 day paths, and the `slug` key is missing.
- [ ] **Step 3: Implement.** In `lib/trip-shell-reads.ts`, add `slug: true,` after `name: true,` (line 29), and update the comment above `TRIP_SHELL_SELECT` to: `/** The trip layout's selection (now carrying the slug, spec 2026-10-06 §C), shared so the Day index and Day page can read the same row for free. */`.

In `app/(app)/trips/[tripId]/layout.tsx`, delete line 6 (`import { tripSlugFor } …`). Replace lines 52-77 (from `const { tripId } = await params;` through the end of the `Promise.all`) with:
```tsx
  const { tripId } = await params;

  // Guard: 404 for non-members
  await requireTripAccess(tripId);

  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.

  // One wave after the gate (spec 2026-10-06 §C). The shell row carries the
  // slug, so there is no separate slug read. `Promise.resolve` turns the
  // Prisma query into one settled promise the Fork list can chain on.
  const shellPromise = Promise.resolve(readTripShell(tripId));
  const [trip, unreadCount, recent, forks, warmAttachments] = await Promise.all([
    shellPromise,
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    // Plan variants off (spec B3): no switcher, so no need to list Forks.
    shellPromise.then((shell) => (shell?.forksEnabled ? readForks(tripId) : [])),
    // The offline warm list (ADR 0043): newest first and capped, so a Trip
    // with hundreds of files doesn't ship them all to every page render.
    // tripOfflinePaths still applies the 200 MB budget on top.
    db.attachment.findMany({
      where: { tripId },
      select: { url: true, size: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  if (!trip) {
    notFound();
  }
  const slug = trip.slug ?? tripId;
```
Change line 107 (the `offlinePaths` assignment) to:
```tsx
  // Travelling → only the days around today (spec 2026-10-06 §A).
  const offlinePaths = tripOfflinePaths(slug, trip.startDate, trip.endDate, warmAttachments, coverUrl, { phase: tripPhase, today });
```
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run "app/(app)/trips/[tripId]/layout.test.tsx" "app/(app)/trips/[tripId]/page.test.tsx" lib/trip-shell-reads.test.ts`
Expected: PASS.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/trip-shell-reads.ts lib/trip-shell-reads.test.ts "app/(app)/trips/[tripId]/layout.tsx" "app/(app)/trips/[tripId]/layout.test.tsx"
git commit -m "perf(trip-layout): one read wave, slug on the shell row

The layout read the slug, then the shell, then the rest (audit P3). The
slug now rides on TRIP_SHELL_SELECT, every read runs in one wave after the
gate, the warm list is capped at the 200 newest files, and a Travelling
Trip warms only the days around today.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Day page reads the Trip once — `loadDayTripData` + `projectDay`  (spec §B)

**Files:**
- Modify: `lib/day-view-loader.ts:13-15, 119-690`
- Create test: `lib/day-view-loader.cache.test.ts`
- Modify test: `lib/day-view-loader.test.ts:125-128, 162-166, 275-287`

**Interfaces:**
- Consumes: `titlesByDate` (`lib/day-titles.ts`); `THINGS_TO_DO_WHERE`, `WISHLIST_IDEA_WHERE`, `REAL_PLAN`; `tripDays`
- Produces:
  - `export const loadDayTripData: (tripId: string) => Promise<DayTripData | "invalid" | "dateless">`, wrapped in `cache()`
  - `export type DayTripData`
  - `export function projectDay(data: DayTripData, day: { date: string; viewerId: string } & DayDateData): DayViewData | "out-of-range"`
  - `getDay(tripId, dateParam, viewerId)`, signature unchanged

- [ ] **Step 1: Write the failing test.** Create `lib/day-view-loader.cache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// React's cache() only memoises inside a server render; under vitest it is a
// no-op (see the long note in lib/guards.test.ts). This stub gives it
// per-argument memoisation so the test pins OUR wiring: the Day page's three
// getDay calls (day before, day shown, day after) share one loadDayTripData.
const { cacheStore, db } = vi.hoisted(() => ({
  cacheStore: new Map<string, unknown>(),
  db: {
    trip: { findUnique: vi.fn() },
    stop: { findMany: vi.fn() },
    item: { findMany: vi.fn(), groupBy: vi.fn() },
    transport: { findMany: vi.fn() },
    accommodation: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
    attachment: { findMany: vi.fn() },
    cost: { findMany: vi.fn() },
    dayTitle: { findMany: vi.fn() },
    chapter: { findMany: vi.fn() },
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache:
      <Args extends unknown[], R>(fn: (...args: Args) => R) =>
      (...args: Args): R => {
        const key = JSON.stringify(args);
        if (!cacheStore.has(key)) cacheStore.set(key, fn(...args));
        return cacheStore.get(key) as R;
      },
  };
});
vi.mock("@/lib/db", () => ({ db }));

import { getDay } from "@/lib/day-view-loader";

beforeEach(() => {
  vi.clearAllMocks();
  cacheStore.clear();
  db.trip.findUnique.mockResolvedValue({
    name: "Paris week", startDate: "2026-12-04", endDate: "2026-12-10",
    homeCurrency: "AUD", homeName: "Brisbane", chaptersEnabled: true, roundTrip: true,
  });
  db.stop.findMany.mockResolvedValue([
    { id: "s-paris", name: "Paris", country: "France", countryCode: "FR", timezone: "Europe/Paris", arriveDate: "2026-12-04", departDate: "2026-12-10", sortOrder: 0, lat: 48.8566, lng: 2.3522 },
  ]);
  db.item.findMany.mockResolvedValue([]);
  db.item.groupBy.mockResolvedValue([]);
  db.transport.findMany.mockResolvedValue([]);
  db.accommodation.findMany.mockResolvedValue([]);
  db.journalEntry.findMany.mockResolvedValue([]);
  db.attachment.findMany.mockResolvedValue([]);
  db.cost.findMany.mockResolvedValue([]);
  db.dayTitle.findMany.mockResolvedValue([]);
  db.chapter.findMany.mockResolvedValue([]);
});

describe("the Day page's three getDay calls (spec 2026-10-06 §B)", () => {
  it("issue each trip-wide query once; only the Journal reads are per day", async () => {
    const days = await Promise.all(
      ["2026-12-05", "2026-12-06", "2026-12-07"].map((d) => getDay("trip-1", d, "u-1")),
    );
    expect(days.map((d) => (typeof d === "string" ? d : d.date))).toEqual(["2026-12-05", "2026-12-06", "2026-12-07"]);

    expect(db.trip.findUnique).toHaveBeenCalledTimes(1);
    expect(db.stop.findMany).toHaveBeenCalledTimes(1);
    expect(db.transport.findMany).toHaveBeenCalledTimes(1);
    expect(db.accommodation.findMany).toHaveBeenCalledTimes(1);
    expect(db.cost.findMany).toHaveBeenCalledTimes(1);
    expect(db.chapter.findMany).toHaveBeenCalledTimes(1);
    expect(db.item.groupBy).toHaveBeenCalledTimes(1);
    expect(db.dayTitle.findMany).toHaveBeenCalledTimes(1);
    // Dated Items, Wishlist ideas, things to do — each once, trip-wide.
    expect(db.item.findMany).toHaveBeenCalledTimes(3);
    const tripWideAttachmentReads = db.attachment.findMany.mock.calls.filter(
      ([args]) => (args as { where: { targetType?: string } }).where.targetType !== "JOURNAL",
    );
    expect(tripWideAttachmentReads).toHaveLength(1);
    expect(db.journalEntry.findMany).toHaveBeenCalledTimes(3);
  });

  it("selects Day titles and things to do by the Trip, not by a list of Stop ids", async () => {
    await getDay("trip-1", "2026-12-05", "u-1");
    expect(db.dayTitle.findMany).toHaveBeenCalledWith({
      where: { stop: { tripId: "trip-1", forkId: null } },
      select: { stopId: true, dayIndex: true, title: true },
    });
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", forkId: null, stopId: { not: null }, date: null } }),
    );
  });
});
```
- [ ] **Step 2: Run the test to confirm it fails**
Run: `npx vitest run lib/day-view-loader.cache.test.ts`
Expected: FAIL. `trip.findUnique` is called 3 times today.
- [ ] **Step 3: Implement.** In `lib/day-view-loader.ts`:

1. Imports: replace line 15 (`import { loadDayTitles } …`) with `import { titlesByDate } from "@/lib/day-titles";`. Add `import { cache } from "react";` as the first import, above line 13.
2. Replace lines 119-305 (the `getDay` signature through the end of its `Promise.all`) with the following. `getDay` keeps its signature:
```ts
/**
 * Every trip-wide read the Day view needs, memoised per request (spec
 * 2026-10-06 §B): the Day page asks getDay for three dates (the day shown and
 * both neighbours) and all three share this one set of reads. Real plan only
 * (policy above). Accommodations are read for the whole Trip and filtered per
 * date in projectDay.
 */
async function loadDayTripDataUncached(tripId: string) {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true, name: true, homeCurrency: true, homeName: true, chaptersEnabled: true, roundTrip: true },
  });
  // The caller has already checked access; a missing row is treated as a bad link.
  if (!trip) return "invalid" as const;
  if (!trip.startDate || !trip.endDate) return "dateless" as const;
  const startDate = trip.startDate;
  const endDate = trip.endDate;

  const [stops, items, transports, accommodations, wishlist, allAttachments, costs, chapters, counts, dayTitleRows, thingsToDoAll] =
    await Promise.all([
      /* stops — copy the db.stop.findMany({...}) call from old lines 143-159 verbatim */,
      /* items — copy the db.item.findMany({...}) call from old lines 160-181 verbatim */,
      /* transports — copy old lines 182-205 verbatim */,
      // Whole Trip; projectDay keeps the stays that touch the day.
      db.accommodation.findMany({
        where: { tripId, ...REAL_PLAN },
        orderBy: { checkIn: "asc" },
        select: {
          id: true, stopId: true, name: true, address: true, checkIn: true, checkOut: true,
          checkInTime: true, checkOutTime: true, confirmation: true, notes: true, lat: true, lng: true,
        },
      }),
      /* wishlist — copy old lines 254-257 verbatim */,
      /* allAttachments — copy old lines 258-272 verbatim */,
      /* costs — copy old lines 273-291 verbatim, including the comment */,
      /* chapters — copy old lines 292-298 verbatim (the chaptersEnabled conditional) */,
      /* counts — copy old lines 299-304 verbatim (the item.groupBy) */,
      // Day titles for the Trip's Stops, selected through the Stop (spec
      // 2026-10-06 §B) so they join this wave instead of waiting for `stops`.
      db.dayTitle.findMany({
        where: { stop: { tripId, ...REAL_PLAN } },
        select: { stopId: true, dayIndex: true, title: true },
      }),
      // Every Stop's things to do (ADR 0022); projectDay picks the day's Stop.
      db.item.findMany({
        where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE },
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, category: true, startTime: true, stopId: true },
      }),
    ]);

  const dayTitles = titlesByDate(
    stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
    dayTitleRows,
  );

  return {
    tripId,
    trip,
    startDate,
    endDate,
    windowDates: tripDays(startDate, endDate),
    stops,
    items,
    transports,
    accommodations,
    wishlist,
    allAttachments,
    costs,
    chapters,
    counts,
    dayTitles,
    thingsToDoAll,
  };
}

export const loadDayTripData = cache(loadDayTripDataUncached);
export type DayTripData = Exclude<Awaited<ReturnType<typeof loadDayTripDataUncached>>, "invalid" | "dateless">;

/** The per-date reads: every Traveller's Journal entry and photos for one day (ARCH-DAT-6). */
async function loadDayDateData(tripId: string, date: string) {
  const [journalEntries, journalPhotos] = await Promise.all([
    /* copy the db.journalEntry.findMany({...}) call from old lines 224-237 verbatim (date: effectiveDate → date: date) */,
    /* copy the JOURNAL db.attachment.findMany({...}) call from old lines 238-253 verbatim (targetId: effectiveDate → targetId: date) */,
  ]);
  return { journalEntries, journalPhotos };
}
export type DayDateData = Awaited<ReturnType<typeof loadDayDateData>>;

export async function getDay(
  tripId: string,
  dateParam: string,
  viewerId: string,
): Promise<DayViewData | "invalid" | "out-of-range" | "dateless"> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return "invalid";

  const data = await loadDayTripData(tripId);
  if (data === "invalid" || data === "dateless") return data;
  const { startDate, endDate } = data;

  if (dateParam < addDays(startDate, -BUFFER_DAYS) || dateParam > addDays(endDate, BUFFER_DAYS)) return "out-of-range";
  const effectiveDate = dateParam < startDate ? startDate : dateParam > endDate ? endDate : dateParam;

  const dateData = await loadDayDateData(tripId, effectiveDate);
  return projectDay(data, { date: effectiveDate, viewerId, ...dateData });
}

/** Pure: the Day view for one date, from the Trip's shared reads plus that day's Journal rows. */
export function projectDay(
  data: DayTripData,
  day: { date: string; viewerId: string } & DayDateData,
): DayViewData | "out-of-range" {
  const { tripId, trip, startDate, endDate, windowDates, stops, items, transports, wishlist, allAttachments, costs, chapters, counts, dayTitles, thingsToDoAll } = data;
  const { date: effectiveDate, viewerId, journalEntries, journalPhotos } = day;
  // The stays that touch this day (the old per-date `checkIn <= date <= checkOut` read).
  const accommodations = data.accommodations.filter((a) => a.checkIn <= effectiveDate && a.checkOut >= effectiveDate);
```
Note on the `/* copy … */` markers: those are verbatim moves of existing code at the old line ranges shown. Paste the existing `db.x.findMany({...})` expressions there, replacing the markers. The two-line date-name edits are spelled out in each marker.

3. Directly after that header, keep the old body from line 307 (`// CONTEXT.md "Item photo" …`) through line 689 (the `};` of the returned object). Close the function with `}`. Apply exactly these two edits inside the moved body:
   - Old lines 310-311 (`const dayTitleEntry = (await loadDayTitles(…)).get(effectiveDate) ?? null;`) become:
     ```ts
     const dayTitleEntry = dayTitles.get(effectiveDate) ?? null;
     ```
   - Old lines 533-540 (the `const thingsToDo = freeForm && dayStop ? await db.item.findMany(…) : [];` block) become:
     ```ts
     const thingsToDo =
       freeForm && dayStop
         ? thingsToDoAll
             .filter((t) => t.stopId === dayStop.id)
             .map(({ id, title, category, startTime }) => ({ id, title, category, startTime }))
         : [];
     ```
   Every other name the moved body uses (`trip`, `stops`, `items`, `transports`, `accommodations`, `wishlist`, `allAttachments`, `costs`, `chapters`, `counts`, `windowDates`, `startDate`, `endDate`, `tripId`, `viewerId`, `journalEntries`, `journalPhotos`, `effectiveDate`) is bound by the header above.
4. Update the file docblock (lines 4-7) to: "`getDay` reads the Trip once per request through the `cache()`d `loadDayTripData` (spec 2026-10-06 §B), reads the day's Journal rows, and hands both to the pure `projectDay`. `getDayWeatherView` is separate …" (keep the rest).

Now update `lib/day-view-loader.test.ts`:
- Lines 125-128: give each thing to do its Stop: `{ id: "t-cathedral", title: "Cathédrale Notre-Dame", category: "SIGHTSEEING", startTime: null, stopId: STRASBOURG.id }` and `{ id: "t-market", title: "Christkindelsmärik", category: "SHOPPING", startTime: "17:00", stopId: STRASBOURG.id }`.
- Line 165 (the things-to-do branch of `itemFindManyMock`): `if (where.date === null && typeof where.stopId === "object" && where.stopId !== null) return opts.thingsToDo ?? THINGS_TO_DO;`
- Lines 278-282 (the "Day ideas in every phase" assertion): `where: expect.objectContaining({ tripId: TRIP_ID, forkId: null, stopId: { not: null }, date: null }),`
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run lib/day-view-loader.cache.test.ts lib/day-view-loader.test.ts "app/(app)/trips/[tripId]/day"`
Expected: PASS. The Day page test mocks `getDay` and is unchanged; the page still makes its three calls.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/day-view-loader.ts lib/day-view-loader.test.ts lib/day-view-loader.cache.test.ts
git commit -m "perf(day): read the Trip once for the day and its neighbours

The Day page ran ~40 queries, the trip-wide reads three times (audit P2).
loadDayTripData is cache()d per request and projectDay is pure; Day titles
and things to do join the parallel wave instead of trailing it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Plan page queries in one wave  (spec §C)

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx:19, 22, 96-259, 303-320, 349-381, 409-428, 502`
- Test: `app/(app)/trips/[tripId]/plan/page.test.tsx:340-357` + a new case

**Interfaces:**
- Consumes: `titlesByDate` (`lib/day-titles.ts`); `tripSlugFor`
- Produces: nothing

- [ ] **Step 1: Write the failing test.** In `plan/page.test.tsx`, change the Day-titles assertion (lines 349-351) to:
```ts
    expect(mockDb.dayTitle.findMany).toHaveBeenCalledWith({
      where: { stop: { tripId: "trip-1", forkId: null } },
      select: { stopId: true, dayIndex: true, title: true },
    });
```
Append:
```tsx
describe("Plan page reads (spec 2026-10-06 §C)", () => {
  it("issues every read in one wave once the Plan is known", async () => {
    let release!: (rows: unknown[]) => void;
    mockDb.stop.findMany.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = renderPlan();
    // The Stops read is still pending: anything awaited after it would not have started.
    await vi.waitFor(() => expect(mockDb.stop.findMany).toHaveBeenCalled());
    expect(mockDb.attachment.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.note.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.dayTitle.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.reminder.findMany).toHaveBeenCalledTimes(1);
    // Transport, Accommodation and Item costs share one read.
    expect(mockDb.cost.findMany).toHaveBeenCalledTimes(1);
    release([]);
    await pending;
  });
});
```
- [ ] **Step 2: Run the test to confirm it fails**
Run: `npx vitest run "app/(app)/trips/[tripId]/plan/page.test.tsx"`
Expected: FAIL. `attachment.findMany` has been called 0 times while Stops are pending, and the Day-title where is `{ stopId: { in: … } }`.
- [ ] **Step 3: Implement.** Apply bottom-up so the line numbers stay valid:
1. Delete line 502 (`const slug = await tripSlugFor(tripId);`).
2. Replace lines 409-428 (Day titles through the `stopReminders` query) with:
```tsx
  // Day titles (CONTEXT.md "Day title", Task 5, spec §H) — resolved once per
  // dateISO across the whole plan (a Changeover date carries at most one
  // title, ADR 0049) and passed down as a plain object so it serialises to
  // the client plan components without a Map.
  const dayTitles = Object.fromEntries(
    titlesByDate(
      stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
      dayTitleRows,
    ),
  );

  // Reminders about a Stop (Task 7), grouped for the Stop card's own
  // "Reminders" line — read in the main wave above (every Reminder a Stop
  // holds, regardless of date, unlike listRemindersForTrip's feed).
```
3. Replace lines 349-381 (the cost grouping and the second cost read) with:
```tsx
  // One cost read (spec 2026-10-06 §C): Transport and Accommodation costs by
  // owner for the entity cards; ITEM costs only for this Plan's things to do
  // and day rows — the same Items the old `ownerId: { in: planItemIds }` read
  // selected (ADR 0022).
  const planItemIds = new Set([...thingsToDoItems, ...scheduledItems].map((i) => i.id));
  const costsByOwnerId = new Map<string, typeof allCosts>();
  const thingsToDoItemCostsById = new Map<string, typeof allCosts>();
  for (const cost of allCosts) {
    if (!cost.ownerId) continue;
    const target = cost.ownerType === "ITEM" ? thingsToDoItemCostsById : costsByOwnerId;
    if (cost.ownerType === "ITEM" && !planItemIds.has(cost.ownerId)) continue;
    const existing = target.get(cost.ownerId) ?? [];
    existing.push(cost);
    target.set(cost.ownerId, existing);
  }
```
4. Delete lines 303-320 (the `// Fetch notes …` comment and the `const allNotes = await db.note.findMany({…});` statement). Keep the grouping loop at 322-347.
5. Replace lines 96-259 (the main `Promise.all` and the attachment read) with:
```tsx
  // Everything else in ONE wave once the Plan is known (spec 2026-10-06 §C).
  const [trip, stops, transports, allCosts, chapters, thingsToDoItems, scheduledItems, allAttachments, allNotes, dayTitleRows, stopReminders, slug] = await Promise.all([
    /* old lines 97-114: the db.trip.findUnique({...}) call, verbatim */,
    /* old lines 115-151: the db.stop.findMany({...}) call, verbatim */,
    /* old lines 152-175: the db.transport.findMany({...}) call, verbatim */,
    // Entity-attached costs in one query — Transport, Accommodation and
    // Item (split by ownerType below).
    db.cost.findMany({
      where: {
        tripId,
        ...planScope(activeForkId),
        ownerType: { in: ["TRANSPORT", "ACCOMMODATION", "ITEM"] },
        ownerId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    /* old lines 187-191: the db.chapter.findMany({...}) call, verbatim */,
    /* old lines 192-213: the things-to-do db.item.findMany({...}) call with its comment, verbatim */,
    /* old lines 214-236: the scheduled-items db.item.findMany({...}) call with its comment, verbatim */,
    // All attachments for this trip's entities in one query
    /* old lines 240-259: the db.attachment.findMany({...}) call, verbatim */,
    // Notes for stops, transports, and accommodations in one query
    /* old lines 304-320: the db.note.findMany({...}) call, verbatim */,
    // Selected through the Stop so they don't wait for `stops` (spec 2026-10-06 §C).
    db.dayTitle.findMany({
      where: { stop: { tripId, ...planScope(activeForkId) } },
      select: { stopId: true, dayIndex: true, title: true },
    }),
    db.reminder.findMany({
      where: { tripId, stopId: { not: null } },
      orderBy: { date: "asc" },
      select: { id: true, title: true, date: true, stopId: true },
    }),
    tripSlugFor(tripId),
  ]);
```
(The `/* old lines … verbatim */` markers mean "paste that existing call expression here". Step 4 above deletes the original notes statement; its expression moves here.)
6. Line 19: change `import { loadDayTitles } from "@/lib/day-titles-loader";` to `import { titlesByDate } from "@/lib/day-titles";`.
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run "app/(app)/trips/[tripId]/plan/page.test.tsx"`
Expected: PASS. The reminders-by-stop, Fork and grid tests are unchanged.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/plan/page.test.tsx"
git commit -m "perf(plan): read the Plan in one wave after the gate

The Plan page made ~9 serial round trips (audit P3). Attachments, notes,
Item costs, Day titles, reminders and the slug now join the main batch;
Item costs share the entity cost read, filtered to the same Items.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Shared cached membership read; app layout in two waves  (spec §C)

**Files:**
- Create: `lib/membership-reads.ts`
- Create test: `lib/membership-reads.test.ts`
- Modify: `lib/reconcile-invites.ts:15-18`, `lib/reconcile-invites.test.ts`
- Modify: `app/(app)/layout.tsx:7, 13, 63-121`
- Test: `app/(app)/layout.test.tsx`

**Interfaces:**
- Consumes: `reconcilePendingInvites(userId, email)` (`lib/reconcile-invites.ts`)
- Produces: `export const readMemberTrips: (userId: string, email: string | null) => Promise<Array<{ trip: { id; name; slug; startDate; endDate; createdAt; stops: … } }>>`, `cache()`d. It runs the Invite reconcile before reading, so a just-accepted Invite is always in the list.

- [ ] **Step 1: Write the failing tests.** Create `lib/membership-reads.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, reconcile, order } = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    findMany: vi.fn(async () => { order.push("read"); return []; }),
    reconcile: vi.fn(async () => { order.push("reconcile"); }),
  };
});
vi.mock("@/lib/db", () => ({ db: { tripMember: { findMany } } }));
vi.mock("@/lib/reconcile-invites", () => ({ reconcilePendingInvites: reconcile }));

import { readMemberTrips } from "./membership-reads";

beforeEach(() => { vi.clearAllMocks(); order.length = 0; });

describe("readMemberTrips (spec 2026-10-06 §C)", () => {
  it("reconciles Invites before reading, so a just-accepted Trip is listed", async () => {
    await readMemberTrips("u1", "alice@example.com");
    expect(reconcile).toHaveBeenCalledWith("u1", "alice@example.com");
    expect(order).toEqual(["reconcile", "read"]);
  });
  it("skips the reconcile without an address", async () => {
    await readMemberTrips("u1", null);
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("reads the viewer's live Trips with what the switcher and the hue need", async () => {
    await readMemberTrips("u1", null);
    const args = findMany.mock.calls[0][0] as { where: unknown; include: { trip: { select: Record<string, unknown> } }; orderBy: unknown };
    expect(args.where).toEqual({ userId: "u1", trip: { deletedAt: null } });
    expect(args.include.trip.select).toMatchObject({ id: true, name: true, slug: true, startDate: true, endDate: true, createdAt: true });
    expect(args.orderBy).toEqual({ trip: { createdAt: "desc" } });
  });
});
```
Replace the body of `lib/reconcile-invites.test.ts`'s `describe` with:
```ts
  it("accepts pending Trip and Globe Invites for the signed-in email", async () => {
    acceptInvites.mockResolvedValue(undefined);
    acceptGlobeInvites.mockResolvedValue(undefined);
    await reconcilePendingInvites("u1", "alice@example.com");
    expect(acceptInvites).toHaveBeenCalledWith("u1", "alice@example.com");
    expect(acceptGlobeInvites).toHaveBeenCalledWith("u1", "alice@example.com");
  });

  it("runs the two accepts in parallel (spec 2026-10-06 §C)", async () => {
    acceptInvites.mockImplementation(() => new Promise(() => {})); // never settles
    acceptGlobeInvites.mockResolvedValue(undefined);
    void reconcilePendingInvites("u2", "bob@example.com");
    await vi.waitFor(() => expect(acceptGlobeInvites).toHaveBeenCalledWith("u2", "bob@example.com"));
  });
```
In `app/(app)/layout.test.tsx`, after the `next/headers` mock (line 79), add:
```tsx
const reconcileMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/reconcile-invites", () => ({ reconcilePendingInvites: reconcileMock }));
```
Append:
```tsx
describe("AppLayout reads (spec 2026-10-06 §C)", () => {
  it("starts the Invite reconcile alongside the Traveller read", async () => {
    let release!: (v: unknown) => void;
    userFindUniqueMock.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = AppLayout({ children: <div /> });
    await vi.waitFor(() => expect(reconcileMock).toHaveBeenCalledWith("user-1", "alice@example.com"));
    release({ id: "user-1", name: "Alice Test", email: "alice@example.com", image: null, displayName: null, photoKey: null, photoUpdatedAt: null });
    await pending;
  });

  it("counts the Admin queue beside the memberships read", async () => {
    process.env.ADMIN_EMAILS = "alice@example.com";
    let release!: (v: unknown) => void;
    tripMemberFindManyMock.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = AppLayout({ children: <div /> });
    await vi.waitFor(() => expect(accessRequestCountMock).toHaveBeenCalled());
    release([]);
    await pending;
  });
});
```
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run lib/membership-reads.test.ts lib/reconcile-invites.test.ts "app/(app)/layout.test.tsx"`
Expected: FAIL. The module is not found, the Globe accept is never called while the Trip accept hangs, and the reconcile is not called before the user read resolves.
- [ ] **Step 3: Implement.** In `lib/reconcile-invites.ts`, replace lines 15-18 with:
```ts
export const reconcilePendingInvites = cache(async (userId: string, email: string) => {
  // Independent tables (TripMember, GlobeMember), each best-effort with its
  // own try/catch — so in parallel (spec 2026-10-06 §C).
  await Promise.all([
    acceptPendingInvitesForUser(userId, email),
    acceptPendingGlobeInvitesForUser(userId, email),
  ]);
});
```
Create `lib/membership-reads.ts`:
```ts
import { cache } from "react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { reconcilePendingInvites } from "@/lib/reconcile-invites";

/**
 * The viewer's live Trips (spec 2026-10-06 §C), memoised per request so the
 * app layout (trip switcher) and Trip Home (per-viewer hue) share one read.
 *
 * Reconciles pending Invites first (ADR 0017; itself cache()d, so free when
 * the layout already ran it): layouts and pages render in parallel, and
 * whichever calls this first fixes the answer for both — so it must never be
 * a list from before a just-accepted Invite became membership.
 */
export const readMemberTrips = cache(async (userId: string, email: string | null) => {
  if (email) await reconcilePendingInvites(userId, email);
  return db.tripMember.findMany({
    where: { userId, trip: { deletedAt: null } },
    include: {
      trip: {
        select: {
          id: true,
          name: true,
          slug: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          stops: {
            where: { ...REAL_PLAN, arriveDate: { not: null } },
            orderBy: { sortOrder: "asc" },
            select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
          },
        },
      },
    },
    orderBy: { trip: { createdAt: "desc" } },
  });
});
```
In `app/(app)/layout.tsx`: delete line 13 (the `REAL_PLAN` import; it's no longer used here). After line 7, add `import { readMemberTrips } from "@/lib/membership-reads";`. Replace lines 63-121 (from `const session = await auth();` through the end of the `memberships` query) with:
```tsx
  const session = await auth();
  if (!session?.user?.id) return signInRedirect();
  const userId = session.user.id;
  const sessionEmail = session.user.email ?? null;

  // Wave 1 (spec 2026-10-06 §C): the Traveller row and the Invite reconcile
  // start together — the reconcile needs only the signed-in address.
  // Read from the DB, not session.user's name/image, so a Display name or
  // Profile photo change (CONTEXT.md "Profile photo and display name") shows
  // immediately — the session's own copy only refreshes on next sign-in.
  const [traveller] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { ...TRAVELLER_SELECT, email: true },
    }),
    sessionEmail ? reconcilePendingInvites(userId, sessionEmail) : Promise.resolve(),
  ]);
  if (!traveller) return signInRedirect();

  const { email } = traveller;
  const isAdmin = isAdminEmail(email);

  // Wave 2: the switcher's Trips beside the Admin queue count.
  //
  // Trip switcher (sidebar ≥1280px; a compact pill in the trip header at
  // 768–1279px, docs/specs/2026-09-27-desktop-home.md §1 / beta-feedback §A):
  // every trip the Traveller is a member of, ordered like the trips list
  // itself (lib/trip-phase.ts compareForTripList — soonest/active first).
  // Loaded once here, not per trip, so switching trips never re-queries it.
  // readMemberTrips reconciles first (free: cached above); a session with no
  // address reconciles on the stored one.
  //
  // The Admin queue (CONTEXT.md): the dot on the avatar / You tab, the menu
  // badge and the Account card all read these numbers. notifyAdmins' push
  // only reaches the operator if they have a Device registered (ADR 0048),
  // and never fires for a typed Sign-in link address (ADR 0057), so this
  // count is often the ONLY way an Admin learns something is waiting.
  // Failure here must never hide the /admin link itself — only the count —
  // so a DB hiccup degrades to "no dot, no badge", not "no route".
  const [memberships, adminQueue] = await Promise.all([
    readMemberTrips(userId, sessionEmail ?? email),
    isAdmin
      ? countAdminQueue().catch((err: unknown): AdminQueue => {
          console.error("[AppLayout] failed to count the Admin queue:", err);
          return EMPTY_ADMIN_QUEUE;
        })
      : Promise.resolve<AdminQueue>(EMPTY_ADMIN_QUEUE),
  ]);
```
The rest of the file (`const memberTrips = memberships.map((m) => m.trip);` onward) is unchanged.
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run lib/membership-reads.test.ts lib/reconcile-invites.test.ts "app/(app)/layout.test.tsx"`
Expected: PASS. The existing "trip switcher data" assertions still see the same `where` and `include.trip.select`.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/membership-reads.ts lib/membership-reads.test.ts lib/reconcile-invites.ts lib/reconcile-invites.test.ts "app/(app)/layout.tsx" "app/(app)/layout.test.tsx"
git commit -m "perf(shell): app layout reads in two waves; shared membership read

The app layout made 4-5 serial reads on every page (audit P3). The user
read and the Invite reconcile start together; the two accepts run in
parallel; memberships and the Admin count share a wave. readMemberTrips
is cache()d so Trip Home can reuse it, and reconciles first so its answer
never predates a just-accepted Invite.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Trip Home reads in one wave  (spec §C)

**Files:**
- Modify: `app/(app)/trips/[tripId]/page.tsx:1-30 (imports), 64-115, 176-179`
- Test: `app/(app)/trips/[tripId]/page.test.tsx`

**Interfaces:**
- Consumes: `readMemberTrips(userId, email)` (Task 6)
- Produces: nothing

- [ ] **Step 1: Write the failing test.** In `page.test.tsx`, after the `next/navigation` mock (line 41), add:
```tsx
vi.mock("@/lib/reconcile-invites", () => ({ reconcilePendingInvites: vi.fn(async () => {}) }));
```
Append:
```tsx
describe("Trip Home reads (spec 2026-10-06 §C)", () => {
  it("reads the Trip, its cover Stops and the viewer's Trips in one wave", async () => {
    let release!: (v: unknown) => void;
    mockDb.trip.findUnique.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = TripHomePage({ params: Promise.resolve({ tripId: "trip-1" }) });
    await vi.waitFor(() => {
      expect(mockDb.stop.findMany).toHaveBeenCalled();
      expect(mockDb.tripMember.findMany).toHaveBeenCalled();
    });
    release(BASE_TRIP);
    await pending;
  });
});
```
- [ ] **Step 2: Run the test to confirm it fails**
Run: `npx vitest run "app/(app)/trips/[tripId]/page.test.tsx" -t "one wave"`
Expected: FAIL. `stop.findMany` has not been called while the Trip read is pending.
- [ ] **Step 3: Implement.** Add `import { readMemberTrips } from "@/lib/membership-reads";` to the imports. Replace lines 64-115 (from `const trip = await db.trip.findUnique({` through `const hue = …;`) with:
```tsx
  // One wave after the gate (spec 2026-10-06 §C): the Trip, its located
  // Stops for the cover, the viewer's Trips (for the hue — the same cache()d
  // read the app layout makes) and the Reminders, which wait only for the
  // Trip's own today. `.then((row) => row)` turns the Prisma query into one
  // settled promise both consumers share.
  const tripPromise = db.trip
    .findUnique({
      where: { id: tripId },
      select: {
        /* old lines 67-90: the whole select object, verbatim */
      },
    })
    .then((row) => row);
  const [trip, coverStopsRaw, myTrips, reminders] = await Promise.all([
    tripPromise,
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN, lat: { not: null }, lng: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true, arriveDate: true, departDate: true, lat: true, lng: true },
    }),
    readMemberTrips(user.id, user.email ?? null),
    // Reminders are a Trip's dated notes and belong on Home in *every* Phase
    // (see remindersEl below). "today" is the Trip's own.
    tripPromise.then((row) => (row ? listRemindersForTrip(tripId, tripTodayISO(row.stops)) : [])),
  ]);
  if (!trip) notFound();

  // ADR 0038: a scheduled stop's position IS its dates — the cover map's
  // route order must follow canonical plan order, not raw sortOrder.
  const coverStops = orderPlanStops(coverStopsRaw);

  // Same canonical order for the "current timezone" pick — trip.stops is
  // fetched by sortOrder, which no longer tracks date order under ADR 0038.
  const today = tripTodayISO(trip.stops);
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });

  // Trip colour is per viewer (creation order among the viewer's trips).
  const hue = assignTripHues(myTrips.map((m) => m.trip)).get(tripId) ?? "coral";
```
Delete line 179 (`const reminders = await listRemindersForTrip(tripId, today);`). Keep the comment block at 176-178 above it, and the RemindersCard comment that follows.
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run "app/(app)/trips/[tripId]/page.test.tsx"`
Expected: PASS.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add "app/(app)/trips/[tripId]/page.tsx" "app/(app)/trips/[tripId]/page.test.tsx"
git commit -m "perf(home): Trip Home reads in one wave

Home made five serial reads before its batch (audit P3). The Trip, cover
Stops, the viewer's Trips (now the layout's cache()d read) and Reminders
run together; Reminders chain only on the Trip row for their today.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Checklists and Wishlist pages query in parallel  (spec §C)

**Files:**
- Modify: `app/(app)/trips/[tripId]/checklists/page.tsx:49-98`
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx:36-142`
- Test: `app/(app)/trips/[tripId]/checklists/page.test.tsx`, `app/(app)/trips/[tripId]/wishlist/page.test.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing

- [ ] **Step 1: Write the failing tests.** Append to `checklists/page.test.tsx`:
```tsx
describe("ChecklistsPage reads (spec 2026-10-06 §C)", () => {
  it("issues every read in one wave after the access check", async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    let release!: (v: unknown) => void;
    vi.mocked(db.trip.findUnique).mockImplementationOnce((() => new Promise((r) => { release = r; })) as never);
    const pending = ChecklistsPage({ params: Promise.resolve({ tripId: "trip-1" }) });
    await vi.waitFor(() => {
      expect(db.checklistItem.findMany).toHaveBeenCalled();
      expect(db.tripMember.findMany).toHaveBeenCalled();
      expect(db.stop.findMany).toHaveBeenCalled();
    });
    release({ name: "Christmas in Europe", startDate: "2026-12-04" });
    await pending;
  });
});
```
Append to `wishlist/page.test.tsx`:
```tsx
describe("WishlistPage reads (spec 2026-10-06 §C)", () => {
  it("loads the current Plan's Stops in the same wave as the ideas' costs, notes and votes", async () => {
    tripFindUniqueMock.mockResolvedValue({
      id: "t1", name: "Europe", startDate: "2026-07-01", endDate: "2026-07-20", homeCurrency: "USD", forksEnabled: false, stops: [],
      items: [{
        id: "i1", title: "Louvre", category: "SIGHTSEEING", date: null, startTime: null, endTime: null, address: null, link: null,
        booking: null, notes: null, stopId: null, lat: null, lng: null, sourceMarkerId: null, hiddenFromShares: false,
        photoAttachmentId: null, stop: null,
      }],
    });
    let release!: (v: unknown) => void;
    stopFindManyMock.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = WishlistPage({ params: Promise.resolve({ tripId: "t1" }), searchParams: Promise.resolve({}) });
    await vi.waitFor(() => {
      expect(costFindManyMock).toHaveBeenCalled();
      expect(noteFindManyMock).toHaveBeenCalled();
      expect(voteFindManyMock).toHaveBeenCalled();
    });
    release([]);
    await pending;
  });
});
```
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run "app/(app)/trips/[tripId]/checklists/page.test.tsx" "app/(app)/trips/[tripId]/wishlist/page.test.tsx"`
Expected: FAIL. `checklistItem.findMany` is not called while the Trip read is pending, and `cost.findMany` is not called while the Plan Stops read is pending.
- [ ] **Step 3: Implement.** In `checklists/page.tsx`, replace lines 49-98 (from `await requireTripAccess(tripId);` through `const reminders = await listRemindersForTrip(tripId, today);`) with:
```tsx
  await requireTripAccess(tripId);

  const aiConfigured = isAiConfigured();

  // One wave after the gate (spec 2026-10-06 §C). Reminders live here at every
  // width (Task 16): the desktop Home shows them only as "Sort these out" rows
  // in their last week, so this is where a Traveller lists and adds them.
  // "today" is the trip's, never the machine's, so Reminders chain on the
  // Stops. Real plan only, like Home — Reminders are about the Trip, not a
  // variant. `.then((rows) => rows)`: one settled promise for both consumers.
  const stopsPromise = db.stop
    .findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
    })
    .then((rows) => rows);
  const [trip, slug, rawItems, members, templates, stopsRaw, reminders] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { name: true, startDate: true } }),
    tripSlugFor(tripId),
    // All checklist items for this trip
    db.checklistItem.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        kind: true,
        text: true,
        done: true,
        dueDate: true,
        sortOrder: true,
        buy: true,
        assignedTo: { select: TRAVELLER_SELECT },
      },
    }),
    // Trip members for the assignee picker
    db.tripMember.findMany({ where: { tripId }, select: { user: { select: TRAVELLER_SELECT } } }),
    // The current user's packing templates
    listTemplates(),
    stopsPromise,
    stopsPromise.then((rows) => listRemindersForTrip(tripId, tripTodayISO(rows))),
  ]);

  const memberList = members.map((m) => m.user);
  const stops = orderPlanStops(stopsRaw);
  const today = tripTodayISO(stopsRaw);
```
In `wishlist/page.tsx`, replace lines 36-141 (from `const { user } = await requireTripAccess(tripId);` through the `photoAttachmentIds` computation) with:
```tsx
  const { user } = await requireTripAccess(tripId);

  // Wave 1 (spec 2026-10-06 §C): the Trip with its ideas, the slug and the
  // viewer's Globe markers — none depends on another. The markers chain on
  // the Globe membership.
  const globePromise = getUserGlobe(user.id);
  const [trip, slug, globe, globeMarkerRows] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        /* old lines 40-85: the whole select object, verbatim */
      },
    }),
    tripSlugFor(tripId),
    globePromise,
    globePromise.then((g) =>
      g
        ? db.marker.findMany({
            where: { globeId: g.id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true, title: true, category: true, note: true, link: true, timing: true,
              lat: true, lng: true, city: true, country: true, countryCode: true,
            },
          })
        : [],
    ),
  ]);

  if (!trip) {
    notFound();
  }
  const globeMarkers: MarkerView[] = globeMarkerRows;

  // Plan variants off (spec B3) → `?plan=` is ignored and this is the real plan.
  // Otherwise validate the fork exists for this trip; fall back to real plan if not.
  const selectedForkId = resolvePlan({ plan, forksEnabled: trip.forksEnabled });
  const activeFork = selectedForkId
    ? await db.fork.findFirst({ where: { id: selectedForkId, tripId }, select: { id: true, name: true } })
    : null;
  const activeForkId = activeFork ? activeFork.id : null;

  // Markers already pulled into THIS trip's wishlist (dedupe scope = unscheduled ideas,
  // which is exactly what trip.items already filters to).
  const addedMarkerIds = trip.items
    .map((i) => i.sourceMarkerId)
    .filter((id): id is string => id !== null);

  const suggestedMarkers = suggestMarkersForTrip({
    markers: globeMarkers,
    stops: trip.stops.map((s) => ({ countryCode: s.countryCode, lat: s.lat, lng: s.lng })),
    addedMarkerIds,
  });

  const itemIds = trip.items.map((i) => i.id);

  // CONTEXT.md "Item photo" (spec §I) — only the Attachments Wishlist ideas
  // actually point at, not every Attachment on the trip.
  const photoAttachmentIds = trip.items
    .map((i) => i.photoAttachmentId)
    .filter((id): id is string => id !== null);
```
Then change line 142-143 (`// Fetch ITEM costs, notes, …` / `const [itemCosts, … ] = await Promise.all([`) to:
```tsx
  // Wave 2: the current Plan's Stops, plus ITEM costs, notes, votes,
  // active-plan placements AND photo Attachments.
  const [planStops, itemCosts, itemNotes, itemVotes, activePlacements, photoAttachments] = await Promise.all([
    // Spec 2026-10-05 §E: Schedule offers the CURRENT Plan's days — a Fork's
    // own Stops while one is active. `trip.stops` above is every Plan's.
    db.stop.findMany({
      where: { tripId, ...planScope(activeForkId) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, lat: true, lng: true, arriveDate: true, departDate: true },
    }),
```
The five existing entries follow unchanged.
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run "app/(app)/trips/[tripId]/checklists" "app/(app)/trips/[tripId]/wishlist"`
Expected: PASS.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add "app/(app)/trips/[tripId]/checklists/page.tsx" "app/(app)/trips/[tripId]/checklists/page.test.tsx" "app/(app)/trips/[tripId]/wishlist/page.tsx" "app/(app)/trips/[tripId]/wishlist/page.test.tsx"
git commit -m "perf(checklists,wishlist): query in parallel

Both pages awaited each read in turn (audit P3). Checklists runs one wave
after the gate (Reminders chained on the Stops); Wishlist runs the Trip,
slug and Globe markers together, then the Plan's Stops beside the ideas'
costs, notes and votes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Pure `computeProjection`; Summary reads Stops once  (spec §C)

**Files:**
- Create: `lib/trip-projection.ts`
- Create test: `lib/trip-projection.test.ts`
- Modify: `server/actions/stops.ts:1553-1576` (+ import)
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx:23, 114-131, 203-279, 335, 395`
- Test: `app/(app)/trips/[tripId]/summary/page.test.tsx:133-138` + a new case

**Interfaces:**
- Consumes: `computeProjectedEnd`, `ProjectionStop` (`lib/firm-up.ts`); `resolveTripDeadline`, `DeadlineLeg`, `TripDeadline` (`lib/trip-deadline.ts`)
- Produces:
  - `export interface ProjectionTrip { startDate: string | null; hardEndDate: string | null; roundTrip: boolean | null }`
  - `export interface TripProjection { projectedEnd: string | null; hardEndDate: string | null; deadline: TripDeadline | null }`
  - `export function computeProjection(input: { trip: ProjectionTrip | null; stops: readonly (ProjectionStop & { timezone?: string | null })[]; transports: readonly DeadlineLeg[] }): TripProjection`

- [ ] **Step 1: Write the failing tests.** Create `lib/trip-projection.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeProjection } from "./trip-projection";

const trip = { startDate: "2026-07-01", hardEndDate: "2026-07-20", roundTrip: true };
const paris = { id: "a", arriveDate: "2026-07-01", departDate: "2026-07-04", nights: 3, pinned: false, sortOrder: 0, timezone: "Europe/Paris" };
const rough = { id: "b", arriveDate: null, departDate: null, nights: 2, pinned: false, sortOrder: 1, timezone: null };

describe("computeProjection (spec 2026-10-06 §C)", () => {
  it("flows rough nights on from the scheduled Stops and carries the hard end date", () => {
    expect(computeProjection({ trip, stops: [paris, rough], transports: [] })).toEqual({
      projectedEnd: "2026-07-06",
      hardEndDate: "2026-07-20",
      deadline: { kind: "hard-end", date: "2026-07-20" },
    });
  });
  it("a dated leg leaving the last Stop is the deadline, in that Stop's zone", () => {
    const leg = { mode: "FLIGHT", fromStopId: "a", toStopId: null, depAt: new Date("2026-07-04T08:00:00Z"), arrIsHome: true };
    expect(computeProjection({ trip: { ...trip, roundTrip: false }, stops: [paris], transports: [leg] }).deadline).toEqual({
      kind: "return-leg", date: "2026-07-04", mode: "FLIGHT", homeward: false,
    });
  });
  it("is all nulls for a missing Trip", () => {
    expect(computeProjection({ trip: null, stops: [], transports: [] })).toEqual({ projectedEnd: null, hardEndDate: null, deadline: null });
  });
});
```
In `summary/page.test.tsx`, replace `setupStops` (lines 133-138) with:
```tsx
function setupStops(datedStops: unknown[], roughStops: unknown[]) {
  mockDb.stop.findMany.mockImplementation((args: { where: { arriveDate?: unknown } }) => {
    // Date-less Trips still read rough Stops only; a dated Trip reads every
    // Stop once (spec 2026-10-06 §C) and splits them itself.
    if (args.where.arriveDate === null) return Promise.resolve(roughStops);
    return Promise.resolve([...datedStops, ...roughStops]);
  });
}
```
Append:
```tsx
describe("SummaryPage reads (spec 2026-10-06 §C)", () => {
  it("reads Stops once and computes the projection from them, not with a second round of reads", async () => {
    const { getTripProjection } = await import("@/server/actions/stops");
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });
    render(await renderSummary());
    expect(mockDb.stop.findMany).toHaveBeenCalledTimes(1);
    expect(getTripProjection).not.toHaveBeenCalled();
  });
});
```
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run lib/trip-projection.test.ts "app/(app)/trips/[tripId]/summary/page.test.tsx"`
Expected: FAIL. The module is not found; `stop.findMany` is called 2 times and `getTripProjection` once.
- [ ] **Step 3: Implement.** Create `lib/trip-projection.ts`:
```ts
/**
 * A plan's projected end, hard end date and deadline (ADR 0068), computed
 * from rows a loader already holds (spec 2026-10-06 §C) — so a page that has
 * read its Stops and Transports doesn't read them again for the projection.
 * Pure. getTripProjection (server/actions/stops.ts) wraps it for callers
 * that haven't read anything yet.
 */
import { computeProjectedEnd, type ProjectionStop } from "@/lib/firm-up";
import { resolveTripDeadline, type DeadlineLeg, type TripDeadline } from "@/lib/trip-deadline";

export interface ProjectionTrip {
  startDate: string | null;
  hardEndDate: string | null;
  roundTrip: boolean | null;
}

export interface TripProjection {
  projectedEnd: string | null;
  hardEndDate: string | null;
  deadline: TripDeadline | null;
}

/** `stops`: every Stop of the plan (dated and rough), any order. */
export function computeProjection({
  trip,
  stops,
  transports,
}: {
  trip: ProjectionTrip | null;
  stops: readonly (ProjectionStop & { timezone?: string | null })[];
  transports: readonly DeadlineLeg[];
}): TripProjection {
  const hardEndDate = trip?.hardEndDate ?? null;
  return {
    projectedEnd: computeProjectedEnd(stops, trip?.startDate ?? null),
    hardEndDate,
    deadline: resolveTripDeadline({ stops, transports, hardEndDate, roundTrip: trip?.roundTrip ?? true }),
  };
}
```
In `server/actions/stops.ts`, add `import { computeProjection } from "@/lib/trip-projection";`. Replace lines 1570-1575 (the `const hardEndDate …` / `return {…}` block) with `return computeProjection({ trip, stops, transports });`. Then remove any import that becomes unused: `npm run lint` will name `computeProjectedEnd` or `resolveTripDeadline` if nothing else in the file uses them.

In `summary/page.tsx`:
1. Line 23: replace the `getTripProjection` import with `import { computeProjection } from "@/lib/trip-projection";`.
2. In the trip select (lines 114-131), add `hardEndDate: true,` after `endDate: true,`.
3. Replace lines 203-279 (`// Fetch all trip data in parallel` through the end of the `Promise.all`) with:
```tsx
  // One wave (spec 2026-10-06 §C): every real-plan Stop in a single read —
  // dated and rough are split below — and the projection is computed from
  // these same rows rather than a second round of trip/stop/transport reads.
  const [allStops, transports, accommodations, items, costs, exchangeRates, chapters, slug] =
    await Promise.all([
      db.stop.findMany({
        where: { tripId, ...REAL_PLAN },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, name: true, country: true, lat: true, lng: true, timezone: true,
          arriveDate: true, departDate: true, sortOrder: true, pinned: true, nights: true, chapterId: true,
        },
      }),
      /* old lines 224-240: transport findMany, verbatim */,
      /* old lines 241-250: accommodation findMany, verbatim */,
      /* old lines 251-254: item findMany, verbatim */,
      /* old lines 255-259: cost findMany, verbatim */,
      /* old lines 260-263: exchangeRate findMany, verbatim */,
      /* old lines 264-273: the chaptersEnabled conditional with its comment, verbatim */,
      tripSlugFor(tripId),
    ]);
  // Rough (date-less) stops are excluded from the dated summary and surface
  // as "not yet scheduled".
  const stops = allStops.filter((s) => s.arriveDate !== null);
  const roughStops = allStops.filter((s) => s.arriveDate === null);
```
4. Line 335: replace `const projection = await getTripProjection(tripId);` with `const projection = computeProjection({ trip, stops: allStops, transports });`.
5. Line 395: replace `const tripBasePath = tripPath(await tripSlugFor(tripId));` with `const tripBasePath = tripPath(slug);`.
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run lib/trip-projection.test.ts "app/(app)/trips/[tripId]/summary" server/actions/stops.test.ts`
Expected: PASS.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/trip-projection.ts lib/trip-projection.test.ts server/actions/stops.ts "app/(app)/trips/[tripId]/summary/page.tsx" "app/(app)/trips/[tripId]/summary/page.test.tsx"
git commit -m "perf(summary): one Stop read; projection from loaded rows

Summary read Stops twice and then getTripProjection read the Trip, Stops
and Transports again (audit P3). computeProjection is pure over rows
already loaded; getTripProjection now wraps it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Desktop Home and Next steps loaders — one Stop read, projection from rows  (spec §C)

**Files:**
- Modify: `lib/desktop-home-loader.ts:11-14, 35, 55-68, 123-235, 269, 283-300`
- Modify: `app/(app)/trips/[tripId]/page.tsx` (trip select: add `hardEndDate: true`)
- Modify: `lib/next-steps-loader.ts:15-130`
- Create test: `lib/next-steps-loader.test.ts`
- Modify test: `components/trip/home/phase-planning.test.tsx:59, 171-184, 279-291`

**Interfaces:**
- Consumes: `computeProjection` (Task 9)
- Produces: `HomeTripInput.hardEndDate?: string | null`

- [ ] **Step 1: Write the failing tests.** Create `lib/next-steps-loader.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  stop: { findMany: vi.fn(), count: vi.fn() },
  transport: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  chapter: { count: vi.fn() },
  checklistItem: { count: vi.fn() },
}));
const getTripProjection = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(async () => ({})) }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: vi.fn(async () => "eu") }));
vi.mock("@/server/actions/stops", () => ({ getTripProjection }));

import { loadNextSteps } from "./next-steps-loader";

beforeEach(() => {
  vi.clearAllMocks();
  db.trip.findUnique.mockResolvedValue({
    startDate: "2026-12-04", endDate: "2026-12-20", hardEndDate: null, roundTrip: true, homeName: null, homeLat: null,
    homeLng: null, homeCountryCode: null, drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80, chaptersEnabled: false,
  });
  db.stop.findMany.mockResolvedValue([
    { id: "s1", name: "Paris", lat: null, lng: null, timezone: "Europe/Paris", arriveDate: "2026-12-04", departDate: "2026-12-08", sortOrder: 0, nights: 4, pinned: false },
    { id: "s2", name: "Lyon", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1, nights: 2, pinned: false },
  ]);
  db.transport.findMany.mockResolvedValue([]);
  db.accommodation.findMany.mockResolvedValue([]);
  db.item.findMany.mockResolvedValue([]);
  db.chapter.count.mockResolvedValue(0);
  db.checklistItem.count.mockResolvedValue(0);
});

describe("loadNextSteps reads (spec 2026-10-06 §C)", () => {
  it("reads Stops and Transports once each, with no separate projection read", async () => {
    await loadNextSteps("trip-1", "2026-06-01");
    expect(db.stop.findMany).toHaveBeenCalledTimes(1);
    expect(db.stop.count).not.toHaveBeenCalled();
    expect(db.transport.findMany).toHaveBeenCalledTimes(1);
    expect(getTripProjection).not.toHaveBeenCalled();
  });
  it("returns [] outside planning / final prep without reading the plan", async () => {
    expect(await loadNextSteps("trip-1", "2027-01-01")).toEqual([]);
    expect(db.stop.findMany).not.toHaveBeenCalled();
  });
});
```
In `components/trip/home/phase-planning.test.tsx`:
- After line 59, add:
  ```ts
  // The projection is computed from the loader's own rows now (spec 2026-10-06 §C); lib/dates is mocked in this file, so stub it like getTripProjection was.
  vi.mock("@/lib/trip-projection", () => ({ computeProjection: vi.fn(() => ({ projectedEnd: null, hardEndDate: null, deadline: null })) }));
  ```
- Replace the tests at lines 171-184 ("scopes both stop queries…" and "scopes the rough-stop count…") with:
  ```ts
  it("reads every real-plan Stop once — dated, rough count and plan order all come from it (spec 2026-10-06 §C)", async () => {
    await renderPlanning();
    expect(stopFindManyMock).toHaveBeenCalledTimes(1);
    expect(stopFindManyMock.mock.calls[0][0]).toEqual(expect.objectContaining({ where: { tripId: "trip-1", forkId: null } }));
    expect(stopCountMock).not.toHaveBeenCalled();
    expect(getTripProjectionMock).not.toHaveBeenCalled();
  });
  ```
- Lines 279-291: remove the trailing `.mockResolvedValueOnce([]); // allStopsRaw — order irrelevant here`, keeping the first `mockResolvedValueOnce([...])` and ending it with `;`.
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run lib/next-steps-loader.test.ts components/trip/home/phase-planning.test.tsx`
Expected: FAIL. `stop.findMany` is called 2 times, `stop.count` is called, and `getTripProjection` is called.
- [ ] **Step 3: Implement.** In `lib/desktop-home-loader.ts`:
1. Line 35: replace the `getTripProjection` import with `import { computeProjection } from "@/lib/trip-projection";`. In the docblock (lines 11-12), replace "(and getTripProjection guards itself)" with "(the projection is computed from the rows read here, spec 2026-10-06 §C)".
2. In `HomeTripInput` (lines 55-68), add after `endDate`:
   ```ts
     /** For the projection's deadline (ADR 0068); omitted → none. */
     hardEndDate?: string | null;
   ```
3. Replace lines 123-226 (from `const base = tripPath(await tripSlugFor(tripId));` through the end of the `Promise.all`) with:
```ts
  const homeCurrency = trip.homeCurrency;

  // One wave (spec 2026-10-06 §C): every real-plan Stop in ONE read — the
  // dated list, the rough count and plan order all come from it — and the
  // projection below reuses these rows instead of reading them again.
  const [
    allStopsRaw,
    transports,
    accommodations,
    items,
    costs,
    exchangeRates,
    datedChaptersRaw,
    undatedChapterCount,
    packingCount,
    pretripCount,
    slug,
  ] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, country: true, countryCode: true, lat: true, lng: true, timezone: true,
        arriveDate: true, departDate: true, sortOrder: true, nights: true, pinned: true,
      },
    }),
    /* old lines 171-184: transport findMany, verbatim */,
    /* old lines 185-188: accommodation findMany, verbatim */,
    /* old lines 189-202: item findMany, verbatim */,
    /* old lines 203-207: cost findMany, verbatim */,
    /* old lines 208-211: exchangeRate findMany, verbatim */,
    /* old lines 212-223: both chaptersEnabled conditionals with their comment, verbatim */,
    /* old line 224: packing count, verbatim */,
    /* old line 225: pretrip count, verbatim */,
    tripSlugFor(tripId),
  ]);
  const base = tripPath(slug);
  const roughStopCount = allStopsRaw.filter((s) => s.arriveDate === null).length;
```
4. Replace old lines 232-235 (the `datedStops` / `planStops` assignments) with:
```ts
  const datedStops: HomeDatedStop[] = orderPlanStops(
    allStopsRaw
      .filter((s) => s.arriveDate !== null)
      .map((s) => ({
        id: s.id, name: s.name, country: s.country, lat: s.lat, lng: s.lng, timezone: s.timezone,
        arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder,
      })),
  );
  const planStops: HomePlanStop[] = orderPlanStops(
    allStopsRaw.map((s) => ({
      id: s.id, name: s.name, sortOrder: s.sortOrder, lat: s.lat, lng: s.lng, countryCode: s.countryCode,
      arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights,
    })),
  );
```
5. Replace old line 284 (`const projection = await getTripProjection(tripId);`) with:
```ts
    const projection = computeProjection({
      trip: { startDate: trip.startDate, hardEndDate: trip.hardEndDate ?? null, roundTrip: trip.roundTrip },
      stops: allStopsRaw,
      transports,
    });
```
`allStops: allStopsRaw` (old line 294) and `stopNameById` (old line 269) stay as they are; `allStopsRaw` is now the one read.

In `app/(app)/trips/[tripId]/page.tsx`, inside the trip select, add `hardEndDate: true,` after `endDate: true,`.

In `lib/next-steps-loader.ts`:
1. Replace line 25 with `import { computeProjection } from "@/lib/trip-projection";`.
2. In the trip select (lines 38-49), add `hardEndDate: true,` after `endDate: true,`.
3. Replace lines 58-106 (from `const tripBasePath = …` through `const flagStops …`) with:
```ts
  // One wave (spec 2026-10-06 §C): every real-plan Stop in one read (dated,
  // rough count and first/last all come from it) and the projection computed
  // from these same rows rather than getTripProjection's second round.
  const [allStopsRaw, transports, accommodations, items, undatedChapterCount, packingCount, pretripCount, slug] =
    await Promise.all([
      db.stop.findMany({
        where: { tripId, ...REAL_PLAN },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, name: true, lat: true, lng: true, timezone: true, arriveDate: true, departDate: true,
          sortOrder: true, nights: true, pinned: true,
        },
      }),
      /* old lines 83-86: transport findMany, verbatim */,
      /* old lines 87-90: accommodation findMany, verbatim */,
      /* old lines 91-94: item findMany, verbatim */,
      /* old lines 95-97: undated chapter count conditional, verbatim */,
      /* old line 98: packing count, verbatim */,
      /* old line 99: pretrip count, verbatim */,
      tripSlugFor(tripId),
    ]);
  const tripBasePath = tripPath(slug);
  const roughStopCount = allStopsRaw.filter((s) => s.arriveDate === null).length;
  const allStops = allStopsRaw.map((s) => ({ id: s.id, name: s.name }));
  const projection = computeProjection({ trip, stops: allStopsRaw, transports });

  const datedStops = orderPlanStops(
    allStopsRaw
      .filter((s) => s.arriveDate !== null)
      .map((s) => ({
        id: s.id, name: s.name, lat: s.lat, lng: s.lng, timezone: s.timezone,
        arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder,
      })),
  );
  const flagStops: FlagStop[] = datedStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" }));
```
The `buildTripNextSteps({...})` call (lines 108-129) is unchanged.
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run lib/next-steps-loader.test.ts components/trip/home "app/(app)/trips/[tripId]/page.test.tsx" lib/trips`
Expected: PASS.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/desktop-home-loader.ts lib/next-steps-loader.ts lib/next-steps-loader.test.ts components/trip/home/phase-planning.test.tsx "app/(app)/trips/[tripId]/page.tsx"
git commit -m "perf(home): one Stop read per loader; projection from rows

The Home planning loader and the trips-list Next steps loader each read
Stops three times plus getTripProjection's own trip/stop/transport reads
(audit P3). Each now reads Stops once and computes the projection from it;
the slug joins the batch.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Travelling Home and `/trips` loaders query in parallel  (spec §C)

**Files:**
- Modify: `lib/travelling-home-loader.ts:25, 55-187, 205-212, 413-421, 433-442`
- Modify: `lib/trips/trips-page-loader.ts:40-60, 130-139`
- Test: `components/trip/home/phase-travelling.test.tsx:288-315`, `lib/trips/trips-page-loader.test.ts`

**Interfaces:**
- Consumes: `titlesByDate` (`lib/day-titles.ts`); `effectiveTodayISO` (`lib/itinerary.ts`)
- Produces: nothing

- [ ] **Step 1: Write the failing tests.** In `phase-travelling.test.tsx`, replace the two tests at lines 288-315 with:
```tsx
  it("mounts DayIdeas (not NearbyWishlist) on a free-form day with the day's Stop's things to do", async () => {
    isFreeFormDayMock.mockReturnValue(true);
    pickDayPlanMock.mockReturnValue({ ...EMPTY_DAY, stop: { id: "stop-1" } });
    itemFindManyMock.mockResolvedValue([
      { id: "th1", title: "Residenz", category: "SIGHTSEEING", startTime: null, endTime: null, stopId: "stop-1" },
    ]);

    const tree = await PhaseTravelling({ tripId: "trip-1" });

    expect(findElementByType(tree, DayIdeas)).not.toBeNull();
    expect(findElementByType(tree, NearbyWishlist)).toBeNull();
    // Third item.findMany call: every Stop's things to do, in the main wave
    // (spec 2026-10-06 §C) — the day's Stop is picked in memory.
    const thingsToDoCall = itemFindManyMock.mock.calls[2][0];
    expect(thingsToDoCall.where).toEqual(expect.objectContaining({ tripId: "trip-1", forkId: null }));
    expect(thingsToDoCall.where).not.toHaveProperty("stopId", "stop-1");
  });

  it("reads Day titles and things to do in the same wave as the Stops (spec 2026-10-06 §C)", async () => {
    let release!: (v: unknown[]) => void;
    stopFindManyMock.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = PhaseTravelling({ tripId: "trip-1" });
    await vi.waitFor(() => expect(dayTitleFindManyMock).toHaveBeenCalled());
    expect(itemFindManyMock).toHaveBeenCalledTimes(3);
    release([]);
    await pending;
  });
```
In `lib/trips/trips-page-loader.test.ts`, append inside `describe("loadTripsPage")`:
```ts
  it("starts Your travels with the first wave, not after the hero's next step (spec 2026-10-06 §C)", async () => {
    let release!: (v: unknown) => void;
    m.findMany.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = loadTripsPage("u", TODAY);
    await vi.waitFor(() => expect(m.yourTravels).toHaveBeenCalledWith("u", TODAY));
    release([]);
    await pending;
  });
```
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run components/trip/home/phase-travelling.test.tsx lib/trips/trips-page-loader.test.ts`
Expected: FAIL. `dayTitle.findMany` is not called while the Stops are pending, and `yourTravels` is not called before the memberships resolve.
- [ ] **Step 3: Implement.** In `lib/travelling-home-loader.ts`:
1. Line 25: replace with `import { titlesByDate } from "@/lib/day-titles";`.
2. Just before line 55 (`const [stops, items, …] = await Promise.all([`), take the `db.stop.findMany({...})` call from lines 56-75 and hoist it as:
```ts
  // `.then((rows) => rows)`: one settled promise that both the batch and
  // Today's journal (which needs the Trip's own today) consume.
  const stopsPromise = db.stop
    .findMany({ /* old lines 57-74: the where/orderBy/select object with its comments, verbatim */ })
    .then((rows) => rows);
```
Change line 55's destructure to `const [stops, items, transports, accommodations, costs, chapters, wishlist, allAttachments, dayTitleRows, thingsToDoAll, todaysJournal] = await Promise.all([`, make the first entry `stopsPromise,`, and after the `db.attachment.findMany({...})` entry (ends line 186), append:
```ts
    // Today's Day title (CONTEXT.md "Day title") — through the Stop, so it
    // joins this wave (spec 2026-10-06 §C); resolved for today below.
    db.dayTitle.findMany({
      where: { stop: { tripId, ...REAL_PLAN } },
      select: { stopId: true, dayIndex: true, title: true },
    }),
    // Every Stop's things to do (ADR 0044); the day's Stop is picked below.
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true, startTime: true, endTime: true, stopId: true },
    }),
    // Today's journal (spec K) — never for a day still ahead (CONTEXT.md
    // "Journal"): before day 1 the Trip's real today hasn't arrived, so
    // there's nothing to load or write. The day journaled is today clamped
    // to the Trip's own range — the same day this Phase treats as "today".
    stopsPromise.then((rows) => {
      const tripToday = tripTodayISO(rows);
      return userId && tripToday >= startDate
        ? loadTodaysJournal(tripId, effectiveTodayISO(tripToday, startDate, endDate), userId)
        : null;
    }),
```
3. Replace lines 205-212 (`const todaysDayTitle = ( await loadDayTitles(…) ).get(effectiveDate)?.title ?? null;`) with:
```ts
  const todaysDayTitle =
    titlesByDate(
      stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })),
      dayTitleRows,
    ).get(effectiveDate)?.title ?? null;
```
4. Replace lines 414-421 (the `const thingsToDo = freeForm && dayStop ? await db.item.findMany(…) : [];` block) with:
```ts
  const thingsToDo =
    freeForm && dayStop
      ? thingsToDoAll
          .filter((t) => t.stopId === dayStop.id)
          .map(({ id, title, category, startTime, endTime }) => ({ id, title, category, startTime, endTime }))
      : [];
```
5. Delete lines 433-442 (the Today's journal comment and `const todaysJournal = …`). Its comment moved into the batch, and `todaysJournal` now comes from the destructure.

In `lib/trips/trips-page-loader.ts`, insert at the top of `loadTripsPage` (before line 41):
```ts
  // "Your travels" reads by userId alone, so it starts with the first wave
  // (spec 2026-10-06 §C) instead of after the hero's next step. Handlers are
  // attached now, so a failure is never unhandled; the page then shows the
  // map failure panel (I5) and hides the Tally (§9).
  const travelsPromise = loadYourTravels(userId, today).then(
    (travels) => ({ ok: true as const, travels }),
    (err: unknown) => {
      console.error("[trips] Your travels failed to load:", err);
      return { ok: false as const };
    },
  );
```
Replace lines 130-139 (`let stats … }`) with:
```ts
  let stats: TravelStats | null = null;
  let mapTrips: TravelMapTrip[] | null = null;
  const travelsResult = await travelsPromise;
  if (travelsResult.ok) {
    stats = travelsResult.travels.stats;
    mapTrips = travelsResult.travels.mapTrips.map((m) => ({ id: m.id, name: m.name, when: m.when, points: m.points, hue: hues.get(m.id) ?? "coral" }));
  }
```
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run components/trip/home lib/trips "app/(app)/trips/page.test.tsx"`
Expected: PASS.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/travelling-home-loader.ts lib/trips/trips-page-loader.ts components/trip/home/phase-travelling.test.tsx lib/trips/trips-page-loader.test.ts
git commit -m "perf(home,trips): Travelling Home and /trips in fewer waves

Travelling Home waited for Day titles, things to do and the Journal after
its batch; /trips loaded Your travels only after the hero's next step
(audit P3). They now join the first wave.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `/api/fx` drops its second read; geocode and FX fetches cached across instances  (spec §C, §U)

**Files:**
- Modify: `lib/fx.ts:15-21, 50-68, 131-183, 232`
- Modify: `app/api/fx/route.ts`
- Modify: `lib/geocode.ts:136-166`
- Create test: `app/api/fx/route.test.ts`
- Test: `lib/fx.test.ts`, `lib/geocode.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `ResolvedRate` gains `source: RateSource; stale: boolean`
  - `export const FX_FETCH_REVALIDATE_SECONDS = 60 * 60 * 12`
  - `export const GEOCODE_REVALIDATE_SECONDS = 60 * 60 * 24 * 30` (`lib/geocode.ts`)

- [ ] **Step 1: Write the failing tests.** Create `app/api/fx/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { exchangeRate: { findUnique, upsert } } }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(async () => ({})) }));
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

const HOUR = 60 * 60 * 1000;
const req = (q = "tripId=t1&base=eur"e=aud") => new NextRequest(`http://localhost/api/fx?${q}`);

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({});
});

describe("GET /api/fx (spec 2026-10-06 §C)", () => {
  it("a fresh stored rate answers from one read, with no Frankfurter call", async () => {
    findUnique.mockResolvedValue({ rate: 1.6, manual: false, fetchedAt: new Date(Date.now() - HOUR) });
    expect(await (await GET(req())).json()).toEqual({ rate: 1.6, source: "fetched", stale: false });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("a manual rate is reported as manual", async () => {
    findUnique.mockResolvedValue({ rate: 1.5, manual: true, fetchedAt: new Date(0) });
    expect(await (await GET(req())).json()).toEqual({ rate: 1.5, source: "manual", stale: false });
  });
  it("a stale rate whose refresh fails is reported stale", async () => {
    findUnique.mockResolvedValue({ rate: 1.4, manual: false, fetchedAt: new Date(Date.now() - 25 * HOUR) });
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await (await GET(req())).json()).toEqual({ rate: 1.4, source: "stale", stale: true });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
  it("a fresh fetch is stored and reported as fetched", async () => {
    findUnique.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rates: { AUD: 1.7 } }) });
    expect(await (await GET(req())).json()).toEqual({ rate: 1.7, source: "fetched", stale: false });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
  it("nothing stored and no network is none", async () => {
    findUnique.mockResolvedValue(null);
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await (await GET(req())).json()).toEqual({ rate: null, source: "none", stale: false });
  });
});
```
In `lib/fx.test.ts`, add `fetchRate, FX_FETCH_REVALIDATE_SECONDS` to the import. Update the seven `resolveRateForTrip` `toEqual` expectations:
- AUD→AUD: `{ rate: 1, persist: null, source: "same", stale: false }`
- manual: `{ rate: 1.6, persist: null, source: "manual", stale: false }`
- fresh fetch: `{ rate: 1.65, persist: { base: "EUR", quote: "AUD", rate: 1.65 }, source: "fetched", stale: false }`
- stale fallback: `{ rate: 1.5, persist: null, source: "stale", stale: true }`
- nothing: `{ rate: null, persist: null, source: "none", stale: false }`
- read-through fresh: `{ rate: 1.55, persist: null, source: "fetched", stale: false }`
- stale then fetched: `{ rate: 1.7, persist: { base: "AUD", quote: "JPY", rate: 1.7 }, source: "fetched", stale: false }`

Append:
```ts
describe("fetchRate cross-instance cache (spec 2026-10-06 §U)", () => {
  it("asks Next's data cache to keep Frankfurter answers for 12 hours", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { AUD: 1.6 } }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchRate("EUR", "AUD")).toBe(1.6);
    expect(fetchMock.mock.calls[0][1].next).toEqual({ revalidate: FX_FETCH_REVALIDATE_SECONDS });
    expect(FX_FETCH_REVALIDATE_SECONDS).toBe(43_200);
    vi.unstubAllGlobals();
  });
});
```
In `lib/geocode.test.ts`, add `GEOCODE_REVALIDATE_SECONDS` to the import and append:
```ts
describe("cross-instance cache (spec 2026-10-06 §U)", () => {
  it("asks Next's data cache to keep Nominatim answers for 30 days", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ lat: "48.8566", lon: "2.3522" }] });
    await geocodePlace("Paris");
    const [, options] = fetchMock.mock.calls[0];
    expect(options.next).toEqual({ revalidate: GEOCODE_REVALIDATE_SECONDS });
    expect(GEOCODE_REVALIDATE_SECONDS).toBe(2_592_000);
  });
});
```
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run app/api/fx lib/fx.test.ts lib/geocode.test.ts`
Expected: FAIL. `findUnique` is called 2 times, `source` is missing from `resolveRateForTrip`, `options.next` is undefined, and the constants are not exported.
- [ ] **Step 3: Implement.** In `lib/fx.ts`:
1. After `FX_STALE_AFTER_MS` (line 24), add:
```ts
/**
 * Frankfurter publishes once a working day; Next's data cache keeps an
 * answer this long across serverless instances (spec 2026-10-06 §U), under
 * the ExchangeRate row's own read-through. Not `use cache` (needs cacheComponents).
 */
export const FX_FETCH_REVALIDATE_SECONDS = 60 * 60 * 12;
```
2. Line 58: change the fetch to `const res = await fetch(url, { signal: controller.signal, next: { revalidate: FX_FETCH_REVALIDATE_SECONDS } });`.
3. Add to `ResolvedRate` (lines 131-136):
```ts
  /** What the rate is (spec 2026-10-06 §C) — the /api/fx response, with no second read. */
  source: RateSource;
  /** True only for a stale fallback after a failed refresh. */
  stale: boolean;
```
4. In `resolveRateForTrip`, make the returns:
   - line 156: `if (B === Q) return { rate: 1, persist: null, source: "same", stale: false };`
   - line 164: `return { rate: stored.rate, persist: null, source: "manual", stale: false };`
   - line 172: `return { rate: stored.rate, persist: null, source: "fetched", stale: false };`
   - line 178: `return { rate: fetched, persist: { base: B, quote: Q, rate: fetched }, source: "fetched", stale: false };`
   - line 182: replace with
     ```ts
       // Fetch failed — fall back to the stale stored rate if any.
       return stored
         ? { rate: stored.rate, persist: null, source: "stale", stale: true }
         : { rate: null, persist: null, source: "none", stale: false };
     ```
Replace `app/api/fx/route.ts` lines 1-4 imports with:
```ts
import { NextRequest, NextResponse } from "next/server";
import { requireTripAccess } from "@/lib/guards";
import { persistRate, resolveRateForTrip } from "@/lib/fx";
import { db } from "@/lib/db";
```
Replace lines 41-69 (from `// Fetch via the full orchestration` to the end of the function body) with:
```ts
  // One read (spec 2026-10-06 §C): resolveRateForTrip says what the rate is,
  // so the old re-read of the stored row to work out `source` is gone.
  const resolved = await resolveRateForTrip(tripId, B, Q, { db });
  if (resolved.persist) await persistRate(db, tripId, resolved.persist);

  return NextResponse.json({ rate: resolved.rate, source: resolved.source, stale: resolved.stale });
}
```
In `lib/geocode.ts`, above `const responseCache` (line 136), add:
```ts
/**
 * Next's data cache keeps a successful Nominatim/Photon answer this long
 * across serverless instances (spec 2026-10-06 §U); the in-memory map below
 * stays as the first level. Places don't move. Not `use cache` (needs cacheComponents).
 */
export const GEOCODE_REVALIDATE_SECONDS = 60 * 60 * 24 * 30;
```
In `cachedFetchJson`, change the `fetch(url, {…})` options (lines 154-157) to:
```ts
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: GEOCODE_REVALIDATE_SECONDS },
    });
```
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run app/api/fx lib/fx.test.ts lib/geocode.test.ts server/actions`
Expected: PASS. The server action tests mock `resolveRateForTrip` and only read `rate`/`persist`.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add lib/fx.ts lib/fx.test.ts app/api/fx/route.ts app/api/fx/route.test.ts lib/geocode.ts lib/geocode.test.ts
git commit -m "perf(fx,geocode): one FX read; external answers cached across instances

/api/fx re-read the stored rate just to label it; resolveRateForTrip now
returns the source. Geocode and FX lookups had only a per-lambda Map
(audit P21): fetches now carry next.revalidate (30 days / 12 hours).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Composite indexes migration  (spec §V)

**Files:**
- Modify: `prisma/schema.prisma:349-351 (Stop), 427-429 (Transport), 504-508 (Item), 670-672 (Reminder), 1012 (AccessRequest)`
- Create: `prisma/migrations/20261006120000_add_plan_order_indexes/migration.sql`
- Modify: `docs/open-follow-ups.md` (new section before line 605, `## Two migrations written on 2026-09-21 …`)
- Create test: `prisma/plan-order-indexes-migration.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Write the failing test.** Create `prisma/plan-order-indexes-migration.test.ts`:
```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA = readFileSync(join(__dirname, "schema.prisma"), "utf8");
const MIGRATION = join(__dirname, "migrations/20261006120000_add_plan_order_indexes/migration.sql");

function model(name: string): string {
  const start = SCHEMA.indexOf(`model ${name} {`);
  return SCHEMA.slice(start, SCHEMA.indexOf("\n}", start));
}

describe("plan-order indexes (spec 2026-10-06 §V, audit P23)", () => {
  it("is additive: five CREATE INDEX statements and nothing else", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/CREATE INDEX "Stop_tripId_forkId_sortOrder_idx" ON "Stop"\("tripId", "forkId", "sortOrder"\);/);
    expect(sql).toMatch(/CREATE INDEX "Transport_tripId_forkId_sortOrder_idx" ON "Transport"\("tripId", "forkId", "sortOrder"\);/);
    expect(sql).toMatch(/CREATE INDEX "Item_tripId_forkId_sortOrder_idx" ON "Item"\("tripId", "forkId", "sortOrder"\);/);
    expect(sql).toMatch(/CREATE INDEX "Reminder_tripId_date_idx" ON "Reminder"\("tripId", "date"\);/);
    expect(sql).toMatch(/CREATE INDEX "AccessRequest_resolvedAt_idx" ON "AccessRequest"\("resolvedAt"\);/);
    expect(sql).not.toMatch(/DROP|ALTER TABLE/i);
  });
  it("is reflected in schema.prisma", () => {
    for (const m of ["Stop", "Transport", "Item"]) expect(model(m)).toContain("@@index([tripId, forkId, sortOrder])");
    expect(model("Reminder")).toContain("@@index([tripId, date])");
    expect(model("AccessRequest")).toContain("@@index([resolvedAt])");
  });
});
```
- [ ] **Step 2: Run the test to confirm it fails**
Run: `npx vitest run prisma/plan-order-indexes-migration.test.ts`
Expected: FAIL. `existsSync` returns false.
- [ ] **Step 3: Implement.** In `prisma/schema.prisma`, add one line after each model's existing `@@index` lines:
  - Stop, after `@@index([chapterId])`: `@@index([tripId, forkId, sortOrder])`
  - Transport, after `@@index([anchorStopId])`: `@@index([tripId, forkId, sortOrder])`
  - Item, after `@@index([sourceMarkerId])`: `@@index([tripId, forkId, sortOrder])`
  - Reminder, after `@@index([stopId])`: `@@index([tripId, date])`
  - AccessRequest, after `@@index([status])`: `@@index([resolvedAt])`

If the docker-compose DB is running (`docker compose ps` shows postgres up), run `npx prisma migrate dev --create-only --name add_plan_order_indexes`. Then rename the generated folder to `20261006120000_add_plan_order_indexes`, compare its SQL with the block below, and use the block below. Otherwise create the folder by hand. Either way, `prisma/migrations/20261006120000_add_plan_order_indexes/migration.sql` must contain:
```sql
-- Composite indexes for the plan-order reads (spec 2026-10-06 §V, audit P23).
-- Every Plan/Day/Home read filters `tripId + forkId IS NULL ORDER BY
-- sortOrder` on Stop, Transport and Item, which had only single-column
-- indexes; Reminders are read by trip and date; the Admin queue counts
-- AccessRequests by `resolvedAt IS NULL`. Additive on reads and writes
-- (docs/DEPLOY.md §4b): no column, constraint or existing index changes.
CREATE INDEX "Stop_tripId_forkId_sortOrder_idx" ON "Stop"("tripId", "forkId", "sortOrder");
CREATE INDEX "Transport_tripId_forkId_sortOrder_idx" ON "Transport"("tripId", "forkId", "sortOrder");
CREATE INDEX "Item_tripId_forkId_sortOrder_idx" ON "Item"("tripId", "forkId", "sortOrder");
CREATE INDEX "Reminder_tripId_date_idx" ON "Reminder"("tripId", "date");
CREATE INDEX "AccessRequest_resolvedAt_idx" ON "AccessRequest"("resolvedAt");
```
Then run `npx prisma validate && npx prisma generate`. Insert this into `docs/open-follow-ups.md` immediately before the line `## Two migrations written on 2026-09-21 — applied in production 2026-09-21`:
```markdown
## One migration written on 2026-10-06 — NOT applied

`20261006120000_add_plan_order_indexes` (spec `docs/specs/2026-10-06-perf-ux-batch.md` §V,
audit P23) adds five indexes: `Stop`, `Transport`, `Item` on `(tripId, forkId, sortOrder)`,
`Reminder` on `(tripId, date)`, `AccessRequest` on `(resolvedAt)`. Additive on reads and
writes per `docs/DEPLOY.md` §4b — it opens no window. Written on branch
`chore/codebase-audit-2026-10-06` with no database access; **Cam applies it to production
before the deploy** and records the date here.
```
- [ ] **Step 4: Run the tests to confirm they pass**
Run: `npx vitest run prisma/plan-order-indexes-migration.test.ts && npx prisma validate`
Expected: PASS; "The schema at prisma/schema.prisma is valid".
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add prisma/schema.prisma prisma/migrations/20261006120000_add_plan_order_indexes prisma/plan-order-indexes-migration.test.ts docs/open-follow-ups.md
git commit -m "perf(db): composite indexes for plan-order reads

Stop/Transport/Item reads filter tripId + forkId and sort by sortOrder on
single-column indexes; Reminders by trip+date; the Admin queue counts by
resolvedAt with only status indexed (audit P23). One additive migration,
to be applied to production before deploy.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: `server-only` boundary, exact AWS SDK pin, lazy S3 driver  (spec §X)

**Files:**
- Modify: `package.json` (dependencies + the `tsx` scripts), `package-lock.json`
- Modify: `lib/db.ts:1`, `lib/storage.ts:22-33, 177-268`, `lib/auth.ts:1`, `lib/ai.ts:10-11`, `lib/push.ts:9-10`, `lib/mail.ts:8-9`
- Modify: `vitest.config.ts`, `vitest.integration.config.ts`, `prisma.config.ts` (seed), `docs/DEPLOY.md:456-457`, `scripts/verify-r2-presign.ts:10`
- Create: `test/server-only-stub.ts`
- Create test: `lib/server-only-boundary.test.ts`
- Modify test: `lib/storage.test.ts:298-330` + new cases

**Interfaces:**
- Consumes: nothing
- Produces: nothing new; the `Storage` interface and `getStorage()` are unchanged

- [ ] **Step 1: Write the failing tests.** Create `lib/server-only-boundary.test.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// spec 2026-10-06 §X: a client import of any of these is a build error, not
// a leaked secret. `import "server-only"` must be each file's first import.
const FILES = ["lib/db.ts", "lib/storage.ts", "lib/auth.ts", "lib/ai.ts", "lib/push.ts", "lib/mail.ts"];

describe("server-only boundary", () => {
  it.each(FILES)("%s imports server-only before anything else", (file) => {
    const src = readFileSync(path.resolve(__dirname, "..", file), "utf8");
    const firstImport = src.split("\n").find((line) => /^import\b/.test(line));
    expect(firstImport).toBe('import "server-only";');
  });

  it("pins @aws-sdk/client-s3 to the presigner's exact version", () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
    expect(pkg.dependencies["@aws-sdk/client-s3"]).toBe(pkg.dependencies["@aws-sdk/s3-request-presigner"]);
    expect(pkg.dependencies["@aws-sdk/client-s3"]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```
In `lib/storage.test.ts`, add `import { readFileSync } from "node:fs";` to the imports. After `const getSignedUrlMock = vi.fn();` (line 299), add `const s3ClientCtorMock = vi.fn();`. Change the mocked `S3Client` class (lines 302-304) to:
```ts
  class S3Client {
    send = sendMock;
    constructor(config: unknown) {
      s3ClientCtorMock(config);
    }
  }
```
Append inside `describe("S3-compatible storage (R2 driver)")`:
```ts
  it("builds no S3 client until the first storage call, then reuses it (spec 2026-10-06 §X)", async () => {
    s3ClientCtorMock.mockClear();
    sendMock.mockResolvedValue({});
    const { getStorage } = await import("./storage");
    const storage = getStorage();
    expect(s3ClientCtorMock).not.toHaveBeenCalled();
    await storage.delete("trips/t1/a.png");
    await storage.delete("trips/t1/b.png");
    expect(s3ClientCtorMock).toHaveBeenCalledTimes(1);
  });

  it("imports the AWS SDK only lazily (pattern: lib/ai.ts getClient)", () => {
    const src = readFileSync(path.join(__dirname, "storage.ts"), "utf8");
    expect(src).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+"@aws-sdk\//m);
  });
```
- [ ] **Step 2: Run the tests to confirm they fail**
Run: `npx vitest run lib/server-only-boundary.test.ts lib/storage.test.ts`
Expected: FAIL. The first import isn't `"server-only"`, the versions differ (`^3.700.0`), and `s3ClientCtorMock` is called during `getStorage()`.
- [ ] **Step 3: Implement.**
1. Install and pin:
```bash
npm install server-only
npm install --save-exact @aws-sdk/client-s3@3.1073.0
```
2. Create `test/server-only-stub.ts`:
```ts
// vitest stand-in for the `server-only` package (spec 2026-10-06 §X). Its
// real entry throws outside the react-server condition; tests are not a
// client bundle, so they get this empty module — the same move Next's own
// Jest guide makes (node_modules/next/dist/docs/01-app/02-guides/testing/jest.md).
export {};
```
In `vitest.config.ts`, change the alias block to:
```ts
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
```
In `vitest.integration.config.ts`, change `resolve` to `resolve: { alias: { '@': path.resolve(__dirname, '.'), 'server-only': path.resolve(__dirname, 'test/server-only-stub.ts') } },`.
3. Add `import "server-only";` as the first import line of each file:
   - `lib/db.ts`: new line 1, above `import { PrismaClient } …`
   - `lib/auth.ts`: new line 1, above `import NextAuth …`
   - `lib/ai.ts`: after the docblock, above `import { z } from "zod";` (line 12)
   - `lib/push.ts`: after the docblock (line 9), before the "Env gate" banner
   - `lib/mail.ts`: after the docblock (line 8), before `export interface MailMessage`
   - `lib/storage.ts`: after the docblock, above `import fs …` (line 24)
4. Lazy S3 driver. In `lib/storage.ts`, replace lines 26-33 (the two `@aws-sdk` imports) with:
```ts
// Type-only: the SDK itself loads on the first S3/R2 call (spec 2026-10-06
// §X, same pattern as lib/ai.ts getClient), so local-disk dev and every
// route that never touches storage skip ~1 MB of SDK at cold start.
import type { S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
```
Replace `makeS3Storage` (lines 177-268) with:
```ts
/**
 * Build an S3-compatible Storage for the given driver from env vars.
 *   - "r2": Cloudflare R2. Endpoint derived from the account id; region "auto".
 *   - "s3": AWS S3. Region from AWS_REGION; default AWS endpoint.
 * Env vars are read now (a misconfiguration throws from getStorage(), as
 * before); the SDK and the client are created on the first call.
 */
function makeS3Storage(driver: "r2" | "s3"): Storage {
  let config: S3ClientConfig;
  let bucket: string;

  if (driver === "r2") {
    const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
    bucket = requireEnv("R2_BUCKET_NAME");
    config = {
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    };
  } else {
    bucket = requireEnv("S3_BUCKET_NAME");
    config = {
      region: requireEnv("AWS_REGION"),
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
      },
    };
  }

  const sdk = () => import("@aws-sdk/client-s3");
  let clientPromise: Promise<S3Client> | null = null;
  const getClient = () => (clientPromise ??= sdk().then(({ S3Client }) => new S3Client(config)));

  return {
    async save(key, data, mime) {
      const [{ PutObjectCommand }, client] = await Promise.all([sdk(), getClient()]);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.isBuffer(data) ? data : Buffer.from(data),
          ContentType: mime,
        }),
      );
    },

    async delete(key) {
      // S3/R2 DeleteObject is idempotent — deleting a missing key succeeds.
      const [{ DeleteObjectCommand }, client] = await Promise.all([sdk(), getClient()]);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async read(key) {
      const [{ GetObjectCommand }, client] = await Promise.all([sdk(), getClient()]);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!res.Body) return null;
        const bytes = await res.Body.transformToByteArray();
        return Buffer.from(bytes);
      } catch (err: unknown) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async presignDownload(key, opts) {
      // The Response* params are part of the signature, so the values the
      // serve routes decide on (MIME, disposition, caching) can't be
      // tampered with by whoever holds the URL. R2 supports SigV4 presigned
      // GETs and these response-header overrides via its S3-compatible API.
      const [{ GetObjectCommand }, { getSignedUrl }, client] = await Promise.all([
        sdk(),
        import("@aws-sdk/s3-request-presigner"),
        getClient(),
      ]);
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: opts.contentType,
          ResponseContentDisposition: opts.contentDisposition,
          ResponseCacheControl: opts.cacheControl,
        }),
        { expiresIn: opts.expiresIn },
      );
    },

    async copy(srcKey, destKey) {
      const [{ CopyObjectCommand }, client] = await Promise.all([sdk(), getClient()]);
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${srcKey}`,
          Key: destKey,
        }),
      );
    },
  };
}
```
5. Scripts. `server-only`'s default entry throws under plain Node, so every `tsx` entry point that imports `lib/db` or `lib/storage` must run with the react-server condition. In `package.json`, change these scripts to start with `tsx --conditions=react-server`: `backfill:geocode`, `backfill:cover-aspect`, `sweep:orphaned-costs`, `sweep:blobs`, `feedback:pull`, `feedback:resolve`, `feedback:accept`, `db:seed`, `db:seed:demo`, `db:seed:real`, `db:seed:real:dry`. For example: `"feedback:pull": "tsx --conditions=react-server scripts/feedback-pull.ts"`. Leave `audit:*` alone. In `prisma.config.ts`, set `seed: "tsx --conditions=react-server prisma/seed.ts"`. In `docs/DEPLOY.md` lines 456-457 and the usage line in `scripts/verify-r2-presign.ts:10`, change `npx tsx` to `npx tsx --conditions=react-server`.
- [ ] **Step 4: Run the tests to confirm they pass, then check the script and build paths**
Run: `npx vitest run lib/server-only-boundary.test.ts lib/storage.test.ts lib/storage.presign.test.ts lib/db.test.ts lib/push.test.ts`
Expected: PASS.
Run: `DATABASE_URL=postgres://u@localhost:5432/x npx tsx --conditions=react-server -e 'import("./lib/db.ts").then(() => import("./lib/storage.ts")).then((m) => console.log(typeof m.getStorage))'`
Expected: prints `function`. That proves `server-only` resolves to its empty entry under the scripts' condition.
Run: `npx vitest run`
Expected: whole suite green.
Run: `npm run build`. It needs the usual `.env`; if none exists locally, note that in the commit body instead of skipping silently.
Expected: success. If the build reports `server-only` reached from `proxy.ts` (via `lib/trip-ref.ts → lib/db.ts`) or from any client module, stop and report the chain. Do not remove the import.
- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json lib/db.ts lib/storage.ts lib/storage.test.ts lib/auth.ts lib/ai.ts lib/push.ts lib/mail.ts lib/server-only-boundary.test.ts test/server-only-stub.ts vitest.config.ts vitest.integration.config.ts prisma.config.ts docs/DEPLOY.md scripts/verify-r2-presign.ts
git commit -m "chore(platform): server-only boundary, exact AWS pin, lazy S3 SDK

server-only turns a future client import of db/storage/auth/ai/push/mail
into a build error. client-s3 was caret-ranged against an exact-pinned
presigner; both now pin 3.1073.0. The S3 driver loads the SDK on first
use like lib/ai.ts. tsx scripts run with --conditions=react-server so
server-only resolves to its empty entry there.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Section self-check

- **§A**
  - Warm timestamp per Trip: already in `lib/offline-status.ts` as `savedAt`, persisted with try/catch. Task 2 makes only page-warming runs update it, and documents it as the spec's `warmedAt`.
  - Skip pages within 6 h unless "Save again", and skip Save-Data/2G: Tasks 1 and 2.
  - Travelling day window, pure, takes `today`: Task 1, wired into the layout in Task 3.
  - Settings "Saved {relative time}": already shipped in `components/trip/settings/saved-for-offline.tsx` ("Saved for offline · 2h ago"). No task.
  - Deviation: "Save again" still runs on a constrained connection, so the button is never a silent no-op.
- **§B**: Task 4. No `scope` parameter (the Day view is real-plan only by policy). The Journal reads stay per date. Accommodations are read trip-wide and filtered per date in `projectDay`.
- **§C**
  - Plan page: Task 5.
  - Trip Home and the cached membership helper: Tasks 6 and 7.
  - App layout and parallel reconcile: Task 6.
  - Trip layout (slug, capped warm list): Task 3.
  - Checklists and Wishlist: Task 8.
  - Summary and `computeProjection`: Task 9.
  - Desktop Home and Next steps loaders: Task 10.
  - Travelling Home and `/trips` loaders: Task 11.
  - `/api/fx`: Task 12.
  - Query-count / one-wave tests: one per page or loader in those tasks.
  - Deviation: Plan and Wishlist keep the Fork lookup serial inside the gate, because an existing test requires no `fork.findFirst` when variants are off.
- **§U**: Task 12. The Photon client (typeahead spec) reuses `cachedFetchJson`, so it gets the same `revalidate` automatically.
- **§V**: Task 13. Hand-written SQL, unless the docker DB lets `migrate dev --create-only` confirm it.
- **§X**: Task 14 covers `server-only` in the six files, the exact `client-s3` pin and the lazy S3 driver. Risk: `tsx` scripts need `--conditions=react-server`; `next build` is the final check for the proxy import path.
- Line numbers checked against the tree at 54eec3f7. Spec/audit references still match: `schema.prisma` 349/427/504/670/1012 and `fx.ts:58`. `geocode.ts:136` is the cache declaration; the fetch is at line 154.

---

# Section 3 — UX (spec §E, §F, §G, §K, §L, §M, §N, §O, §W)

Notes for every task:
- **Test command.** Run tests as `TZ=UTC npx vitest run <file>`. `package.json` `"test"` sets `TZ=UTC`, and the §G test depends on it.
- **Commit footer.** These tasks use `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, which is what this session's attribution reminder requires. RULES.md says "Claude Fable 5.1"; see the self-check.

---

### Task 31: Failure-toast helpers + Item dialog delete  (spec §E)

**Files:**
- Create: `components/ui/action-failure.ts`
- Create: `components/ui/action-failure.test.ts`
- Modify: `components/trip/item-form-dialog.tsx:612-634` (`handleDelete` in `ItemForm`), plus imports at lines 3-39
- Test: `components/trip/item-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `failureMessage`, `OFFLINE_MESSAGE` (`components/ui/failure-message.ts`), `toast` (`components/ui/use-toast.ts`), `FieldErrors` (`lib/action-result.ts`)
- Produces:
  - `export const SOMETHING_WENT_WRONG: string`
  - `export function firstErrorMessage(errors: FieldErrors | undefined, fallback: string): string`
  - `export function toastRefused(reason: FieldErrors | string | undefined, fallback: string): void`
  - `export function toastRejected(fallback?: string): void`

- [ ] **Step 1: Write the failing tests**

`components/ui/action-failure.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import { firstErrorMessage, toastRefused, toastRejected, SOMETHING_WENT_WRONG } from "./action-failure";
import { OFFLINE_MESSAGE } from "./failure-message";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, writable: true, configurable: true });
}

afterEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});

describe("firstErrorMessage", () => {
  it("returns the first message across every field", () => {
    expect(firstErrorMessage({ name: [], _: ["Only the trip owner can delete a Stop."] }, "fallback")).toBe(
      "Only the trip owner can delete a Stop.",
    );
  });
  it("falls back when there is no message", () => {
    expect(firstErrorMessage({}, "fallback")).toBe("fallback");
    expect(firstErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("toastRefused", () => {
  it("toasts the server's own words from a field-error dict", () => {
    toastRefused({ _: ["Nope."] }, "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Nope." });
  });
  it("toasts a plain string reason as-is", () => {
    toastRefused("File is someone else's.", "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "File is someone else's." });
  });
  it("uses the fallback when there's no reason", () => {
    toastRefused(undefined, "Couldn't do that.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't do that." });
  });
});

describe("toastRejected", () => {
  it("online: the caller's wording (default: nothing was changed)", () => {
    toastRejected();
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: SOMETHING_WENT_WRONG });
  });
  it("offline: names the connection", () => {
    setOnline(false);
    toastRejected("Couldn't delete that cost.");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: OFFLINE_MESSAGE });
  });
});
```

In `components/trip/item-form-dialog.test.tsx`, add this after the existing `vi.mock("@/lib/image-compress", …)` block (around line 25):
```ts
vi.mock("@/components/ui/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/use-toast")>()),
  toast: vi.fn(),
}));
import { toast } from "@/components/ui/use-toast";
```
Then add this inside `describe("ItemFormDialog")`, after the "keeps the dialog open and shows an error when deleteItem rejects" test (around line 849):
```ts
  it("keeps the dialog open and toasts the server's reason when deleteItem refuses (spec 2026-10-06 §E)", async () => {
    (deleteItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _: ["Only Travellers on this trip can delete it."] },
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} item={existingItem} />);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /delete "museum visit"\?/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", title: "Only Travellers on this trip can delete it." }),
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: /^delete$/i })).not.toBeDisabled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/ui/action-failure.test.ts components/trip/item-form-dialog.test.tsx -t "action-failure|refuses"`
Expected: FAIL. The first file fails with "Failed to resolve import './action-failure'". The item test fails because `toast` is never called.

- [ ] **Step 3: Implement**

`components/ui/action-failure.ts`:
```ts
"use client";

import { toast } from "@/components/ui/use-toast";
import { failureMessage } from "@/components/ui/failure-message";
import type { FieldErrors } from "@/lib/action-result";

/** The one wording for a rejected change (network drop, thrown server error). */
export const SOMETHING_WENT_WRONG = "Something went wrong — nothing was changed. Try again.";

/** The first message across every field of a failed result, else the fallback. */
export function firstErrorMessage(errors: FieldErrors | undefined, fallback: string): string {
  const first = errors ? Object.values(errors).flat()[0] : undefined;
  return first ?? fallback;
}

/**
 * The action answered `success: false` (spec 2026-10-06 §E): say what the
 * server said — a field-error dict or a plain `error` string — else the
 * fallback. The server answered, so the connection is not the reason.
 */
export function toastRefused(reason: FieldErrors | string | undefined, fallback: string): void {
  const title = typeof reason === "string" ? reason : firstErrorMessage(reason, fallback);
  toast({ variant: "destructive", title });
}

/**
 * The action rejected (network drop, thrown server error): the caller's
 * wording, or the offline message when the device is offline (ADR 0016).
 */
export function toastRejected(fallback: string = SOMETHING_WENT_WRONG): void {
  toast({ variant: "destructive", title: failureMessage(fallback) });
}
```

In `components/trip/item-form-dialog.tsx`, add this import after line 25 (`import { useConfirm } …`):
```ts
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
```
Then replace `handleDelete` (lines 612-634) with:
```ts
  const DELETE_FAILED = "Couldn't delete this Item. Try again.";

  async function handleDelete() {
    if (!item) return;
    const ok = await confirm({
      title: `Delete "${item.title}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteItem(item.id);
      if (result.success) {
        onSaved?.();
        onClose();
      } else {
        // Refused (e.g. stale access): the dialog stays open and usable (spec §E).
        toastRefused(result.errors, DELETE_FAILED);
      }
    } catch {
      setDeleteError(DELETE_FAILED);
      toastRejected(DELETE_FAILED);
    } finally {
      setDeleting(false);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/ui/action-failure.test.ts components/trip/item-form-dialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/ui/action-failure.ts components/ui/action-failure.test.ts components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx
git commit -m "fix(items): toast when deleting an Item is refused

Spec 2026-10-06 §E: deleteItem resolving success:false was ignored, so the
dialog sat there with no word. Adds shared toastRefused/toastRejected helpers
(offline wording included) and uses them here.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 32: Plan editor — chapter delete, accommodation delete, adjust dates  (spec §E)

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`: imports (lines 68-69), `handleDeleteChapter` (987-1005), `handleDeleteAccommodation` (1047-1065), `handleSaveAdjustDates` (1192-1214). The spec cites 998/1058/1202; those are the `await` lines inside these handlers.
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `toastRefused` (Task 31). The file-local `toastRejected()` at line 500 stays as it is.
- Produces: nothing

- [ ] **Step 1: Write the failing tests**

Add these to `components/trip/itinerary-manager.test.tsx`. Line 27 already imports and mocks `setStopDates` (`vi.mock` stops), so this only extends the import on line 175:
```ts
import { deleteStop, moveStop, firmUpSegment, firmUpTrip, createStop, reorderStops, setStopDates } from "@/server/actions/stops";
import { createAccommodation, deleteAccommodation } from "@/server/actions/accommodation";
```
(This replaces the existing lines 175 and 177.) Then append:
```ts
describe("no silent failures in the plan editor (spec 2026-10-06 §E)", () => {
  const ROME_STAY = makeStop({
    id: "s1", name: "Rome", arriveDate: "2026-07-10", departDate: "2026-07-13",
    accommodations: [{ id: "acc-1", stopId: "s1", name: "Hotel Roma", checkIn: "2026-07-10", checkOut: "2026-07-13", checkInTime: "14:00", costs: [] }],
  });

  it("toasts the server's reason when deleteChapter refuses", async () => {
    vi.mocked(deleteChapter).mockResolvedValueOnce({ success: false, errors: { _: ["Couldn't find that chapter."] } });
    const user = userEvent.setup();
    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[]}
        chapters={[{ id: "ch-empty", name: "Asia", colour: "rose" as const, startDate: null, endDate: null, sortOrder: 0 }]} />,
    );
    await user.click(desktop().getByRole("button", { name: "Remove Asia chapter" }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Couldn't find that chapter." })),
    );
  });

  it("toasts the server's reason when deleteAccommodation refuses", async () => {
    vi.mocked(deleteAccommodation).mockResolvedValueOnce({ success: false, errors: { _: ["That stay was already removed."] } });
    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[ROME_STAY]} />, ["s1"]);
    await user.click(desktop().getByRole("button", { name: "Hotel Roma" }));
    const stay = await screen.findByRole("dialog", { name: "Staying in Rome" });
    await user.click(within(stay).getByRole("button", { name: "Delete Hotel Roma" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "That stay was already removed." })),
    );
  });

  it("keeps the Adjust dates dialog open and toasts when setStopDates refuses", async () => {
    vi.mocked(setStopDates).mockResolvedValueOnce({ success: false, errors: { departDate: ["Depart date must be on or after arrive date"] } });
    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS]} />);
    await user.click(desktop().getByRole("button", { name: "More actions for Paris" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Adjust dates/ }));
    const dialog = await screen.findByRole("dialog", { name: /Adjust dates — Paris/ });
    await user.click(within(dialog).getByRole("button", { name: "Save dates" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", title: "Depart date must be on or after arrive date" }),
      ),
    );
    expect(screen.getByRole("dialog", { name: /Adjust dates — Paris/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/trip/itinerary-manager.test.tsx -t "no silent failures"`
Expected: FAIL. `toast` is not called, and the Adjust dates dialog closes.

- [ ] **Step 3: Implement**

After line 69 (`import { failureMessage } …`), add:
```ts
import { toastRefused } from "@/components/ui/action-failure";
```
In `handleDeleteChapter`, replace `await deleteChapter(chapterId);` with:
```ts
      const r = await deleteChapter(chapterId);
      if (!r.success) toastRefused(r.errors, "Couldn't remove that chapter.");
```
In `handleDeleteAccommodation`, replace `await deleteAccommodation(accId);` with:
```ts
      const r = await deleteAccommodation(accId);
      if (!r.success) toastRefused(r.errors, "Couldn't delete that stay.");
```
Then replace the whole of `handleSaveAdjustDates` with:
```ts
  async function handleSaveAdjustDates(
    stopId: string,
    dates: { arriveDate: string; departDate: string },
  ) {
    const stop = localStops.find((s) => s.id === stopId);
    const preSnapshot = localStops.map((s) => ({
      id: s.id, sortOrder: s.sortOrder, chapterId: s.chapterId, arriveDate: s.arriveDate, departDate: s.departDate,
    }));
    setPendingId(stopId);
    try {
      const r = await setStopDates(stopId, dates);
      if (!r.success) {
        // The dialog stays open so the dates can be fixed (spec 2026-10-06 §E).
        toastRefused(r.errors, "Couldn't change those dates.");
        return;
      }
      setLocalStops((prev) =>
        orderPlanStops(prev.map((s) => (s.id === stopId ? { ...s, ...dates } : s))),
      );
      setAdjustingStop(null);
      applyReorderResult(stop?.name ?? "Stop", r.changed, r.conflicts, preSnapshot, r.payload);
    } catch {
      toastRejected();
    } finally {
      setPendingId(null);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/trip/itinerary-manager.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "fix(plan): report refused chapter/stay deletes and re-dates

Spec 2026-10-06 §E: three plan-editor calls ignored success:false. A refused
re-date now keeps its dialog open so the dates can be fixed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 33: Cost, Wishlist idea and Globe Marker deletes  (spec §E)

**Files:**
- Modify: `components/trip/cost-editor.tsx:387-401` (`handleDelete`) and imports
- Modify: `components/trip/wishlist-board.tsx:131-146` (`handleDelete`) and imports
- Modify: `components/globe/globe-view.tsx:73-83` (`handleDelete`) and imports
- Test: `components/trip/cost-editor.test.tsx`, `components/trip/wishlist-board.test.tsx`, `components/globe/globe-view.test.tsx`

**Interfaces:**
- Consumes: `toastRefused`, `toastRejected` (Task 31)
- Produces: nothing

- [ ] **Step 1: Write the failing tests**

`components/trip/cost-editor.test.tsx`: add this after the costs mock (line 9):
```ts
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
```
Append this inside `describe("CostEditor")`:
```ts
  it("toasts when deleteCost refuses, and when it rejects (spec 2026-10-06 §E)", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[labeledCost]} />);
    vi.mocked(deleteCost).mockResolvedValueOnce({ success: false, errors: { _: ["Paid costs can't be deleted here."] } });
    await user.click(screen.getByRole("button", { name: /delete cost/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Paid costs can't be deleted here." }));

    vi.mocked(deleteCost).mockRejectedValueOnce(new Error("network"));
    await user.click(screen.getByRole("button", { name: /delete cost/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ variant: "destructive", title: "Couldn't delete that cost." }));
    expect(screen.getByText(/Train ticket/)).toBeInTheDocument();
  });
```

`components/trip/wishlist-board.test.tsx`: extend the `ItemCard` stub props (line 52) with `onDelete`, and render a delete button:
```tsx
  ItemCard: ({ item, onSchedule, onEdit, onDelete, placed, tone }: {
    item: { id: string; title: string };
    onSchedule?: (item: { id: string; title: string }) => void;
    onEdit?: (item: { id: string; title: string }) => void;
    onDelete?: (itemId: string) => void;
    placed?: boolean;
    tone?: string;
  }) => (
    <div data-testid={`stub-card-${item.id}`} data-tone={tone ?? "white"}>
      <span>{item.title}</span>
      {placed && <span data-testid={`placed-marker-${item.id}`}>in this plan</span>}
      {onEdit && (
        <button onClick={() => onEdit(item)}>Edit {item.title}</button>
      )}
      {onSchedule && (
        <button onClick={() => onSchedule(item)}>Schedule {item.title}</button>
      )}
      {onDelete && <button onClick={() => onDelete(item.id)}>Delete {item.title}</button>}
    </div>
  ),
```
Add `deleteItem` to the import on line 115 (`import { placeIdeaAtStop, deleteItem } from "@/server/actions/items";`) and append:
```ts
describe("WishlistBoard — delete failures (spec 2026-10-06 §E)", () => {
  it("toasts the server's reason when deleteItem refuses", async () => {
    vi.mocked(deleteItem).mockResolvedValueOnce({ success: false, errors: { _: ["That idea was already removed."] } });
    const user = userEvent.setup();
    const item = makeItem({ id: "item-del", date: null, startTime: null, endTime: null });
    renderBoard([item]);
    await user.click(await screen.findByRole("button", { name: `Delete ${item.title}` }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("That idea was already removed.")).toBeInTheDocument();
  });
});
```

`components/globe/globe-view.test.tsx`: change line 26 to `import { searchPlacesAction, deleteMarker } from "@/server/actions/globe";` and append:
```ts
describe("GlobeView — delete failures (spec 2026-10-06 §E)", () => {
  beforeEach(() => vi.clearAllMocks());
  it("toasts the server's reason when deleteMarker refuses", async () => {
    vi.mocked(deleteMarker).mockResolvedValueOnce({ success: false, errors: { _: ["Marker not found."] } });
    const user = userEvent.setup();
    render(<GlobeView markers={[mk("1", "Eiffel Tower", "France")]} members={[]} />);
    await user.click(screen.getByRole("button", { name: "Delete Eiffel Tower" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Marker not found." })),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/trip/cost-editor.test.tsx components/trip/wishlist-board.test.tsx components/globe/globe-view.test.tsx -t "spec 2026-10-06"`
Expected: FAIL. No toast and no toast text appear. The cost-editor rejection surfaces as an unhandled rejection.

- [ ] **Step 3: Implement**

In `components/trip/cost-editor.tsx`, add this import after line 24:
```ts
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
```
Replace the `try { await deleteCost(costId); } finally { … }` block in `handleDelete` with:
```ts
    try {
      const r = await deleteCost(costId);
      if (!r.success) toastRefused(r.errors, "Couldn't delete that cost.");
    } catch {
      toastRejected("Couldn't delete that cost.");
    } finally {
      setPendingDeleteId(null);
    }
```

In `components/trip/wishlist-board.tsx`, add this import after line 12:
```ts
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
```
Replace the `try { await deleteItem(itemId); } finally { … }` block with:
```ts
    try {
      const r = await deleteItem(itemId);
      if (!r.success) toastRefused(r.errors, "Couldn't delete that idea.");
    } catch {
      toastRejected("Couldn't delete that idea.");
    } finally {
      setPendingId(null);
    }
```

In `components/globe/globe-view.tsx`, add this import after line 17:
```ts
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
```
Replace the last two statements of `handleDelete` (`await deleteMarker(id); router.refresh();`) with:
```ts
    try {
      const r = await deleteMarker(id);
      if (!r.success) {
        toastRefused(r.errors, "Couldn't delete that marker.");
        return;
      }
    } catch {
      toastRejected("Couldn't delete that marker.");
      return;
    }
    router.refresh();
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/trip/cost-editor.test.tsx components/trip/wishlist-board.test.tsx components/globe/globe-view.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/trip/cost-editor.tsx components/trip/cost-editor.test.tsx components/trip/wishlist-board.tsx components/trip/wishlist-board.test.tsx components/globe/globe-view.tsx components/globe/globe-view.test.tsx
git commit -m "fix: report refused cost, idea and marker deletes

Spec 2026-10-06 §E: these confirm-then-delete flows ignored success:false;
cost-editor also had no catch, so a network drop became an unhandled
rejection.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 34: Attachment, Reminder and To-pay deletes  (spec §E)

**Files:**
- Modify: `components/trip/attachment-list.tsx:197-210` (`handleDelete`) and imports
- Modify: `components/trip/reminders-card.tsx:217-221` (`ReminderRow.handleDelete`) and imports
- Modify: `components/money/to-pay-panel.tsx:112-120` (`onDelete` in `rowProps`) and imports
- Test: `components/trip/attachment-list.test.tsx`, `components/trip/reminders-card.test.tsx`, `components/money/to-pay.test.tsx`

**Interfaces:**
- Consumes: `toastRefused`, `toastRejected` (Task 31)
- Produces: nothing

- [ ] **Step 1: Write the failing tests**

`components/trip/attachment-list.test.tsx`: add this after line 14:
```ts
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
```
Append inside `describe("AttachmentList")`:
```ts
  it("toasts the server's reason when deleteAttachment refuses (spec 2026-10-06 §E)", async () => {
    vi.mocked(deleteAttachment).mockResolvedValueOnce({ success: false, error: "You can't delete someone else's file." });
    const user = userEvent.setup();
    render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={sampleAttachments} />);
    await user.click(screen.getByRole("button", { name: /delete boarding-pass\.pdf/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "You can't delete someone else's file." }),
    );
  });
```

`components/trip/reminders-card.test.tsx`: add this after the reminders mock (line 21):
```ts
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
```
Append:
```ts
describe("RemindersCard delete failures (spec 2026-10-06 §E)", () => {
  it("toasts the server's reason when deleteReminder refuses", async () => {
    deleteReminderMock.mockResolvedValueOnce({ success: false, errors: { _: ["Couldn't find that reminder."] } });
    render(
      <RemindersCard tripId="trip-1" today={TODAY}
        reminders={[{ id: "r1", title: "Pack", date: "2026-11-29", stopId: null, stopName: null }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete reminder: Pack" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't find that reminder." }),
    );
  });
});
```

`components/money/to-pay.test.tsx`: append inside `describe("To pay (MONEY.md §4)")`:
```ts
  it("toasts the server's reason when deleting an Other cost is refused (spec 2026-10-06 §E)", async () => {
    actions.deleteCost.mockResolvedValueOnce({ success: false, errors: { _: ["That cost was already deleted."] } } as never);
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for Travel insurance" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete cost" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "That cost was already deleted." }),
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/trip/attachment-list.test.tsx components/trip/reminders-card.test.tsx components/money/to-pay.test.tsx -t "spec 2026-10-06"`
Expected: FAIL. `toast` is not called.

- [ ] **Step 3: Implement**

`components/trip/attachment-list.tsx`: add this import after line 24:
```ts
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
```
Replace the `startTransition` body in `handleDelete` with:
```ts
    startTransition(async () => {
      try {
        const r = await deleteAttachment(id);
        if (!r.success) toastRefused(r.error, "Couldn't delete that file.");
      } catch {
        toastRejected("Couldn't delete that file.");
      } finally {
        setDeletingId(null);
      }
    });
```

`components/trip/reminders-card.tsx`: add this import after line 13:
```ts
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
```
Replace `ReminderRow`'s `handleDelete` with:
```ts
  function handleDelete() {
    startTransition(async () => {
      try {
        const r = await deleteReminder(reminder.id);
        if (!r.success) toastRefused(r.errors, "Couldn't delete that reminder.");
      } catch {
        toastRejected("Couldn't delete that reminder.");
      }
    });
  }
```

`components/money/to-pay-panel.tsx`: add this import after line 9:
```ts
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
```
Replace the `onDelete` value in `rowProps` with:
```ts
      onDelete:
        row.ownerType === "OTHER"
          ? async () => {
              if (!(await confirm({ title: `Delete "${row.label}"?`, description: "This can't be undone.", confirmLabel: "Delete", destructive: true }))) return;
              try {
                const r = await deleteCost(row.id);
                if (!r.success) toastRefused(r.errors, "Couldn't delete that cost.");
              } catch {
                toastRejected("Couldn't delete that cost.");
              }
            }
          : undefined,
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/trip/attachment-list.test.tsx components/trip/reminders-card.test.tsx components/money/to-pay.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/trip/attachment-list.tsx components/trip/attachment-list.test.tsx components/trip/reminders-card.tsx components/trip/reminders-card.test.tsx components/money/to-pay-panel.tsx components/money/to-pay.test.tsx
git commit -m "fix: report refused file, reminder and To-pay deletes

Spec 2026-10-06 §E: each awaited its delete and ignored the result, so a
refusal looked like nothing happened.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 35: Calendar feed and Share-link panels  (spec §E)

**Files:**
- Modify: `components/trip/settings/calendar-feed-panel.tsx:49-106`. This covers `setType`, `setAlarm`, `handleCreate`, `handleRotate`, `handleRevoke` and `handleCopy`. The spec cites 90-96, which is rotate and revoke; the filter, alarm, create and copy calls have no error path either.
- Modify: `components/trip/settings/share-links-panel.tsx:170-200` (`CopyUrlBar`), plus the four `catch` toasts at 236-240, 263-266, 283-285 and 392-396
- Test: `components/trip/settings/calendar-feed-panel.test.tsx`, `components/trip/settings/share-links-panel.test.tsx`

**Interfaces:**
- Consumes: `toastRejected`, `SOMETHING_WENT_WRONG` (Task 31)
- Produces: `export function shareUrl(token: string): string` from `share-links-panel.tsx` (already defined at line 45, now exported; Task 46 uses it)

- [ ] **Step 1: Write the failing tests**

`components/trip/settings/calendar-feed-panel.test.tsx`: add this after the actions mock (line 12):
```ts
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
```
Add `revokeCalendarFeed` to the import list at lines 14-18, then append inside `describe("CalendarFeedPanel")`:
```ts
  it("reverts a filter tick and toasts when the save rejects (spec 2026-10-06 §E)", async () => {
    vi.mocked(updateCalendarFeedFilter).mockRejectedValueOnce(new Error("down"));
    const user = userEvent.setup();
    render(<CalendarFeedPanel tripId="trip-1" initialToken="tok-abc" />);
    const transport = screen.getByRole("checkbox", { name: "Transport" });
    await user.click(transport);
    await vi.waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't update the calendar feed. Try again." }),
    );
    expect(transport).toBeChecked();
  });

  it("keeps the feed and toasts when Revoke rejects (spec 2026-10-06 §E)", async () => {
    vi.mocked(revokeCalendarFeed).mockRejectedValueOnce(new Error("down"));
    const user = userEvent.setup();
    render(<CalendarFeedPanel tripId="trip-1" initialToken="tok-abc" />);
    await user.click(screen.getByRole("button", { name: /revoke/i }));
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.getByText(/\/api\/calendar\/tok-abc/)).toBeInTheDocument();
  });
```

`components/trip/settings/share-links-panel.test.tsx`: append:
```ts
describe("ShareLinksPanel failures (spec 2026-10-06 §E)", () => {
  it("toasts when copying the link fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    const user = userEvent.setup();
    render(<ShareLinksPanel tripId="trip-1" initialLinks={[link()]} />);
    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't copy the link." }),
    );
  });

  it("names the connection when a create rejects offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    createShareLink.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<ShareLinksPanel tripId="trip-1" initialLinks={[]} />);
    await user.click(screen.getByRole("button", { name: /new share link/i }));
    await user.type(screen.getByLabelText("Label"), "Mum & Dad");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "You're offline. Plan changes need a connection." }),
    );
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/trip/settings/calendar-feed-panel.test.tsx components/trip/settings/share-links-panel.test.tsx -t "spec 2026-10-06"`
Expected: FAIL. No toast fires, the checkbox stays unticked, and the offline case gets the generic wording.

- [ ] **Step 3: Implement**

`components/trip/settings/calendar-feed-panel.tsx`: add this import after line 13:
```ts
import { toastRejected } from "@/components/ui/action-failure";

const FEED_FAILED = "Couldn't update the calendar feed. Try again.";
```
Replace `setType`, `setAlarm`, `handleCreate`, `handleRotate`, `handleRevoke` and `handleCopy` with:
```ts
  const setType = (
    key: "includeTransport" | "includeAccommodation" | "includeActivities",
    value: boolean,
  ) => {
    const prev = filter;
    const next = { ...filter, [key]: value };
    setFilter(next);
    startTransition(async () => {
      try {
        await updateCalendarFeedFilter(tripId, next);
      } catch {
        setFilter(prev);
        toastRejected(FEED_FAILED);
      }
    });
  };

  const setAlarm = (
    key: "alarmTransport" | "alarmCheckOut",
    value: boolean,
  ) => {
    const prev = alarms;
    const next = { ...alarms, [key]: value };
    setAlarms(next);
    startTransition(async () => {
      try {
        await updateCalendarFeedAlarms(tripId, next);
      } catch {
        setAlarms(prev);
        toastRejected(FEED_FAILED);
      }
    });
  };
```
(Keep the `path` / `httpsUrl` / `webcalUrl` lines unchanged between these and the handlers below.)
```ts
  const handleCreate = () =>
    startTransition(async () => {
      try {
        setToken((await createCalendarFeed(tripId)).token);
      } catch {
        toastRejected(FEED_FAILED);
      }
    });
  const handleRotate = async () => {
    const confirmed = await confirm({
      title: "Regenerate calendar feed?",
      description:
        "This invalidates the current calendar URL — anyone subscribed will need the new link.",
      confirmLabel: "Regenerate",
      destructive: true,
    });
    if (!confirmed) return;
    startTransition(async () => {
      try {
        setToken((await rotateCalendarFeed(tripId)).token);
      } catch {
        toastRejected(FEED_FAILED);
      }
    });
  };
  const handleRevoke = () =>
    startTransition(async () => {
      try {
        await revokeCalendarFeed(tripId);
        setToken(null);
      } catch {
        toastRejected(FEED_FAILED);
      }
    });

  const handleCopy = async () => {
    if (!httpsUrl) return;
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastRejected("Couldn't copy the link.");
    }
  };
```

`components/trip/settings/share-links-panel.tsx`:
- Replace line 18 (`import { toast } …`) with `import { toastRejected } from "@/components/ui/action-failure";`.
- Line 45: `function shareUrl(` becomes `export function shareUrl(`.
- In `CopyUrlBar`, replace the `onClick` with:
```tsx
        onClick={() => {
          navigator.clipboard
            .writeText(shareUrl(token))
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => toastRejected("Couldn't copy the link."));
        }}
```
- In `handleSave`, `handleRotate`, `handleRevoke` (in `LinkRow`) and `handleCreate` (in `ShareLinksPanel`), replace each `toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });` with `toastRejected();`. That keeps the wording and adds the offline message.

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/trip/settings/calendar-feed-panel.test.tsx components/trip/settings/share-links-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/trip/settings/calendar-feed-panel.tsx components/trip/settings/calendar-feed-panel.test.tsx components/trip/settings/share-links-panel.tsx components/trip/settings/share-links-panel.test.tsx
git commit -m "fix(settings): calendar feed and share link failures speak up

Spec 2026-10-06 §E: feed actions had no error path at all and the share
link Copy had no catch. Rejections now toast (offline wording included) and
filter ticks roll back.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 36: `?add=` hook + Wishlist `?add=item` + Search "Add Item"  (spec §F)

**Files:**
- Create: `components/navigation/use-add-param.ts`
- Create: `components/navigation/use-add-param.test.tsx`
- Create: `components/trip/add-item-from-url.tsx`
- Create: `components/trip/add-item-from-url.test.tsx`
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx:301-320` (mount after `<PageHeader … />`)
- Modify: `app/(app)/trips/[tripId]/wishlist/page.test.tsx` (mock the new component)
- Modify: `components/command-palette-results.tsx:146-153` ("Add Item" href)
- Test: `components/command-palette.test.tsx`

**Interfaces:**
- Consumes: `ItemFormDialog` (`components/trip/item-form-dialog.tsx`), `StopOption`
- Produces:
  - `export function useAddParam(value: string): [open: boolean, setOpen: (open: boolean) => void]`
  - `export function AddItemFromUrl(props: { tripId: string; stops: StopOption[]; tripStartDate?: string | null; homeCurrency: string }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

`components/navigation/use-add-param.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/trips/t1/wishlist",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { useAddParam } from "./use-add-param";

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
});

describe("useAddParam (spec 2026-10-06 §F)", () => {
  it("opens for its value, then strips add (keeping other params) without scrolling", async () => {
    nav.search = "plan=f1&add=item";
    const { result } = renderHook(() => useAddParam("item"));
    expect(result.current[0]).toBe(true);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/trips/t1/wishlist?plan=f1", { scroll: false }));
  });

  it("stays closed for another value and leaves the URL alone", () => {
    nav.search = "add=cost";
    const { result } = renderHook(() => useAddParam("item"));
    expect(result.current[0]).toBe(false);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("closes through its setter", () => {
    nav.search = "add=item";
    const { result } = renderHook(() => useAddParam("item"));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
```

`components/trip/add-item-from-url.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "add=item" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/trips/t1/wishlist",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("./item-form-dialog", () => ({
  ItemFormDialog: ({ open, defaultUnscheduled }: { open: boolean; defaultUnscheduled?: boolean }) =>
    open ? <div role="dialog" aria-label="Add Item" data-unscheduled={String(defaultUnscheduled)} /> : null,
}));

import { AddItemFromUrl } from "./add-item-from-url";

describe("AddItemFromUrl (spec 2026-10-06 §F)", () => {
  it("opens the Item form as a Wishlist idea on ?add=item", () => {
    render(<AddItemFromUrl tripId="t1" stops={[]} homeCurrency="AUD" />);
    expect(screen.getByRole("dialog", { name: "Add Item" })).toHaveAttribute("data-unscheduled", "true");
  });
  it("stays closed without it", () => {
    nav.search = "";
    render(<AddItemFromUrl tripId="t1" stops={[]} homeCurrency="AUD" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

`components/command-palette.test.tsx`: append inside `describe("CommandPalette")`:
```ts
  it("Add Item opens the Wishlist with the Item form (?add=item)", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(await screen.findByText("Add Item"));
    expect(mockPush).toHaveBeenCalledWith("/trips/t1/wishlist?add=item", undefined);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/navigation/use-add-param.test.tsx components/trip/add-item-from-url.test.tsx components/command-palette.test.tsx`
Expected: FAIL. The two new modules can't be resolved, and the palette pushes `/trips/t1/wishlist`.

- [ ] **Step 3: Implement**

`components/navigation/use-add-param.ts`:
```ts
"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * `?add=<value>` opens a form (spec 2026-10-06 §F) — on arrival and on any
 * later client navigation that adds the param while mounted — then strips
 * `add` from the URL so a reload or Back doesn't reopen it. Tracked the
 * getDerivedStateFromProps way (compare during render, no setState in an
 * effect), as ItineraryManager's `?add=stop` handler does.
 */
export function useAddParam(value: string): [boolean, (open: boolean) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const addParam = searchParams?.get("add") ?? null;
  const [open, setOpen] = React.useState(false);
  const [seen, setSeen] = React.useState<string | null>(null);
  if (addParam !== seen) {
    setSeen(addParam);
    if (addParam === value) setOpen(true);
  }
  React.useEffect(() => {
    if (addParam !== value) return;
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("add");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [addParam, value, searchParams, router, pathname]);
  return [open, setOpen];
}
```

`components/trip/add-item-from-url.tsx`:
```tsx
"use client";

import { useAddParam } from "@/components/navigation/use-add-param";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";

/** `/wishlist?add=item` (Search's "Add Item") opens the Item form as a new idea (spec 2026-10-06 §F). */
export function AddItemFromUrl({
  tripId,
  stops,
  tripStartDate,
  homeCurrency,
}: {
  tripId: string;
  stops: StopOption[];
  tripStartDate?: string | null;
  homeCurrency: string;
}) {
  const [open, setOpen] = useAddParam("item");
  return (
    <ItemFormDialog
      tripId={tripId}
      stops={stops}
      tripStartDate={tripStartDate ?? undefined}
      defaultUnscheduled
      open={open}
      onOpenChange={setOpen}
      homeCurrency={homeCurrency}
    />
  );
}
```

`app/(app)/trips/[tripId]/wishlist/page.tsx`: add `import { AddItemFromUrl } from "@/components/trip/add-item-from-url";` after line 8, and insert this immediately after the closing `/>` of `<PageHeader … />` (line 320):
```tsx
      <AddItemFromUrl tripId={trip.id} stops={trip.stops} tripStartDate={trip.startDate} homeCurrency={trip.homeCurrency} />
```
`app/(app)/trips/[tripId]/wishlist/page.test.tsx`: add this after line 43:
```ts
vi.mock("@/components/trip/add-item-from-url", () => ({ AddItemFromUrl: () => null }));
```

`components/command-palette-results.tsx` line 150: change
`{ key: "do:add-item", label: "Add Item", href: tripPath(tripRef, "/wishlist") },`
to
`{ key: "do:add-item", label: "Add Item", href: tripPath(tripRef, "/wishlist?add=item") },`

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/navigation/use-add-param.test.tsx components/trip/add-item-from-url.test.tsx components/command-palette.test.tsx "app/(app)/trips/[tripId]/wishlist/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/navigation/use-add-param.ts components/navigation/use-add-param.test.tsx components/trip/add-item-from-url.tsx components/trip/add-item-from-url.test.tsx "app/(app)/trips/[tripId]/wishlist/page.tsx" "app/(app)/trips/[tripId]/wishlist/page.test.tsx" components/command-palette-results.tsx components/command-palette.test.tsx
git commit -m "feat(wishlist): Search's Add Item opens the Item form

Spec 2026-10-06 §F: the shortcut landed on the Wishlist with nothing open.
A shared useAddParam hook opens on ?add=<x> and strips it after.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 37: Phase-aware Other-cost defaults  (spec §K)

**Files:**
- Create: `lib/money/other-cost-defaults.ts`
- Create: `lib/money/other-cost-defaults.test.ts`
- Modify: `components/trip/other-cost-editor.tsx`: `FormState` (59-70), `defaultFormState` (72-84), `costToFormState` (86-104), the cost `onAmountChange` (226-235), the Paid checkbox `onChange` (256-271), the paid amount `onAmountChange` (295), and `OtherCostFormDialogProps` / `OtherCostFormDialog` (338-393)
- Test: `components/trip/other-cost-editor.test.tsx`

**Interfaces:**
- Consumes: `TripPhase` (`lib/trip-phase.ts`), `CostSettlement` (`lib/enums.ts`), `currencyForCountry` (`lib/currency-for-country.ts`)
- Produces:
  - `export interface OtherCostDefaults { currency: string; settlement: CostSettlement; paidToday: boolean }`
  - `export interface OtherCostDefaultsStop { arriveDate: string | null; departDate: string | null; countryCode: string | null }`
  - `export function otherCostDefaults(input: { phase: TripPhase; homeCurrency: string; today: string; stops: readonly OtherCostDefaultsStop[] }): OtherCostDefaults`
  - `OtherCostFormDialogProps.defaults?: OtherCostDefaults`

- [ ] **Step 1: Write the failing tests**

`lib/money/other-cost-defaults.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { otherCostDefaults } from "./other-cost-defaults";

const PARIS = { arriveDate: "2026-07-01", departDate: "2026-07-05", countryCode: "fr" };
const TOKYO = { arriveDate: "2026-07-05", departDate: "2026-07-09", countryCode: "jp" };

describe("otherCostDefaults (spec 2026-10-06 §K)", () => {
  it("before the trip: Home currency, Before you go, unpaid", () => {
    expect(otherCostDefaults({ phase: "planning", homeCurrency: "AUD", today: "2026-06-01", stops: [PARIS] }))
      .toEqual({ currency: "AUD", settlement: "BEFORE", paidToday: false });
  });
  it("past keeps today's defaults too", () => {
    expect(otherCostDefaults({ phase: "past", homeCurrency: "AUD", today: "2026-08-01", stops: [PARIS] }))
      .toEqual({ currency: "AUD", settlement: "BEFORE", paidToday: false });
  });
  it("travelling: today's Stop currency, On the trip, paid today", () => {
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-03", stops: [PARIS, TOKYO] }))
      .toEqual({ currency: "EUR", settlement: "ON_TRIP", paidToday: true });
  });
  it("a Changeover day spends in the Stop you arrive at", () => {
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-05", stops: [PARIS, TOKYO] }).currency).toBe("JPY");
  });
  it("travelling with no Stop today, or no known currency, falls back to Home currency", () => {
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-20", stops: [PARIS] }).currency).toBe("AUD");
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-03",
      stops: [{ ...PARIS, countryCode: null }] }).currency).toBe("AUD");
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-03",
      stops: [{ ...PARIS, countryCode: "vn" }] }).currency).toBe("AUD");
  });
});
```

`components/trip/other-cost-editor.test.tsx`: add `import { todayLocalISO } from "@/lib/dates";` after line 13, then append:
```ts
describe("OtherCostFormDialog Travelling defaults (spec 2026-10-06 §K)", () => {
  beforeEach(() => vi.clearAllMocks());
  const travelling = { currency: "EUR", settlement: "ON_TRIP" as const, paidToday: true };

  it("opens paid today, On the trip, in today's Stop currency — a spend is three taps", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog {...baseProps} defaults={travelling} />);
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Gelato");
    await user.type(screen.getByLabelText(/cost amount/i), "4.50");
    expect(screen.getByRole("radio", { name: "Paid on the trip" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /paid/i })).toBeChecked();
    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("4.50");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 450, paidMinor: 450, currency: "EUR", paidAt: todayLocalISO(), settlement: "ON_TRIP" }),
    );
  });

  it("every default stays editable", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog {...baseProps} defaults={travelling} />);
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Museum pass");
    await user.type(screen.getByLabelText(/cost amount/i), "30.00");
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    await user.click(screen.getByRole("radio", { name: "Paid before you go" }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 3000, paidMinor: undefined, paidAt: undefined, settlement: "BEFORE" }),
    );
  });

  it("an edited paid amount stops following the cost", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog {...baseProps} defaults={travelling} />);
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Dinner");
    await user.type(screen.getByLabelText(/cost amount/i), "50");
    const paid = screen.getByLabelText(/you paid amount/i);
    await user.clear(paid);
    await user.type(paid, "45");
    await user.type(screen.getByLabelText(/cost amount/i), "0");
    expect(paid).toHaveValue("45");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run lib/money/other-cost-defaults.test.ts components/trip/other-cost-editor.test.tsx -t "spec 2026-10-06"`
Expected: FAIL. The lib can't be resolved, and the dialog ignores `defaults` (the Paid box is unticked).

- [ ] **Step 3: Implement**

`lib/money/other-cost-defaults.ts`:
```ts
/**
 * The Other-cost form's starting values (spec 2026-10-06 §K). While
 * Travelling a spend is logged as it happens: today's Stop's currency
 * (Home currency when there's no Stop today or no known currency), Settlement
 * "On the trip", and paid today in full. Every other Phase keeps the plain
 * defaults. PURE — no React, no Prisma; every value stays editable in the form.
 */
import type { TripPhase } from "@/lib/trip-phase";
import type { CostSettlement } from "@/lib/enums";
import { currencyForCountry } from "@/lib/currency-for-country";

export interface OtherCostDefaults {
  currency: string;
  settlement: CostSettlement;
  /** Open with Paid ticked, dated today, and the paid amount following the cost. */
  paidToday: boolean;
}

export interface OtherCostDefaultsStop {
  arriveDate: string | null;
  departDate: string | null;
  /** ISO 3166-1 alpha-2, lower-case, as Stop.countryCode stores it. */
  countryCode: string | null;
}

export function otherCostDefaults({
  phase,
  homeCurrency,
  today,
  stops,
}: {
  phase: TripPhase;
  homeCurrency: string;
  today: string;
  stops: readonly OtherCostDefaultsStop[];
}): OtherCostDefaults {
  if (phase !== "travelling") return { currency: homeCurrency, settlement: "BEFORE", paidToday: false };
  // On a Changeover day two Stops claim today; the one you arrive at is where you're spending.
  const here = stops
    .filter((s) => s.arriveDate !== null && s.departDate !== null && s.arriveDate <= today && today <= s.departDate)
    .sort((a, b) => (a.arriveDate! < b.arriveDate! ? -1 : a.arriveDate! > b.arriveDate! ? 1 : 0))
    .at(-1);
  const currency = (here?.countryCode ? currencyForCountry(here.countryCode) : undefined) ?? homeCurrency;
  return { currency, settlement: "ON_TRIP", paidToday: true };
}
```

`components/trip/other-cost-editor.tsx`:

Add this import after line 31:
```ts
import type { OtherCostDefaults } from "@/lib/money/other-cost-defaults";
```
Add this field to `interface FormState`:
```ts
  /** While true, the paid amount mirrors the cost as it's typed (Travelling default, spec §K). */
  paidFollowsCost: boolean;
```
Replace `defaultFormState`:
```ts
const PLAIN_DEFAULTS = (homeCurrency: string): OtherCostDefaults => ({ currency: homeCurrency, settlement: "BEFORE", paidToday: false });

function defaultFormState(defaults: OtherCostDefaults): FormState {
  return {
    label: "",
    category: "",
    costAmount: "",
    paidAmount: "",
    currency: defaults.currency,
    paid: defaults.paidToday,
    // Interactive pre-fill the Traveller can see and edit, like ticking Paid (ADR 0037).
    paidAt: defaults.paidToday ? todayLocalISO() : "",
    dueDate: "",
    settlement: defaults.settlement,
    paidFollowsCost: defaults.paidToday,
  };
}
```
In `costToFormState`'s returned object, add `paidFollowsCost: false,` after `settlement`.

Replace the Cost `MoneyInput`'s `onAmountChange` with:
```tsx
              onAmountChange={(v) =>
                setForm((f) => ({
                  ...f,
                  costAmount: v,
                  ...(f.paidFollowsCost ? { paidAmount: v } : {}),
                  // Clearing the Cost box hides the Paid block (below), but
                  // state would otherwise persist invisibly — clear it too so
                  // a blank cost can never save alongside a stale paid amount.
                  // A paid-today default stays ticked; its amount follows.
                  ...(v.trim() === "" && !f.paidFollowsCost ? { paid: false, paidAmount: "", paidAt: "" } : {}),
                }))
              }
```
In the Paid checkbox's `setForm((f) => ({ … }))`, add `paidFollowsCost: checked && f.paidFollowsCost,` after `paid: checked,`.

Change the "You paid" `MoneyInput`'s `onAmountChange` to:
```tsx
                      onAmountChange={(v) => setForm((f) => ({ ...f, paidAmount: v, paidFollowsCost: false }))}
```
Add to `OtherCostFormDialogProps`:
```ts
  /** Starting values for a new cost (spec 2026-10-06 §K); omitted = Home currency, Before you go, unpaid. */
  defaults?: OtherCostDefaults;
```
Change the signature to `export function OtherCostFormDialog({ tripId, homeCurrency, cost, open, onOpenChange, defaults }: OtherCostFormDialogProps)` and the `initialState` prop to:
```tsx
      initialState={cost ? costToFormState(cost) : defaultFormState(defaults ?? PLAIN_DEFAULTS(homeCurrency))}
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run lib/money/other-cost-defaults.test.ts components/trip/other-cost-editor.test.tsx`
Expected: PASS. The existing tests still pass because the plain defaults are unchanged.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/money/other-cost-defaults.ts lib/money/other-cost-defaults.test.ts components/trip/other-cost-editor.tsx components/trip/other-cost-editor.test.tsx
git commit -m "feat(money): Travelling spends default to paid, on the trip, local currency

Spec 2026-10-06 §K: logging a coffee while away took ~7 interactions.
otherCostDefaults derives today's Stop currency, On the trip and paid today
from the Phase; every value stays editable.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 38: Money `?add=cost` with Phase defaults + Quick action "Add a cost"  (spec §F, §K)

**Files:**
- Create: `components/money/add-cost-from-url.tsx`
- Modify: `components/money/add-cost-button.tsx` (add a `defaults` prop)
- Modify: `components/money/money-header.tsx` (add a `costDefaults` prop and mount `AddCostFromUrl`)
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx`: imports, `header` (99-110), the stop `select` (154), after `today` (273), header calls at 341 and 398, and `AddCostButton` at 354
- Modify: `components/trip/home/quick-actions.tsx:30,36` ("Add a cost" href)
- Create: `components/trip/home/quick-actions.test.tsx`
- Test: `components/money/money-header.test.tsx`, `app/(app)/trips/[tripId]/budget/budget-page.test.tsx`

**Interfaces:**
- Consumes: `useAddParam` (Task 36), `OtherCostDefaults`, `otherCostDefaults` and `OtherCostFormDialogProps.defaults` (Task 37), `computeTripPhase` (`lib/trip-phase.ts`)
- Produces:
  - `export function AddCostFromUrl(props: { tripId: string; homeCurrency: string; defaults?: OtherCostDefaults }): JSX.Element`
  - `AddCostButtonProps.defaults?: OtherCostDefaults`
  - `MoneyHeaderProps.costDefaults?: OtherCostDefaults`

- [ ] **Step 1: Write the failing tests**

`components/money/money-header.test.tsx`: after line 8, add:
```ts
vi.mock("@/components/money/add-cost-from-url", () => ({
  AddCostFromUrl: ({ defaults }: { defaults?: { currency: string } }) => (
    <div data-testid="add-cost-from-url" data-currency={defaults?.currency ?? "none"} />
  ),
}));
```
Append inside `describe("MoneyHeader (MONEY.md §2)")`:
```ts
  it("mounts ?add=cost with the Phase defaults, only where a cost can be added (spec 2026-10-06 §F/§K)", () => {
    const { rerender } = render(<MoneyHeader {...base} costDefaults={{ currency: "EUR", settlement: "ON_TRIP", paidToday: true }} />);
    expect(screen.getByTestId("add-cost-from-url")).toHaveAttribute("data-currency", "EUR");
    rerender(<MoneyHeader {...base} showAddCost={false} />);
    expect(screen.queryByTestId("add-cost-from-url")).toBeNull();
  });
```

`app/(app)/trips/[tripId]/budget/budget-page.test.tsx`: after line 31, add:
```ts
vi.mock("@/components/money/add-cost-from-url", () => ({
  AddCostFromUrl: ({ defaults }: { defaults?: { currency: string; settlement: string } }) => (
    <div data-testid="add-cost-from-url" data-currency={defaults?.currency ?? "none"} data-settlement={defaults?.settlement ?? "none"} />
  ),
}));
```
Append:
```ts
describe("Money page — ?add=cost defaults (spec 2026-10-06 §K)", () => {
  it("while Travelling, a new cost defaults to today's Stop currency and On the trip", async () => {
    // todayISOInZone is mocked to 2026-01-05; TRIP runs 2026-01-01 → 2026-01-10.
    mockDb.stop.findMany.mockResolvedValue([
      { id: "s1", name: "Paris", timezone: "Europe/Paris", arriveDate: "2026-01-04", departDate: "2026-01-07", sortOrder: 0, countryCode: "fr" },
    ]);
    await renderPage();
    const mount = screen.getByTestId("add-cost-from-url");
    expect(mount).toHaveAttribute("data-currency", "EUR");
    expect(mount).toHaveAttribute("data-settlement", "ON_TRIP");
  });

  it("before the trip, the plain defaults", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, startDate: "2026-03-01", endDate: "2026-03-10" });
    await renderPage();
    expect(screen.getByTestId("add-cost-from-url")).toHaveAttribute("data-currency", "GBP");
  });
});
```

`components/trip/home/quick-actions.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a>,
}));

import { QuickActions } from "./quick-actions";

describe("QuickActions (spec 2026-10-06 §F)", () => {
  it("'Add a cost' opens the cost form on Money while Travelling", () => {
    render(<QuickActions tripId="t1" phase="travelling" />);
    expect(screen.getByRole("link", { name: "Add a cost" })).toHaveAttribute("href", "/trips/t1/budget?add=cost");
  });
  it("…and while Planning", () => {
    render(<QuickActions tripId="t1" phase="planning" />);
    expect(screen.getByRole("link", { name: "Add a cost" })).toHaveAttribute("href", "/trips/t1/budget?add=cost");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/money/money-header.test.tsx "app/(app)/trips/[tripId]/budget/budget-page.test.tsx" components/trip/home/quick-actions.test.tsx`
Expected: FAIL. No `add-cost-from-url` test id appears, and the hrefs lack `?add=cost`.

- [ ] **Step 3: Implement**

`components/money/add-cost-from-url.tsx`:
```tsx
"use client";

import { useAddParam } from "@/components/navigation/use-add-param";
import { OtherCostFormDialog } from "@/components/trip/other-cost-editor";
import type { OtherCostDefaults } from "@/lib/money/other-cost-defaults";

/** `/budget?add=cost` (the Home's "Add a cost") opens the Other-cost form directly (spec 2026-10-06 §F/§K). */
export function AddCostFromUrl({ tripId, homeCurrency, defaults }: { tripId: string; homeCurrency: string; defaults?: OtherCostDefaults }) {
  const [open, setOpen] = useAddParam("cost");
  return <OtherCostFormDialog tripId={tripId} homeCurrency={homeCurrency} defaults={defaults} open={open} onOpenChange={setOpen} />;
}
```

`components/money/add-cost-button.tsx`: add `import type { OtherCostDefaults } from "@/lib/money/other-cost-defaults";`. Add to `AddCostButtonProps`:
```ts
  /** Phase-aware starting values (spec 2026-10-06 §K). */
  defaults?: OtherCostDefaults;
```
Then make the signature `({ tripId, homeCurrency, variant, defaults }: AddCostButtonProps)` and the dialog `<OtherCostFormDialog tripId={tripId} homeCurrency={homeCurrency} defaults={defaults} open={open} onOpenChange={setOpen} />`.

`components/money/money-header.tsx`: replace the whole file with:
```tsx
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { AddCostButton } from "@/components/money/add-cost-button";
import { AddCostFromUrl } from "@/components/money/add-cost-from-url";
import { SplitWithPill } from "@/components/money/split-with-pill";
import type { TravellerLike } from "@/lib/traveller";
import type { OtherCostDefaults } from "@/lib/money/other-cost-defaults";

export interface MoneyHeaderProps {
  tripId: string;
  slug: string;
  tripName: string;
  meta: string;
  members: TravellerLike[];
  homeCurrency: string;
  /** False on a fork — there's no cost to add to a fork (MONEY.md §2). */
  showAddCost: boolean;
  /** Phase-aware starting values for a new cost (spec 2026-10-06 §K). */
  costDefaults?: OtherCostDefaults;
}

/** Money's PageHeader: eyebrow + "Money" + meta, bell/fork trailing, Split
 * with N and + Add a cost in actions/mobileAction. Also owns `?add=cost`. */
export function MoneyHeader({ tripId, slug, tripName, meta, members, homeCurrency, showAddCost, costDefaults }: MoneyHeaderProps) {
  return (
    <>
      {showAddCost ? <AddCostFromUrl tripId={tripId} homeCurrency={homeCurrency} defaults={costDefaults} /> : null}
      <PageHeader
        eyebrow={tripName}
        title="Money"
        meta={meta}
        trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
        actions={
          <>
            <SplitWithPill slug={slug} members={members} />
            {showAddCost ? <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" defaults={costDefaults} /> : null}
          </>
        }
        mobileAction={showAddCost ? <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="round" defaults={costDefaults} /> : undefined}
      />
    </>
  );
}
```

`app/(app)/trips/[tripId]/budget/page.tsx`:
- Add these imports after line 22:
```ts
import { computeTripPhase } from "@/lib/trip-phase";
import { otherCostDefaults, type OtherCostDefaults } from "@/lib/money/other-cost-defaults";
```
- Change `header` (lines 99-109) to take a second parameter and pass it through:
```tsx
  const header = (meta: string, costDefaults?: OtherCostDefaults) => (
    <MoneyHeader
      tripId={tripId}
      slug={slug}
      tripName={shell?.name ?? ""}
      meta={meta}
      members={members}
      homeCurrency={trip.homeCurrency}
      showAddCost={!activeFork}
      costDefaults={costDefaults}
    />
  );
```
- Stop `select` (line 154): add `countryCode: true`.
- After `const today = todayISOInZone(currentTripTimezone(stops));` (line 273), add:
```ts
  const costDefaults = otherCostDefaults({ phase: computeTripPhase({ startDate, endDate, today }), homeCurrency, today, stops });
```
- Lines 341 and 398: `{header(meta)}` becomes `{header(meta, costDefaults)}`.
- Line 354: `<AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" />` becomes `<AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" defaults={costDefaults} />`.
- The date-less branch (line 125) keeps `header(\`In ${trip.homeCurrency}\`)`. A date-less Trip is Sketching, which gets the plain defaults.

`components/trip/home/quick-actions.tsx`: lines 30 and 36, change `href: \`${base}/budget\`` to `href: \`${base}/budget?add=cost\`` for both "Add a cost" entries.

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/money "app/(app)/trips/[tripId]/budget" components/trip/home/quick-actions.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/money/add-cost-from-url.tsx components/money/add-cost-button.tsx components/money/money-header.tsx components/money/money-header.test.tsx "app/(app)/trips/[tripId]/budget/page.tsx" "app/(app)/trips/[tripId]/budget/budget-page.test.tsx" components/trip/home/quick-actions.tsx components/trip/home/quick-actions.test.tsx
git commit -m "feat(money): Add a cost opens the form with Phase defaults

Spec 2026-10-06 §F/§K: the Home's Add a cost now lands on /budget?add=cost,
which opens the Other-cost form directly; while Travelling it starts paid,
On the trip, in today's Stop's currency.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 39: `?add=stop` shortcuts + Plan `?add=transport&from&to`  (spec §F)

**Files:**
- Modify: `components/trip/home/quick-actions.tsx:26,34` ("Add a place")
- Modify: `components/trip/home/phase-sketching.tsx:70`
- Modify: `components/command-palette-results.tsx:151` ("Add Stop")
- Modify: `components/trip/itinerary-manager.tsx:582-603` (the `?add=` handler) and add an exported helper above `toastRejected` (line 497)
- Test: `components/trip/home/quick-actions.test.tsx`, `components/trip/home/phase-sketching.test.tsx`, `components/command-palette.test.tsx`, `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `HOME_ENDPOINT` (already imported at `itinerary-manager.tsx:36`)
- Produces: `export function transportDefaultsFromParams(from: string | null, to: string | null, stopIds: readonly string[], hasHomeBase: boolean): { fromStopId?: string; toStopId?: string; anchorStopId?: string }`. The URL contract is `from`/`to` = a Stop id, or `home` for the Home base. Task 40 emits it.

- [ ] **Step 1: Write the failing tests**

`components/trip/home/quick-actions.test.tsx`: append inside the describe:
```ts
  it("'Add a place' opens the add-Stop form on the Plan", () => {
    render(<QuickActions tripId="t1" phase="sketching" />);
    expect(screen.getByRole("link", { name: "Add a place" })).toHaveAttribute("href", "/trips/t1/plan?add=stop");
  });
```
`components/trip/home/phase-sketching.test.tsx`: append inside `describe("PhaseSketching Playground kit restyle (Task 10b)")`:
```ts
  it("the no-stops empty state's '+ Add a place' opens the add-Stop form (spec 2026-10-06 §F)", async () => {
    stopFindManyMock.mockResolvedValue([]);
    const tree = await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip" });
    const empty = findEl(tree, EmptyState)!;
    const action = empty.props.action as { props: { children: { props: { href: string } } } };
    expect(action.props.children.props.href).toBe("/trips/trip-1/plan?add=stop");
  });
```
`components/command-palette.test.tsx`: append:
```ts
  it("Add Stop opens the Plan with the add-Stop form (?add=stop)", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(await screen.findByText("Add Stop"));
    expect(mockPush).toHaveBeenCalledWith("/trips/t1/plan?add=stop", undefined);
  });
```
`components/trip/itinerary-manager.test.tsx`: change the import on line 179 to include `transportDefaultsFromParams`, then append:
```ts
describe("?add=transport (spec 2026-10-06 §F)", () => {
  afterEach(() => {
    navState.search = "";
    routerReplaceMock.mockClear();
  });

  it("maps from/to onto the Add-transport defaults; 'home' is the Home base; unknown ids drop", () => {
    expect(transportDefaultsFromParams("par", "rom", ["par", "rom"], false)).toEqual({ fromStopId: "par", toStopId: "rom", anchorStopId: "par" });
    expect(transportDefaultsFromParams("home", "par", ["par"], true)).toEqual({ fromStopId: "__home__", toStopId: "par" });
    expect(transportDefaultsFromParams("home", "par", ["par"], false)).toEqual({ toStopId: "par" });
    expect(transportDefaultsFromParams("gone", null, ["par"], true)).toEqual({});
  });

  it("opens the Add-transport form between the two Stops and strips add/from/to", async () => {
    navState.search = "add=transport&from=par&to=rom";
    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    expect(await screen.findByRole("dialog", { name: "How are you getting there?" })).toBeInTheDocument();
    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith("/trips/trip-1/plan", { scroll: false }));
    await user.click(await screen.findByRole("button", { name: /^add flight$/i }));
    await waitFor(() => expect(createTransport).toHaveBeenCalled());
    expect(vi.mocked(createTransport).mock.calls[0][1]).toEqual(expect.objectContaining({ fromStopId: "par", toStopId: "rom" }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/trip/home components/command-palette.test.tsx components/trip/itinerary-manager.test.tsx -t "add-Stop|add=stop|add=transport|Add Stop|Add a place"`
Expected: FAIL. The hrefs are `/plan` and `transportDefaultsFromParams` is not exported.

- [ ] **Step 3: Implement**

- `components/trip/home/quick-actions.tsx` lines 26 and 34: `href: \`${base}/plan\`` becomes `href: \`${base}/plan?add=stop\`` for both "Add a place" entries.
- `components/trip/home/phase-sketching.tsx` line 70: `tripPath(slug, "/plan")` becomes `tripPath(slug, "/plan?add=stop")`. Leave line 105 ("Firm up →") unchanged.
- `components/command-palette-results.tsx` line 151: `href: tripPath(tripRef, "/plan")` becomes `href: tripPath(tripRef, "/plan?add=stop")`.

In `components/trip/itinerary-manager.tsx`, insert this above the `toastRejected` comment (line 497):
```ts
/**
 * `/plan?add=transport&from=<id|home>&to=<id|home>` (spec 2026-10-06 §F —
 * Next steps and Flags for a missing leg) → the Add-transport form's
 * defaults. `home` is the Home base (only when the Trip has one); an id that
 * isn't a Stop on this Plan is dropped. A leg between two Stops anchors under
 * its departure Stop, as the plan's own "+ transport" slot does.
 */
export function transportDefaultsFromParams(
  from: string | null,
  to: string | null,
  stopIds: readonly string[],
  hasHomeBase: boolean,
): { fromStopId?: string; toStopId?: string; anchorStopId?: string } {
  const resolve = (v: string | null) =>
    v === "home" ? (hasHomeBase ? HOME_ENDPOINT : undefined) : v && stopIds.includes(v) ? v : undefined;
  const fromStopId = resolve(from);
  const toStopId = resolve(to);
  const betweenStops = fromStopId && toStopId && fromStopId !== HOME_ENDPOINT && toStopId !== HOME_ENDPOINT;
  return {
    ...(fromStopId ? { fromStopId } : {}),
    ...(toStopId ? { toStopId } : {}),
    ...(betweenStops ? { anchorStopId: fromStopId } : {}),
  };
}
```
Replace lines 593-603 (the derived-state block and its effect) with:
```ts
  if (addParam !== seenAddParam) {
    setSeenAddParam(addParam);
    if (addParam === "stop") setAddStopOpen(true);
    if (addParam === "transport") {
      setAddTransportDefaults(
        transportDefaultsFromParams(
          searchParams?.get("from") ?? null,
          searchParams?.get("to") ?? null,
          localStops.map((s) => s.id),
          Boolean(homeBaseName),
        ),
      );
    }
  }
  React.useEffect(() => {
    if (addParam !== "stop" && addParam !== "transport") return;
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("add");
    if (addParam === "transport") {
      next.delete("from");
      next.delete("to");
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [addParam, searchParams, router, pathname]);
```
Move the `addTransportDefaults` `useState` declaration (currently lines 614-618) above this block, directly after `const [addStopOpen, setAddStopOpen] = React.useState(false);` (line 574), so `setAddTransportDefaults` is declared before it's used.

Spec note: `?stop=` is not stripped after opening. It *is* the Stop sheet's open state (`sheetStopId`, line 729). `closeStopSheet` (line 1680) already removes it when the sheet closes, and stripping it on arrival would close the sheet immediately.

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/trip/home components/command-palette.test.tsx components/trip/itinerary-manager.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/trip/home/quick-actions.tsx components/trip/home/quick-actions.test.tsx components/trip/home/phase-sketching.tsx components/trip/home/phase-sketching.test.tsx components/command-palette-results.tsx components/command-palette.test.tsx components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): Add a place opens the form; ?add=transport opens a leg

Spec 2026-10-06 §F: shortcuts navigated to /plan without opening anything.
They now use ?add=stop, and the editor also opens the Add-transport form
from ?add=transport&from=&to= for the Next steps that point at a missing leg.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 40: Flags and Next steps land on their Stop or leg  (spec §F)

**Files:**
- Modify: `lib/flags.ts`: the `Flag` interface (30-39), `flagTransportDateMismatches` pushes (267-273, 285-291), `flagMissingConnections` (773-778) and `flagMissingHomeConnection` (817-830)
- Modify: `lib/next-steps.ts`: `NudgeInput` (27-41), `flagHref` (55-67, now exported) and the outbound/return nudges (130-148)
- Modify: `lib/next-steps-builder.ts:89-90` (pass the ids)
- Modify: `components/trip/flag-list.tsx:57-74` (`buildLink` uses `flagHref` for plan-side Flags)
- Test: `lib/flags.test.ts`, `lib/next-steps.test.ts`

**Interfaces:**
- Consumes: the URL contract from Task 39 (`/plan?add=transport&from=<id|home>&to=<id|home>`) and the existing `?stop=<id>` sheet handler (`itinerary-manager.tsx:729`)
- Produces:
  - `Flag.stopId?: string`
  - `Flag.connection?: { from: string; to: string }`
  - `export function flagHref(flag: Flag, base: string): string`
  - `NudgeInput.firstStopId?: string | null`, `NudgeInput.lastStopId?: string | null`

- [ ] **Step 1: Write the failing tests**

`lib/flags.test.ts`:
- In the "fires a warning when transport arrives after toStop's end date" test (line 247), add `expect(flags[0].stopId).toBe("s2");`.
- Before line 225's `expect(flags).toHaveLength(1)` (the departure-mismatch test), the stop id is `s1`. Add `expect(flags[0].stopId).toBe("s1");` after its `targetType` assertion.

Then append:
```ts
describe("Flag deep-link fields (spec 2026-10-06 §F)", () => {
  it("a missing connection carries the two Stops it would join", () => {
    expect(flagMissingConnections([LONDON, PARIS], [])[0].connection).toEqual({ from: LONDON.id, to: PARIS.id });
  });
  it("a missing home leg carries 'home' as its Home-base end", () => {
    const flags = flagMissingHomeConnection(homelessStops, [], home, true);
    expect(flags[0].connection).toEqual({ from: "home", to: "s1" });
    expect(flags[1].connection).toEqual({ from: "s2", to: "home" });
  });
});
```
(`home` and `homelessStops` are file-scope constants declared before line 878. Put this block after that describe.)

`lib/next-steps.test.ts`: replace the test "links STOP/TRANSPORT/TRIP flags to the plan canvas and DAY flags to the day" (lines 39-43) with:
```ts
  it("links a STOP Flag to its Stop and DAY flags to the day", () => {
    const steps = buildNextSteps({ flags: [warn("b"), info("a")], phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" });
    expect(steps.find((s) => s.id === "b")?.href).toBe("/trips/t/plan?stop=b");
    expect(steps.find((s) => s.id === "a")?.href).toBe("/trips/t/day/2026-07-01");
  });
```
Append:
```ts
describe("flagHref (spec 2026-10-06 §F)", () => {
  const base = "/trips/t";
  it("a TRANSPORT Flag on a leg lands on the Stop it was raised for", () => {
    expect(flagHref({ id: "x", severity: "warning", message: "m", targetType: "TRANSPORT", targetId: "t1", stopId: "s1" }, base))
      .toBe("/trips/t/plan?stop=s1");
  });
  it("a missing leg opens the Add-transport form between its ends", () => {
    expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "TRANSPORT", connection: { from: "home", to: "s1" } }, base))
      .toBe("/trips/t/plan?add=transport&from=home&to=s1");
  });
  it("TRIP Flags and Flags with no Stop stay on the plan", () => {
    expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "TRIP" }, base)).toBe("/trips/t/plan");
    expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "TRANSPORT" }, base)).toBe("/trips/t/plan");
  });
  it("outbound/return nudges open the Add-transport form when the Stop ids are known", () => {
    const steps = buildNextSteps({
      flags: [], phase: "planning", tripBasePath: base, limit: 10,
      nudges: makeNudges({ hasHomeBase: true, homeName: "Sydney", firstStopName: "Paris", lastStopName: "Rome",
        firstStopId: "s1", lastStopId: "s2", hasOutboundLeg: false, hasReturnLeg: false, roundTrip: true }),
    });
    expect(steps.find((s) => s.id === "nudge-add-outbound-flight")?.href).toBe("/trips/t/plan?add=transport&from=home&to=s1");
    expect(steps.find((s) => s.id === "nudge-add-return-flight")?.href).toBe("/trips/t/plan?add=transport&from=s2&to=home");
  });
});
```
Change line 2's import to `import { buildNextSteps, flagHref, type NudgeInput } from "./next-steps";`.

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run lib/flags.test.ts lib/next-steps.test.ts`
Expected: FAIL. `stopId` and `connection` are undefined, `flagHref` is not exported, and the hrefs are `/trips/t/plan`.

- [ ] **Step 3: Implement**

`lib/flags.ts`: extend `Flag`:
```ts
export interface Flag {
  id: string;
  severity: FlagSeverity;
  message: string;
  targetType: FlagTargetType;
  /** Id of the entity this flag points to, if applicable. */
  targetId?: string;
  /** For DAY flags: the ISO date string. */
  date?: string;
  /** The Stop the plan editor opens to fix this (spec 2026-10-06 §F) — set where targetId isn't a Stop. */
  stopId?: string;
  /** A missing leg: the ends a new Transport would join; "home" is the Home base (spec 2026-10-06 §F). */
  connection?: { from: string; to: string };
}
```
In `flagTransportDateMismatches`, add `stopId: fromStop.id,` after `targetId: t.id,` in the departure push, and `stopId: toStop.id,` after `targetId: t.id,` in the arrival push.
In `flagMissingConnections`, add `connection: { from: a.id, to: b.id },` after `targetType: "TRANSPORT",`.
In `flagMissingHomeConnection`, add `connection: { from: "home", to: first.id },` to the outbound push and `connection: { from: last.id, to: "home" },` to the return push.

`lib/next-steps.ts`: add these to `NudgeInput` after `lastStopName`:
```ts
  /** First/last Stop ids, for the outbound/return nudges' Add-transport deep link (spec 2026-10-06 §F). */
  firstStopId?: string | null;
  lastStopId?: string | null;
```
Replace `flagHref` with:
```ts
const addTransportHref = (base: string, from: string, to: string) =>
  `${base}/plan?add=transport&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

/** Where a Flag is fixed (spec 2026-10-06 §F): its day, its missing leg's form, or its Stop on the plan. */
export function flagHref(flag: Flag, base: string): string {
  if (flag.targetType === "DAY") return flag.date ? `${base}/day/${flag.date}` : `${base}/calendar`;
  if (flag.connection) return addTransportHref(base, flag.connection.from, flag.connection.to);
  const stopId = flag.targetType === "STOP" ? flag.targetId : flag.stopId;
  if (stopId && flag.targetType !== "TRIP") return `${base}/plan?stop=${encodeURIComponent(stopId)}`;
  return `${base}/plan`;
}
```
Change the outbound nudge href argument (`\`${tripBasePath}/plan\`` at line ~134) to:
```ts
    nudges.firstStopId ? addTransportHref(tripBasePath, "home", nudges.firstStopId) : `${tripBasePath}/plan`,
```
and the return nudge href to:
```ts
    nudges.lastStopId ? addTransportHref(tripBasePath, nudges.lastStopId, "home") : `${tripBasePath}/plan`,
```
`lib/next-steps-builder.ts`: after `lastStopName: lastStop?.name ?? null,` add:
```ts
      firstStopId: firstStop?.id ?? null,
      lastStopId: lastStop?.id ?? null,
```
(Check `allStops` elements carry `id` with `grep -n "allStops" lib/next-steps-builder.ts`. The function reads `firstStop?.id` at line 85, so they do.)

`components/trip/flag-list.tsx`: add `import { flagHref } from "@/lib/next-steps";` and change the `STOP`/`TRANSPORT`/`ACCOMMODATION` case in `buildLink` to:
```ts
    case "STOP":
    case "TRANSPORT":
    case "ACCOMMODATION":
      // Spec 2026-10-06 §F: land on the Stop (or the missing leg's form), not the Home.
      return flagHref(flag, basePath);
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run lib/flags.test.ts lib/next-steps.test.ts lib/next-steps-builder.test.ts components/trip`
Expected: PASS. If `lib/next-steps-builder.test.ts` doesn't exist, vitest reports "no test files" for that path only.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/flags.ts lib/flags.test.ts lib/next-steps.ts lib/next-steps.test.ts lib/next-steps-builder.ts components/trip/flag-list.tsx
git commit -m "feat(next-steps): Flags open their Stop; missing legs open the form

Spec 2026-10-06 §F: every Flag and Next step dropped you at the top of the
plan despite carrying a target. Stop Flags now emit /plan?stop=<id>; missing
connections and the outbound/return nudges emit /plan?add=transport.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 41: Summary departure date in the leg's timezone  (spec §G)

**Files:**
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx`: imports (lines 18-19), after `transportFromStop` (405-410), the per-stop block (584) and the badge (660-667). The spec cites 661; the badge is at 660-667.
- Test: `app/(app)/trips/[tripId]/summary/page.test.tsx`

**Interfaces:**
- Consumes: `transportTimeDisplay`, `shortDate` (`lib/time-display.ts:16,38`)
- Produces: nothing

- [ ] **Step 1: Write the failing test**

Append to `page.test.tsx`:
```ts
describe("SummaryPage — departure dates in the leg's timezone (spec 2026-10-06 §G)", () => {
  it("a 06:30 Sydney departure shows its own calendar day, not the UTC one", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });
    setupStops(
      [
        { ...DATED_STOP, id: "syd", name: "Sydney", country: "Australia", timezone: "Australia/Sydney", arriveDate: "2026-01-02", departDate: "2026-01-08" },
        TAIL_STOP,
      ],
      [],
    );
    mockDb.transport.findMany.mockResolvedValue([
      {
        id: "t1", mode: "flight", fromStopId: "syd", toStopId: "s3", depPlace: "SYD", arrPlace: "Tail",
        // 2026-01-07T19:30Z = 06:30 on 8 Jan in Sydney (AEDT, UTC+11).
        depAt: "2026-01-07T19:30:00.000Z", arrAt: null, sortOrder: 0, depIsHome: false, arrIsHome: false,
      },
    ]);
    render(await renderSummary());
    expect(screen.getByText("8 Jan")).toBeInTheDocument();
    expect(screen.queryByText("7 Jan")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**
Run: `TZ=UTC npx vitest run "app/(app)/trips/[tripId]/summary/page.test.tsx" -t "spec 2026-10-06"`
Expected: FAIL. It finds "7 Jan" instead of "8 Jan".

- [ ] **Step 3: Implement**

Add this after line 18:
```ts
import { transportTimeDisplay, shortDate } from "@/lib/time-display";
```
After the `transportFromStop` loop (line 410), add:
```ts
  // Each leg's departure date in its own zone (spec 2026-10-06 §G) — the
  // server renders in UTC, so a plain toLocaleDateString shows an early
  // Sydney flight on the day before.
  const stopTimezone = new Map(stops.map((s) => [s.id, s.timezone] as const));
```
In the per-stop callback, after `const transport = transportFromStop.get(stop.id);` (line 584), add:
```ts
                        const departDay = transport?.depAt
                          ? (transportTimeDisplay({
                              depAt: new Date(transport.depAt),
                              arrAt: null,
                              fromTimezone: stop.timezone,
                              toTimezone: transport.toStopId ? (stopTimezone.get(transport.toStopId) ?? null) : null,
                            }).dep?.dateISO ?? null)
                          : null;
```
Replace the badge block (lines 660-667):
```tsx
                                {departDay && (
                                  <Badge variant="outline" className="ml-auto shrink-0 text-xs font-mono">
                                    {shortDate(departDay)}
                                  </Badge>
                                )}
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run "app/(app)/trips/[tripId]/summary/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add "app/(app)/trips/[tripId]/summary/page.tsx" "app/(app)/trips/[tripId]/summary/page.test.tsx"
git commit -m "fix(summary): show departure dates in the leg's own timezone

Spec 2026-10-06 §G: the server formatted depAt in UTC, so a morning flight
out of Sydney showed the previous day. Uses transportTimeDisplay.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 42: Editing a Stop uses PlaceCombobox  (spec §L)

**Files:**
- Modify: `server/actions/stops.ts:420-433` (rough `updateStop` honours a picked point) and `:487-492` (scheduled keeps the picked `countryCode`)
- Modify: `components/ui/place-combobox.tsx:28-36` (the mounted value isn't searched; Field aria wiring) and the `<input>` at 81-97
- Modify: `components/trip/stop-form-dialog.tsx`: imports, `StopForm` state (149-172), submit (174-205), `handleCountryChange` (207-215), the mode toggle (219-230) and the name field (233-243)
- Test: `server/actions/stops.test.ts`, `components/ui/place-combobox.test.tsx`, `components/trip/stop-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `PlaceCombobox`, `PickedPlace`, `guessTimezoneForCountry`, `useFieldControl`
- Produces: none new. `updateStop` now honours `lat`/`lng`/`countryCode` in `StopInput`. The schema already accepts them (`lib/validations/stop.ts`).

- [ ] **Step 1: Write the failing tests**

`server/actions/stops.test.ts`: append inside `describe("updateStop")`:
```ts
  it("a picked place's point is kept on a rough edit — no re-geocode (spec 2026-10-06 §L)", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-r", tripId: "trip-1", sortOrder: 2, arriveDate: null, departDate: null, nights: 3, pinned: false });
    stopUpdateMock.mockResolvedValue({});
    await updateStop("stop-r", { ...ROUGH_INPUT, name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77, countryCode: "jp" });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-r" },
      data: expect.objectContaining({ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }),
    });
  });

  it("a picked place's countryCode is kept on a scheduled edit", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-01", departDate: "2026-07-05", nights: null, pinned: false });
    stopUpdateMock.mockResolvedValue({});
    await updateStop("stop-1", { ...VALID_INPUT, name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-1" },
      data: expect.objectContaining({ lat: 35.01, lng: 135.77, countryCode: "jp" }),
    });
  });
```

`components/ui/place-combobox.test.tsx`: append inside `describe("PlaceCombobox")`:
```ts
  it("does not search for the value it mounts with (an existing Stop's name)", async () => {
    function Seeded() {
      const [v, setV] = React.useState("Paris");
      return <PlaceCombobox value={v} onValueChange={setV} onPick={vi.fn()} aria-label="Leaving from" />;
    }
    render(<Seeded />);
    await pause(500);
    expect(findPlaces).not.toHaveBeenCalled();
  });

  it("wires id and aria-invalid from a surrounding Field", () => {
    render(
      <Field label="Place name" error="Stop name is required">
        <PlaceCombobox value="" onValueChange={vi.fn()} onPick={vi.fn()} aria-label="Place name" />
      </Field>,
    );
    expect(screen.getByRole("combobox", { name: "Place name" })).toHaveAttribute("aria-invalid", "true");
  });
```
(Add `import { Field } from "@/components/ui/field";` to the file's imports.)

`components/trip/stop-form-dialog.test.tsx`: after the attachments mock (line 12), add:
```ts
const findPlaces = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));
```
Change line 13 to `import { createStop, updateStop } from "@/server/actions/stops";`, set `findPlaces.mockResolvedValue({ status: "ok", candidates: [] });` inside `beforeEach`, and append:
```ts
  describe("place search on edit (spec 2026-10-06 §L)", () => {
    const LONDON = {
      id: "stop-1", name: "London", country: "United Kingdom", timezone: "Europe/London",
      arriveDate: "2026-07-01", departDate: "2026-07-05", nights: null, pinned: false, chapterId: null, sortOrder: 0, notes: null, lat: 51.5, lng: -0.12,
    };

    it("a pick sets name, country, point and timezone", async () => {
      findPlaces.mockResolvedValue({ status: "ok", candidates: [
        { name: "Kyoto, Kyoto Prefecture, Japan", lat: 35.01, lng: 135.77, city: "Kyoto", country: "Japan", countryCode: "jp" },
      ] });
      const user = userEvent.setup();
      render(<StopFormDialog {...baseProps} stop={LONDON} />);
      const place = screen.getByPlaceholderText(/e\.g\. london/i);
      await user.clear(place);
      await user.type(place, "Kyo");
      await user.click(await screen.findByRole("option", { name: /Kyoto/ }));
      expect(screen.getByPlaceholderText(/e\.g\. united kingdom/i)).toHaveValue("Japan");
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      expect(updateStop).toHaveBeenCalledWith("stop-1", expect.objectContaining({
        mode: "scheduled", name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77, countryCode: "jp", timezone: "Asia/Tokyo",
      }));
    });

    it("typing without picking sends no point, so the save re-geocodes as before", async () => {
      const user = userEvent.setup();
      render(<StopFormDialog {...baseProps} stop={LONDON} />);
      const place = screen.getByPlaceholderText(/e\.g\. london/i);
      await user.clear(place);
      await user.type(place, "Leeds");
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      const input = vi.mocked(updateStop).mock.calls[0][1];
      expect(input).toEqual(expect.objectContaining({ name: "Leeds" }));
      expect(input).not.toHaveProperty("lat");
    });

    it("labels the modes like the add sheet: Exact dates / Roughly", () => {
      render(<StopFormDialog {...baseProps} />);
      expect(screen.getByRole("radio", { name: "Exact dates" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Roughly" })).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run server/actions/stops.test.ts components/ui/place-combobox.test.tsx components/trip/stop-form-dialog.test.tsx -t "spec 2026-10-06|mounts with|surrounding Field"`
Expected: FAIL. The geocoder is called, there is no option list, the labels are "Rough"/"Scheduled", and `aria-invalid` is missing.

- [ ] **Step 3: Implement**

`server/actions/stops.ts`, rough branch of `updateStop`: replace lines 421-433 (from `const { name, country, nights, chapterId, notes } = parsed.data;` through the `if (updateRoughCoords) { … }` block) with:
```ts
    const { name, country, nights, chapterId, notes, lat: pickedLat, lng: pickedLng, countryCode: pickedCountryCode } = parsed.data;

    // A picked place (spec 2026-10-06 §L) brings its own point and country;
    // typed text is geocoded best-effort as before (failure leaves coords as they were).
    let updateRoughLat: number | null | undefined;
    let updateRoughLng: number | null | undefined;
    let updateRoughCountryCode: string | null = null;
    if (pickedLat !== undefined && pickedLng !== undefined) {
      updateRoughLat = pickedLat;
      updateRoughLng = pickedLng;
      updateRoughCountryCode = pickedCountryCode ?? null;
    } else {
      const updateRoughCoords = await geocodePlaceDetailed([name, country].filter(Boolean).join(", "));
      if (updateRoughCoords) {
        updateRoughLat = updateRoughCoords.lat;
        updateRoughLng = updateRoughCoords.lng;
        updateRoughCountryCode = updateRoughCoords.countryCode ?? null;
      }
    }
```
Scheduled branch: in the `tx.stop.update` data, change `countryCode: updateCountryCode,` to `countryCode: parsed.data.countryCode ?? updateCountryCode,`.

`components/ui/place-combobox.tsx`:
- Add `import { useFieldControl } from "@/components/ui/field";` after line 5.
- Inside `PlaceCombobox`, after `const listId = React.useId();`, add `const field = useFieldControl();`.
- Replace `const pickedValue = React.useRef<string | null>(null);` with:
```ts
  // The value it mounts with is settled (an existing Stop's name, spec 2026-10-06 §L) — not searched.
  const pickedValue = React.useRef<string | null>(value.trim() || null);
```
- On the `<input>`, change `id={id}` to `id={id ?? field.id}` and add `aria-invalid={field["aria-invalid"]}` and `aria-describedby={field["aria-describedby"]}`.

`components/trip/stop-form-dialog.tsx`:
- Replace line 6 (`import { Input } …`). Keep `Input`, because Country still uses it, and add these after it:
```ts
import { PlaceCombobox, type PickedPlace } from "@/components/ui/place-combobox";
```
- In `StopForm`, after `const [notes, setNotes] = …` (line 172), add:
```ts
  // Spec 2026-10-06 §L: a picked place carries its point and country code to the save.
  const [picked, setPicked] = React.useState<PickedPlace | null>(null);
  const pickedPoint = picked
    ? { lat: picked.lat, lng: picked.lng, ...(picked.countryCode ? { countryCode: picked.countryCode } : {}) }
    : {};
```
- In `submit`, add `...pickedPoint,` after `country: country.trim() || undefined,` in **both** the rough and scheduled `input` objects.
- After `handleCountryChange`, add:
```ts
  // A pick sets the name, country and point, and the timezone from the
  // country — the add sheet's path (guessTimezoneForCountry).
  function handlePick(p: PickedPlace) {
    setPicked(p);
    setName(p.name);
    const pickedCountry = p.region?.split(",").pop()?.trim();
    if (pickedCountry) setCountry(pickedCountry);
    const tz = guessTimezoneForCountry(p.countryCode ?? pickedCountry);
    if (tz !== "UTC") setTimezone(tz);
  }
```
- Mode toggle: replace the two `SegmentedItem`s with the add sheet's labels and order:
```tsx
        <SegmentedItem value="scheduled">Exact dates</SegmentedItem>
        <SegmentedItem value="rough">Roughly</SegmentedItem>
```
- Name field: replace the `<Input value={name} … autoFocus disabled={isPending} />` with:
```tsx
          <PlaceCombobox
            value={name}
            onValueChange={(t) => {
              setName(t);
              setPicked(null);
            }}
            onPick={handlePick}
            placeholder="e.g. London"
            aria-label="Place name"
            autoFocus
            disabled={isPending}
          />
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run server/actions/stops.test.ts components/ui/place-combobox.test.tsx components/trip/stop-form-dialog.test.tsx components/plan/mobile/add-stop-sheet.test.tsx components/trip/itinerary-manager.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add server/actions/stops.ts server/actions/stops.test.ts components/ui/place-combobox.tsx components/ui/place-combobox.test.tsx components/trip/stop-form-dialog.tsx components/trip/stop-form-dialog.test.tsx
git commit -m "feat(plan): editing a Stop searches places like adding one

Spec 2026-10-06 §L: the edit form had a plain text place, free-text country
and kept old coordinates on rename. It now uses PlaceCombobox; a pick sets
name, country, point and timezone, and updateStop keeps a picked point.
Mode labels match the add sheet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 43: FormDialog asks before discarding — infra + Stop and Chapter  (spec §M)

**Files:**
- Modify: `components/ui/form-dialog.tsx` (whole file)
- Modify: `components/trip/stop-form-dialog.tsx` (call `useFormDirty` in `StopForm`)
- Modify: `components/trip/chapter-form-dialog.tsx` (call `useFormDirty` in `ChapterForm` after line 139)
- Test: `components/ui/form-dialog.test.tsx`, `components/trip/stop-form-dialog.test.tsx`, `components/trip/chapter-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `Button` (`components/ui/button.tsx`)
- Produces:
  - `FormDialogProps.isDirty?: boolean`
  - `export function useFormDirty(values: unknown): boolean`. Call it from a form inside `FormDialog`. It compares `JSON.stringify(values)` with the first render and reports the result to the dialog.

- [ ] **Step 1: Write the failing tests**

`components/ui/form-dialog.test.tsx`: change the imports to:
```ts
import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormDialog, useFormDirty } from "./form-dialog";
```
Append:
```tsx
function NameForm() {
  const [name, setName] = React.useState("");
  useFormDirty({ name });
  return <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />;
}

describe("FormDialog dirty guard (spec 2026-10-06 §M)", () => {
  it("an untouched form closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<FormDialog open onOpenChange={onOpenChange} title="Add a stop"><NameForm /></FormDialog>);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a dirty form asks first; Keep editing keeps the input", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<FormDialog open onOpenChange={onOpenChange} title="Add a stop"><NameForm /></FormDialog>);
    await user.type(screen.getByLabelText("Name"), "Rome");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard changes?")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("Rome");
  });

  it("Discard closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<FormDialog open onOpenChange={onOpenChange} title="Add a stop"><NameForm /></FormDialog>);
    await user.type(screen.getByLabelText("Name"), "Rome");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("honours an isDirty prop too", async () => {
    const onOpenChange = vi.fn();
    render(<FormDialog open onOpenChange={onOpenChange} title="X" isDirty><p>body</p></FormDialog>);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });
});
```

`components/trip/stop-form-dialog.test.tsx`: append:
```ts
  it("asks before discarding typed changes on Escape (spec 2026-10-06 §M)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<StopFormDialog {...baseProps} onOpenChange={onOpenChange} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. london/i), "Rome");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });
```
`components/trip/chapter-form-dialog.test.tsx`: append:
```ts
  it("asks before discarding typed changes on Escape (spec 2026-10-06 §M)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ChapterFormDialog {...baseProps} onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText(/chapter name/i), "Italy");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });

  it("an untouched form still closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<ChapterFormDialog {...baseProps} onOpenChange={onOpenChange} />);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/ui/form-dialog.test.tsx components/trip/stop-form-dialog.test.tsx components/trip/chapter-form-dialog.test.tsx -t "spec 2026-10-06|untouched|isDirty|Discard"`
Expected: FAIL. `useFormDirty` is not exported and the dialog closes on Escape.

- [ ] **Step 3: Implement**

`components/ui/form-dialog.tsx` (full replacement):
```tsx
"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /**
   * The id of the record being edited, or null/undefined when adding. Combined
   * with `open` to key the inner form so all its controlled state re-seeds from
   * props whenever the dialog opens or the target record changes.
   */
  recordId?: string | null;
  /** `lg` widens the dialog for a two-column form (Item, Transport, Accommodation). Defaults to the standard width. */
  size?: "md" | "lg";
  /**
   * The form holds unsaved input (spec 2026-10-06 §M): a backdrop tap or
   * Escape asks "Discard changes?" instead of closing. A form inside can
   * report this itself with `useFormDirty` instead.
   */
  isDirty?: boolean;
  children: React.ReactNode;
}

const FormDirtyContext = React.createContext<React.RefObject<boolean> | null>(null);

/**
 * Report a form's dirtiness to its FormDialog (spec 2026-10-06 §M): pass
 * every field's value; dirty = differs from the first render. FormDialog
 * remounts the form on each open, so "first render" is the opened state.
 */
export function useFormDirty(values: unknown): boolean {
  const [initial] = React.useState(() => JSON.stringify(values));
  const dirty = JSON.stringify(values) !== initial;
  const reported = React.useContext(FormDirtyContext);
  React.useLayoutEffect(() => {
    if (!reported) return;
    reported.current = dirty;
    return () => {
      reported.current = false;
    };
  }, [reported, dirty]);
  return dirty;
}

/**
 * Standard shell for an entity create/edit dialog: the Dialog + content frame,
 * a header/title, and the state-reset remount. Put a stateful inner `<XForm>`
 * (which reads its initial state from props) as the child; pair with
 * `useEntityForm` inside that form.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  recordId,
  size,
  isDirty = false,
  children,
}: FormDialogProps) {
  const formKey = open ? `${recordId ?? "new"}-open` : "closed";
  const reported = React.useRef(false);
  const confirmId = React.useId();
  const [confirming, setConfirming] = React.useState(false);
  const [seenOpen, setSeenOpen] = React.useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (!open) setConfirming(false);
  }

  // A stray backdrop tap or Escape on unsaved input asks first (spec §M).
  function guard(e: Event) {
    if (!(isDirty || reported.current)) return;
    e.preventDefault();
    setConfirming(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size} onInteractOutside={guard} onEscapeKeyDown={guard}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {confirming && (
          <div
            role="alertdialog"
            aria-labelledby={confirmId}
            className="flex flex-col gap-3 rounded-xl border-2 border-border bg-sun/25 p-3.5"
          >
            <p id={confirmId} className="text-sm font-bold">Discard changes?</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" autoFocus onClick={() => setConfirming(false)}>
                Keep editing
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Discard
              </Button>
            </div>
          </div>
        )}
        <FormDirtyContext.Provider value={reported}>
          <div className="contents" key={formKey}>
            {children}
          </div>
        </FormDirtyContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
```
(Check the `Button` `size` prop accepts `"sm"` with `grep -n "size:" components/ui/button.tsx`. `share-links-panel.tsx` already uses `size="sm"`.)

`components/trip/stop-form-dialog.tsx`: change line 26 to `import { FormDialog, useFormDirty } from "@/components/ui/form-dialog";` and add this after the `picked` state (Task 42):
```ts
  useFormDirty({ mode, name, country, timezone, nights, chapterId, arriveDate, departDate, notes });
```
`components/trip/chapter-form-dialog.tsx`: change the `FormDialog` import to `import { FormDialog, useFormDirty } from "@/components/ui/form-dialog";` and add this after the `setDatesNow` state (line 139):
```ts
  useFormDirty({ name, colour, startDate, endDate, setDatesNow });
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/ui/form-dialog.test.tsx components/trip/stop-form-dialog.test.tsx components/trip/chapter-form-dialog.test.tsx components/trip/add-reminder-dialog.test.tsx components/trip/schedule-item-dialog.test.tsx`
Expected: PASS. The reminder and schedule dialogs are unchanged; they're included because they also use FormDialog.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/ui/form-dialog.tsx components/ui/form-dialog.test.tsx components/trip/stop-form-dialog.tsx components/trip/stop-form-dialog.test.tsx components/trip/chapter-form-dialog.tsx components/trip/chapter-form-dialog.test.tsx
git commit -m "feat(forms): ask before a stray tap discards a Stop or Chapter edit

Spec 2026-10-06 §M: big form dialogs closed on a backdrop tap or Escape and
lost their input. FormDialog now takes isDirty (or useFormDirty from the
form) and asks Discard changes? first.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 44: Item, Transport and Accommodation forms report dirtiness  (spec §M)

**Files:**
- Modify: `components/trip/item-form-dialog.tsx`: the import at line 32, and `ItemForm` after its last field state (line ~552, after `settlement`)
- Modify: `components/trip/transport-form-dialog.tsx`: the `FormDialog` import, and `TransportForm` after line 464 (`showCost`)
- Modify: `components/trip/accommodation-form-dialog.tsx`: the `FormDialog` import, and `AccommodationForm` after its `settlement` state (line ~231)
- Test: `components/trip/item-form-dialog.test.tsx`, `components/trip/transport-form-dialog.test.tsx`, `components/trip/accommodation-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `useFormDirty` (Task 43)
- Produces: nothing

- [ ] **Step 1: Write the failing tests**

Append the same pair of tests to each file, with these per-file values:
- `item-form-dialog.test.tsx`: `render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} />)`, typing into `screen.getByLabelText(/^title/i)`
- `transport-form-dialog.test.tsx`: `render(<TransportFormDialog {...baseProps} onOpenChange={onOpenChange} />)`, typing into `screen.getByLabelText(/^notes/i)`
- `accommodation-form-dialog.test.tsx`: `render(<AccommodationFormDialog {...baseProps} onOpenChange={onOpenChange} />)`, typing into `screen.getByLabelText(/accommodation name/i)`

Item version (copy and substitute for the other two):
```ts
describe("dirty guard (spec 2026-10-06 §M)", () => {
  it("asks before discarding typed changes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText(/^title/i), "Colosseum");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });

  it("an untouched form still closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} />);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/trip/item-form-dialog.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/accommodation-form-dialog.test.tsx -t "dirty guard"`
Expected: FAIL. The first test of each pair fails because the dialog closes.

- [ ] **Step 3: Implement**

`item-form-dialog.tsx`: change line 32 to `import { FormDialog, useFormDirty } from "@/components/ui/form-dialog";` and add this after the `settlement` `useState` in `ItemForm`:
```ts
  useFormDirty({ title, category, stopId, date, startTime, endTime, address, link, booking, notes, hiddenFromShares, costAmount, currency, paidAmount, paidAt, paid, settlement });
```
`transport-form-dialog.tsx`: import `useFormDirty` alongside `FormDialog`, and add this after `const [showCost, setShowCost] = …` (line 464):
```ts
  // UI-only state (showTimes, selectedAt, pasting, showCost) is not input.
  useFormDirty({ mode, fromValue, toValue, pickedSlot, depAt, arrAt, reference, notesText, costAmount, currency, paidAmount, paidAt, paid, settlement });
```
`accommodation-form-dialog.tsx`: import `useFormDirty` alongside `FormDialog`, and add this after the `settlement` `useState`:
```ts
  useFormDirty({ name, address, checkIn, checkOut, checkInTime, checkOutTime, confirmation, notes, costAmount, currency, paidAmount, paidAt, paid, settlement });
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/trip/item-form-dialog.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/accommodation-form-dialog.test.tsx components/trip/itinerary-manager.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx components/trip/accommodation-form-dialog.tsx components/trip/accommodation-form-dialog.test.tsx
git commit -m "feat(forms): Item, Transport and stay forms ask before discarding

Spec 2026-10-06 §M: the three biggest forms now report unsaved input to
FormDialog, so a stray backdrop tap no longer throws it away.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 45: Nights stepper on the Stop header and phone sheet  (spec §N)

**Files:**
- Modify: `components/plan/stop-row.tsx`: `StopRowProps` (20-34), `OWN_CLICK` (39), the right-hand column (209-238) and imports
- Modify: `components/plan/mobile/stop-sheet.tsx`: `StopSheetProps` (19-36), the destructuring (~92-105) and the meta line (152)
- Modify: `components/trip/itinerary-manager.tsx`: the stops import (56-65), the dates import (72), a new `handleSetNights` after `handleSaveAdjustDates`, `<StopRow>` (1777-1797) and `<StopSheet>` (2472-2490)
- Test: `components/plan/stop-row.test.tsx`, `components/plan/mobile/stop-sheet.test.tsx`, `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `Stepper` (`components/ui/stepper.tsx`), `setStopNights(stopId: string, nights: number): Promise<StopActionResult>` (`server/actions/stops.ts:1233`), `applyReorderResult` (`itinerary-manager.tsx:1556`), `addDays`, `nightsBetween` (`lib/dates.ts`), `toastRefused` (Task 31)
- Produces: `StopRowProps.onSetNights?: (nights: number) => void` and `StopSheetProps.onSetNights?: (nights: number) => void`

- [ ] **Step 1: Write the failing tests**

`components/plan/stop-row.test.tsx`: append:
```ts
describe("nights stepper (spec 2026-10-06 §N)", () => {
  it("a scheduled Stop steps its nights without folding the row", async () => {
    const onSetNights = vi.fn();
    const { props } = renderRow({ onSetNights });
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights in Rome" }));
    expect(onSetNights).toHaveBeenCalledWith(8);
    expect(props.onToggle).not.toHaveBeenCalled();
  });
  it("a rough Stop steps its rough nights", async () => {
    const onSetNights = vi.fn();
    renderRow({ stop: ROUGH, onSetNights });
    await userEvent.click(screen.getByRole("button", { name: "Decrease Nights in Munich" }));
    expect(onSetNights).toHaveBeenCalledWith(4);
  });
  it("a Pinned Stop is not disabled — changing its own nights is the Traveller's choice", () => {
    renderRow({ stop: { ...DATED, pinned: true }, onSetNights: vi.fn() });
    expect(screen.getByRole("button", { name: "Increase Nights in Rome" })).not.toBeDisabled();
  });
  it("clicking the number doesn't fold the row", async () => {
    const { props } = renderRow({ onSetNights: vi.fn() });
    await userEvent.click(screen.getByRole("group", { name: "Nights in Rome" }));
    expect(props.onToggle).not.toHaveBeenCalled();
  });
});
```
`components/plan/mobile/stop-sheet.test.tsx`: append:
```ts
describe("StopSheet nights stepper (spec 2026-10-06 §N)", () => {
  it("sits on the meta line and steps the Stop's nights", async () => {
    const onSetNights = vi.fn();
    renderSheet({ onSetNights });
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights in Paris" }));
    expect(onSetNights).toHaveBeenCalledWith(3);
  });
});
```
`components/trip/itinerary-manager.test.tsx`: add `setStopNights: vi.fn().mockResolvedValue({ success: true, changed: [], conflicts: [] }),` to the stops `vi.mock` (after line 27), add `setStopNights` to the stops import on line 175, add `import { toastWithUndo } from "@/components/ui/undo-toast";`, and append:
```ts
describe("nights stepper (spec 2026-10-06 §N)", () => {
  it("steps a scheduled Stop's nights through setStopNights, with the ripple Undo toast", async () => {
    vi.mocked(setStopNights).mockResolvedValueOnce({ success: true, changed: [{ id: "par", arriveDate: "2026-12-10", departDate: "2026-12-16" }], conflicts: [] });
    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    await user.click(desktop().getByRole("button", { name: "Increase Nights in Paris" }));
    expect(setStopNights).toHaveBeenCalledWith("par", 6);
    await waitFor(() => expect(toastWithUndo).toHaveBeenCalled());
  });

  it("rolls back and toasts the server's reason when refused", async () => {
    vi.mocked(setStopNights).mockResolvedValueOnce({ success: false, errors: { nights: ["Nights must be between 0 and 366"] } });
    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS]} />);
    await user.click(desktop().getByRole("button", { name: "Increase Nights in Paris" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Nights must be between 0 and 366" })),
    );
    expect(within(desktop().getByRole("group", { name: "Nights in Paris" })).getByText("5")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/plan/stop-row.test.tsx components/plan/mobile/stop-sheet.test.tsx components/trip/itinerary-manager.test.tsx -t "nights stepper"`
Expected: FAIL. No "Increase Nights in …" button exists.

- [ ] **Step 3: Implement**

`components/plan/stop-row.tsx`:
- Add `import { Stepper } from "@/components/ui/stepper";`.
- Add to `StopRowProps`:
```ts
  /** Spec 2026-10-06 §N: the −/+ nights stepper (rough: writes nights; scheduled: moves depart and ripples). */
  onSetNights?: (nights: number) => void;
```
- Add `onSetNights` to the destructured props.
- Line 39: change to `const OWN_CLICK = "button, a, input, select, textarea, label, [role='button'], [role='menuitem'], [role='group']";`
- In the right-hand column, render the stepper when `onSetNights` is given. Replace lines 209-238 with:
```tsx
        <div className="flex flex-col items-end gap-1 whitespace-nowrap">
          {!rough ? (
            <>
              <span className="text-sm font-bold">
                {nights === 0 ? "Same day" : formatStayRange(stop.arriveDate as string, stop.departDate as string)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {tzAbbrev(stop.timezone, stop.arriveDate as string)}
                </span>
                {onSetNights ? (
                  <Stepper value={nights} onChange={onSetNights} min={0} max={366} unit="n" label={`Nights in ${stop.name}`} />
                ) : (
                  nights > 0 && (
                    <span
                      className={cn(
                        "shrink-0 whitespace-nowrap rounded-full border-2 border-border px-2 text-xs font-extrabold tabular-nums",
                        HUE_CLASSES[stopHue(stop.sortOrder)].fill,
                      )}
                    >
                      {formatNights(nights)}
                    </span>
                  )
                )}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-bold">Rough</span>
              {onSetNights ? (
                <Stepper value={stop.nights ?? 1} onChange={onSetNights} min={0} max={366} unit="n" label={`Nights in ${stop.name}`} />
              ) : (
                <span className="shrink-0 whitespace-nowrap rounded-full border-2 border-dashed border-border bg-background px-2 text-xs font-extrabold tabular-nums">
                  {formatNights(stop.nights ?? 1, { rough: true })}
                </span>
              )}
            </>
          )}
        </div>
```

`components/plan/mobile/stop-sheet.tsx`:
- Add `import { Stepper } from "@/components/ui/stepper";`.
- Add `onSetNights?(nights: number): void;` to `StopSheetProps`, and `onSetNights` to the destructuring.
- Replace line 152 (`<p className="truncate text-xs …">{stopSheetMeta(stop)}</p>`) with:
```tsx
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-xs font-semibold text-muted-foreground">{stopSheetMeta(stop)}</p>
                {onSetNights && (
                  <Stepper
                    value={rough ? (stop.nights ?? 1) : nightsBetween(stop.arriveDate!, stop.departDate!)}
                    onChange={onSetNights}
                    min={0}
                    max={366}
                    unit="n"
                    label={`Nights in ${stop.name}`}
                    className="shrink-0"
                  />
                )}
              </div>
```

`components/trip/itinerary-manager.tsx`:
- Add `setStopNights,` to the stops import (lines 56-65).
- Line 72: add `addDays` to the `@/lib/dates` import.
- After `handleSaveAdjustDates`, add:
```ts
  // Spec 2026-10-06 §N: −/+ nights from the Stop header and phone sheet. Rough:
  // writes nights; scheduled: moves depart and ripples (never moving a Pinned
  // Stop — that's the server's ripple rule), with the same Undo toast as a drag.
  async function handleSetNights(stopId: string, nights: number) {
    const stop = localStops.find((s) => s.id === stopId);
    if (!stop) return;
    const snapshot = localStops;
    const preSnapshot = localStops.map((s) => ({
      id: s.id, sortOrder: s.sortOrder, chapterId: s.chapterId, arriveDate: s.arriveDate, departDate: s.departDate,
    }));
    setLocalStops((prev) =>
      orderPlanStops(
        prev.map((s) =>
          s.id !== stopId ? s : s.arriveDate ? { ...s, departDate: addDays(s.arriveDate, nights) } : { ...s, nights },
        ),
      ),
    );
    try {
      const r = await setStopNights(stopId, nights);
      if (!r.success) {
        setLocalStops(snapshot);
        toastRefused(r.errors, "Couldn't change the nights.");
        return;
      }
      if (stop.arriveDate) applyReorderResult(stop.name, r.changed, r.conflicts, preSnapshot, r.payload);
    } catch {
      setLocalStops(snapshot);
      toastRejected();
    }
  }
```
- `<StopRow …>`: add `onSetNights={(n) => void handleSetNights(stop.id, n)}`.
- `<StopSheet …>`: add `onSetNights={(n) => void handleSetNights(sheetStop.id, n)}`.

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/plan components/trip/itinerary-manager.test.tsx components/ui/stepper.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/plan/stop-row.tsx components/plan/stop-row.test.tsx components/plan/mobile/stop-sheet.tsx components/plan/mobile/stop-sheet.test.tsx components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): change a Stop's nights inline with −/+

Spec 2026-10-06 §N: changing nights needed a dialog though setStopNights
existed. The Stop header and phone sheet get a Stepper; scheduled Stops
ripple with the usual Undo toast, and a refusal rolls back.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 46: Share chooser from the Trip header and Search  (spec §O)

**Files:**
- Create: `components/trip/share-events.ts`
- Create: `components/trip/share-chooser.tsx`
- Create: `components/trip/share-chooser.test.tsx`
- Modify: `app/(app)/trips/[tripId]/layout.tsx`: imports, the `ShareChooserMount` beside `OfflineWarmer` (line 207), and `ShareTripButton` before `<NotificationBell` (line 192)
- Modify: `app/(app)/trips/[tripId]/layout.test.tsx` (mock the new module)
- Modify: `components/trip/trip-header-trailing.tsx:31`, `components/trip/home/desktop/home-header.tsx:88` and `components/trip/day/day-header.tsx:81,114`. Put `<ShareTripButton />` immediately before each `<NotificationBell`.
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx:243` (an anchor on the Sharing card)
- Modify: `components/command-palette-results.tsx`: `CommandItem` (21-30), `doItems` (146-153), `useRunCommand` (188-197)
- Test: `components/command-palette.test.tsx`

**Interfaces:**
- Consumes: `listShareLinks(tripId): Promise<ShareLinkView[]>` (`server/actions/share.ts:100`), `shareUrl(token)` (Task 35), `useTripHref`, `toastRejected` (Task 31), `toast`
- Produces:
  - `export const OPEN_SHARE_EVENT = "teepee:open-share"`
  - `export function shareOrCopy(url: string, title: string): Promise<"shared" | "copied" | "cancelled" | "failed">`
  - `export function ShareTripButton(): JSX.Element`
  - `export function ShareChooserMount(props: { tripId: string }): JSX.Element`
  - `CommandItem.event?: string`

- [ ] **Step 1: Write the failing tests**

`components/trip/share-chooser.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listShareLinks = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/share", () => ({ listShareLinks: (id: string) => listShareLinks(id) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a>,
}));

import { toast } from "@/components/ui/use-toast";
import { ShareChooserMount, ShareTripButton } from "./share-chooser";

const LINK = { id: "l1", token: "tok-1", label: "Mum & Dad", includeAccommodation: true, includeTransport: true,
  includeDailyPlans: true, includeJournal: false, showTravellers: false, includeContacts: false, createdAt: "2026-09-20T00:00:00.000Z" };

function setup() {
  render(<><ShareChooserMount tripId="t1" /><ShareTripButton /></>);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
});

describe("Share chooser (spec 2026-10-06 §O)", () => {
  it("lists the Trip's Share links by label, plus New Share link… to Settings", async () => {
    listShareLinks.mockResolvedValue([LINK]);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("button", { name: "Mum & Dad" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Share link…" })).toHaveAttribute("href", "/trips/t1/settings#sharing");
    expect(listShareLinks).toHaveBeenCalledWith("t1");
  });

  it("with no links shows only New Share link…", async () => {
    listShareLinks.mockResolvedValue([]);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("link", { name: "New Share link…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mum & Dad" })).toBeNull();
  });

  it("on a computer, picking a link copies its URL and says so", async () => {
    listShareLinks.mockResolvedValue([LINK]);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    await user.click(await screen.findByRole("button", { name: "Mum & Dad" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/share/tok-1`));
    expect(toast).toHaveBeenCalledWith({ title: "Link copied" });
  });

  it("on a phone, picking a link hands its URL to the OS share sheet", async () => {
    listShareLinks.mockResolvedValue([LINK]);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    await user.click(await screen.findByRole("button", { name: "Mum & Dad" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "Mum & Dad", url: `${window.location.origin}/share/tok-1` }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("never creates a link", async () => {
    listShareLinks.mockResolvedValue([]);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    await screen.findByRole("link", { name: "New Share link…" });
    // The module imports only listShareLinks; a createShareLink call would throw on the mock.
    expect(listShareLinks).toHaveBeenCalledTimes(1);
  });
});
```
`components/command-palette.test.tsx`: append:
```ts
  it("Share (Do) opens the Share chooser rather than navigating", async () => {
    const onShare = vi.fn();
    window.addEventListener("teepee:open-share", onShare);
    const user = userEvent.setup();
    renderPalette();
    await user.click(await screen.findByText("Share"));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    window.removeEventListener("teepee:open-share", onShare);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/trip/share-chooser.test.tsx components/command-palette.test.tsx`
Expected: FAIL. `./share-chooser` can't be resolved, and there is no "Share" command.

- [ ] **Step 3: Implement**

`components/trip/share-events.ts`:
```ts
/** Window event that opens the Trip's Share chooser (spec 2026-10-06 §O) — from the header or Search. */
export const OPEN_SHARE_EVENT = "teepee:open-share";
```

`components/trip/share-chooser.tsx`:
```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Share2, Plus, Link as LinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { toastRejected } from "@/components/ui/action-failure";
import { listShareLinks, type ShareLinkView } from "@/server/actions/share";
import { shareUrl } from "@/components/trip/settings/share-links-panel";
import { useTripHref } from "@/components/trip/use-trip-href";
import { OPEN_SHARE_EVENT } from "@/components/trip/share-events";

export { OPEN_SHARE_EVENT };

/**
 * Hand a Share link's URL to the OS share sheet on phones (coarse pointer),
 * else copy it. Never creates anything (CONTEXT.md "Share link").
 */
export async function shareOrCopy(url: string, title: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const phone = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (phone && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Share sheet unavailable after all — fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/** The header's "Share" — opens the chooser mounted once by the trip layout. */
export function ShareTripButton() {
  return (
    <button
      type="button"
      aria-label="Share"
      onClick={() => window.dispatchEvent(new Event(OPEN_SHARE_EVENT))}
      className="pressable grid size-11 place-items-center rounded-md border-2 border-border bg-card text-foreground shadow-hard-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <Share2 className="size-5" strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}

/**
 * Spec 2026-10-06 §O: a small chooser listing the Trip's existing Share links
 * by label, plus "New Share link…" to Settings. Opened by OPEN_SHARE_EVENT
 * (header button, Search's Do group). Links load each time it opens.
 */
export function ShareChooserMount({ tripId }: { tripId: string }) {
  const tripHref = useTripHref(tripId);
  const [open, setOpen] = React.useState(false);
  const [links, setLinks] = React.useState<ShareLinkView[] | null>(null);

  React.useEffect(() => {
    function onOpen() {
      setOpen(true);
      setLinks(null);
      listShareLinks(tripId)
        .then(setLinks)
        .catch(() => {
          setLinks([]);
          toastRejected("Couldn't load your Share links.");
        });
    }
    window.addEventListener(OPEN_SHARE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SHARE_EVENT, onOpen);
  }, [tripId]);

  async function pick(link: ShareLinkView) {
    const outcome = await shareOrCopy(shareUrl(link.token), link.label);
    if (outcome === "copied") toast({ title: "Link copied" });
    if (outcome === "failed") toastRejected("Couldn't copy the link.");
    if (outcome !== "cancelled") setOpen(false);
  }

  const row = "pressable flex min-h-11 w-full items-center gap-2.5 rounded-md border-2 border-border bg-card px-3 text-left text-sm font-bold";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>Each Share link is made for one audience.</DialogDescription>
        </DialogHeader>
        {links === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.id}>
                <button type="button" className={row} onClick={() => void pick(link)}>
                  <LinkIcon className="size-4 shrink-0" aria-hidden="true" />
                  {link.label}
                </button>
              </li>
            ))}
            <li>
              <Link href={tripHref("/settings#sharing")} className={row} onClick={() => setOpen(false)}>
                <Plus className="size-4 shrink-0" aria-hidden="true" />
                New Share link…
              </Link>
            </li>
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

`app/(app)/trips/[tripId]/layout.tsx`: add `import { ShareChooserMount, ShareTripButton } from "@/components/trip/share-chooser";`. Insert `<ShareTripButton />` directly before `<NotificationBell` (line 192), and `<ShareChooserMount tripId={tripId} />` directly after `<OfflineWarmer … />` (line 207).
`app/(app)/trips/[tripId]/layout.test.tsx`: add this after line 93:
```ts
vi.mock("@/components/trip/share-chooser", () => ({ ShareChooserMount: () => null, ShareTripButton: () => null }));
```
`components/trip/trip-header-trailing.tsx`, `components/trip/home/desktop/home-header.tsx` and `components/trip/day/day-header.tsx` (both bells): add `import { ShareTripButton } from "@/components/trip/share-chooser";` and insert `<ShareTripButton />` immediately before each `<NotificationBell …/>`.

The spec says "Trip header overflow", but the header has no overflow menu today. The button sits beside the bell wherever the bell is.

`app/(app)/trips/[tripId]/settings/page.tsx` line 243: change `<Card>` above `<ShareLinksPanel …>` to `<Card id="sharing" className="scroll-mt-20 md:scroll-mt-6">`. This matches the `#travellers` card at line 216.

`components/command-palette-results.tsx`:
- Add `import { OPEN_SHARE_EVENT } from "@/components/trip/share-events";`.
- Add to `CommandItem`, after `href?`:
```ts
  /** A window event to dispatch instead of navigating (e.g. open the Share chooser). */
  event?: string;
```
- Add this to the trip-only `doItems` array after "Add Stop":
```ts
            { key: "do:share", label: "Share", event: OPEN_SHARE_EVENT },
```
- In `useRunCommand`, replace `if (item.href) router.push(item.href);` with:
```ts
      if (item.event) window.dispatchEvent(new Event(item.event));
      else if (item.href) router.push(item.href);
```

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/trip/share-chooser.test.tsx components/command-palette.test.tsx components/command-palette-mount.test.tsx "app/(app)/trips/[tripId]/layout.test.tsx" components/trip/trip-header-trailing.test.tsx components/trip/home/desktop/home-header.test.tsx components/trip/day components/shell`
Expected: PASS. If a header test counts buttons, update its expectation to include the new "Share" button and say so in the commit body.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/trip/share-events.ts components/trip/share-chooser.tsx components/trip/share-chooser.test.tsx "app/(app)/trips/[tripId]/layout.tsx" "app/(app)/trips/[tripId]/layout.test.tsx" components/trip/trip-header-trailing.tsx components/trip/home/desktop/home-header.tsx components/trip/day/day-header.tsx "app/(app)/trips/[tripId]/settings/page.tsx" components/command-palette-results.tsx components/command-palette.test.tsx
git commit -m "feat(share): Share from the Trip header and Search

Spec 2026-10-06 §O: sharing lived only in Settings. A Share button and a
Search command open a chooser of the Trip's existing Share links (OS share
sheet on phones, else copy) plus New Share link… to Settings. Nothing is
created implicitly.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 47: Optimistic votes and checklist ticks  (spec §W)

**Files:**
- Modify: `components/trip/vote-control.tsx:67-140` (`handleSelect` and the render's `myVote?.level` reads) and imports
- Modify: `components/trip/checklist.tsx`: `ChecklistRow` (440-512: drop the internal `toggle`, add an `onToggle` prop) and `Checklist` (645-722: `useOptimistic` over `items`)
- Test: `components/trip/vote-control.test.tsx`, `components/trip/checklist.test.tsx`

**Interfaces:**
- Consumes: `toastRefused`, `toastRejected` (Task 31). Pattern reference: `components/money/to-pay-panel.tsx:34-56`, and the Next guide `node_modules/next/dist/docs/01-app/02-guides/interactive-apps.md:141-176` (`useOptimistic` + `startTransition`; the value reverts when the transition ends).
- Produces: `ChecklistRow` prop `onToggle: () => void` (file-internal)

- [ ] **Step 1: Write the failing tests**

`components/trip/vote-control.test.tsx`: change the mock to resolve real results, and mock toast:
```ts
vi.mock("@/server/actions/votes", () => ({
  setVote: vi.fn().mockResolvedValue({ success: true }),
  clearVote: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import { act } from "react";
```
Append:
```ts
  it("shows the vote at once, and rolls back with a toast when the server refuses (spec 2026-10-06 §W)", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(setVote).mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    render(<VoteControl {...baseProps} />);
    await user.click(screen.getByRole("radio", { name: "Must" }));
    expect(screen.getByRole("radio", { name: /must.*clear your vote/i })).toHaveAttribute("aria-checked", "true");
    await act(async () => resolve({ success: false, errors: { _: ["Couldn't save your vote."] } }));
    expect(screen.getByRole("radio", { name: "Must" })).toHaveAttribute("aria-checked", "false");
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't save your vote." });
  });
```
`components/trip/checklist.test.tsx`: add this after the actions mock (line 12):
```ts
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import { act } from "react";
```
Append inside `describe("Checklist")`:
```ts
  it("ticks at once, and rolls back with a toast when the server refuses (spec 2026-10-06 §W)", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(toggleChecklistItem).mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    render(<Checklist tripId="trip-1" kind="PRETRIP" items={seedItems} showDueDate={false} showAssignee={false} />);
    const box = screen.getByRole("checkbox", { name: "Book airport taxi" });
    await user.click(box);
    expect(box).toBeChecked();
    await act(async () => resolve({ success: false, errors: { _: ["Couldn't update that item."] } }));
    expect(box).not.toBeChecked();
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't update that item." });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run components/trip/vote-control.test.tsx components/trip/checklist.test.tsx -t "spec 2026-10-06"`
Expected: FAIL. The radio/checkbox stays unchanged until the server answers, and no toast fires.

- [ ] **Step 3: Implement**

`components/trip/vote-control.tsx`: add `import { toastRefused, toastRejected } from "@/components/ui/action-failure";`. Replace from `const [isPending, startTransition] = React.useTransition();` through the end of `handleSelect` with:
```ts
  const [, startTransition] = React.useTransition();

  const myVote = votes.find((v) => v.userId === currentUserId);
  const otherVotes = votes.filter((v) => v.userId !== currentUserId);
  // Spec 2026-10-06 §W: the vote shows the moment it's tapped; it reverts to
  // the server's answer when the action settles (and a refusal toasts).
  const [shownLevel, setShownLevel] = React.useOptimistic<VoteLevel | null>(myVote?.level ?? null);

  function handleSelect(level: VoteLevel) {
    // Tapping the active level clears the vote.
    const next = shownLevel === level ? null : level;
    startTransition(async () => {
      setShownLevel(next);
      try {
        const r = next === null ? await clearVote(tripId, itemId) : await setVote(tripId, itemId, next);
        if (!r.success) toastRefused(r.errors, "Couldn't save your vote.");
      } catch {
        toastRejected("Couldn't save your vote.");
      }
    });
  }
```
Then, in the JSX, replace every `myVote?.level` with `shownLevel` (the Segmented `value`, each item's `aria-label`/`title`, the `onClick` guard and the icon branch). Change the `Segmented` `className` to `className="rounded-full p-1"`, dropping the `isPending` dimming because the vote now shows at once.

`components/trip/checklist.tsx`:
- Add `import { toastRefused, toastRejected } from "@/components/ui/action-failure";`.
- `ChecklistRow`: add `onToggle,` to the destructuring and `onToggle: () => void;` to its props type. Delete the `toggle` function (lines 471-475), and change the `Checkbox`'s `onChange={toggle}` to `onChange={onToggle}`.
- `Checklist`: after the `today` `useSyncExternalStore`, add:
```ts
  // Spec 2026-10-06 §W: a tick shows at once (and moves the progress bar);
  // it reverts to the server's answer when the action settles.
  const [shown, setShownDone] = React.useOptimistic(items, (state, u: { id: string; done: boolean }) =>
    state.map((i) => (i.id === u.id ? { ...i, done: u.done } : i)),
  );
  function toggleItem(item: ChecklistItemRow) {
    React.startTransition(async () => {
      setShownDone({ id: item.id, done: !item.done });
      try {
        const r = await toggleChecklistItem(item.id, !item.done);
        if (!r.success) toastRefused(r.errors, "Couldn't update that item.");
      } catch {
        toastRejected("Couldn't update that item.");
      }
    });
  }
```
- Change `const doneCount = items.filter((i) => i.done).length;` to compute from `shown`, and move it below the `useOptimistic` line:
  `const doneCount = shown.filter((i) => i.done).length;`
- In the non-empty render, map over `shown` instead of `items`:
  `{shown.map((item, idx) => ( <ChecklistRow key={item.id} item={item} … isLast={idx === shown.length - 1} onToggle={() => toggleItem(item)} … /> ))}`.
  `ChecklistProgress` gets `total={shown.length}`. The empty-state branch keeps reading `items`.

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run components/trip/vote-control.test.tsx components/trip/checklist.test.tsx components/trip/wishlist-board.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add components/trip/vote-control.tsx components/trip/vote-control.test.tsx components/trip/checklist.tsx components/trip/checklist.test.tsx
git commit -m "feat: votes and checklist ticks show at once

Spec 2026-10-06 §W: both waited for the round trip. useOptimistic shows the
change immediately; a refused or failed action reverts with a toast.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 48: Optimistic calendar drag  (spec §W)

**Files:**
- Create: `lib/calendar-move.ts`
- Create: `lib/calendar-move.test.ts`
- Modify: `components/trip/calendar-views.tsx:136-180` (`handleDropItem`), the `<MonthGrid days=…>` prop (~243) and imports (line 14)
- Test: `components/trip/calendar-views.test.tsx`

**Interfaces:**
- Consumes: `DayPlan`, `ItemEntry` (`lib/itinerary.ts:119,135`), `toastRefused`, `toastRejected` (Task 31)
- Produces: `export function moveItemInDays(days: DayPlan[], itemId: string, dateISO: string): DayPlan[]`

- [ ] **Step 1: Write the failing tests**

`lib/calendar-move.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { moveItemInDays } from "./calendar-move";
import type { DayPlan } from "@/lib/itinerary";

const day = (dateISO: string, untimed: string[] = [], timed: Array<[string, string]> = []): DayPlan => ({
  dateISO, stop: null, transportEntries: [], accommodationEntries: [],
  untimedItems: untimed.map((id) => ({ kind: "item" as const, item: { id, title: id, category: "OTHER", date: dateISO, startTime: null } })),
  timedItems: timed.map(([id, t]) => ({ kind: "item" as const, item: { id, title: id, category: "OTHER", date: dateISO, startTime: t } })),
});

describe("moveItemInDays (spec 2026-10-06 §W)", () => {
  it("moves an untimed item to the target day and re-dates it", () => {
    const out = moveItemInDays([day("2026-08-02", ["a"]), day("2026-08-03")], "a", "2026-08-03");
    expect(out[0].untimedItems).toEqual([]);
    expect(out[1].untimedItems.map((e) => [e.item.id, e.item.date])).toEqual([["a", "2026-08-03"]]);
  });
  it("keeps a timed item timed, in start-time order", () => {
    const out = moveItemInDays([day("2026-08-02", [], [["a", "09:00"]]), day("2026-08-03", [], [["b", "08:00"], ["c", "11:00"]])], "a", "2026-08-03");
    expect(out[1].timedItems.map((e) => e.item.id)).toEqual(["b", "a", "c"]);
  });
  it("returns the days unchanged when the item or target day isn't there", () => {
    const days = [day("2026-08-02", ["a"])];
    expect(moveItemInDays(days, "zzz", "2026-08-02")).toBe(days);
    expect(moveItemInDays(days, "a", "2026-09-01")).toBe(days);
  });
});
```
`components/trip/calendar-views.test.tsx`: change the `MonthGrid` mock (lines 13-20) to also capture `days`:
```ts
let capturedOnDropItem: ((itemId: string, dateISO: string) => void) | undefined;
let capturedDays: Array<{ dateISO: string; untimedItems: Array<{ item: { id: string } }> }> | undefined;
vi.mock("@/components/trip/month-grid", () => ({
  MonthGrid: (props: { onDropItem?: (itemId: string, dateISO: string) => void; days: typeof capturedDays }) => {
    capturedOnDropItem = props.onDropItem;
    capturedDays = props.days;
    return null;
  },
}));
```
Add `import { toast } from "@/components/ui/use-toast";` (the module is already mocked at line 28) and append inside `describe("CalendarViews drop routing (ADR 0019 P0-4)")`:
```ts
  it("a dated item moves at once, and moves back with a toast when refused (spec 2026-10-06 §W)", async () => {
    mockEnv(true, "month");
    let resolve!: (v: unknown) => void;
    rescheduleItemMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const days = [
      { dateISO: "2026-08-02", stop: null, timedItems: [], transportEntries: [], accommodationEntries: [],
        untimedItems: [{ kind: "item" as const, item: { id: "item-9", title: "Louvre", category: "SIGHTSEEING", date: "2026-08-02", startTime: null } }] },
      { dateISO: "2026-08-03", stop: null, timedItems: [], untimedItems: [], transportEntries: [], accommodationEntries: [] },
    ];
    render(<CalendarViews {...baseProps} days={days} wishlistItems={wishlistItems} />);
    await act(async () => {
      capturedOnDropItem!("item-9", "2026-08-03");
    });
    expect(capturedDays![1].untimedItems.map((e) => e.item.id)).toEqual(["item-9"]);
    await act(async () => resolve({ success: false, errors: { date: ["That day is outside the trip."] } }));
    expect(capturedDays![0].untimedItems.map((e) => e.item.id)).toEqual(["item-9"]);
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "That day is outside the trip." });
  });
```
(In `afterEach`, add `capturedDays = undefined;`.)

- [ ] **Step 2: Run the tests to verify they fail**
Run: `TZ=UTC npx vitest run lib/calendar-move.test.ts components/trip/calendar-views.test.tsx`
Expected: FAIL. `./calendar-move` can't be resolved and the item stays on 08-02 while the action is pending.

- [ ] **Step 3: Implement**

`lib/calendar-move.ts`:
```ts
/**
 * Optimistic calendar drag (spec 2026-10-06 §W): move one scheduled Item's
 * entry to another day of the projected DayPlans, re-dated, keeping it timed
 * (in start-time order) or untimed. PURE. Returns the input unchanged when the
 * Item or the target day isn't in view.
 */
import type { DayPlan, ItemEntry } from "@/lib/itinerary";

export function moveItemInDays(days: DayPlan[], itemId: string, dateISO: string): DayPlan[] {
  if (!days.some((d) => d.dateISO === dateISO)) return days;
  let moving: ItemEntry | null = null;
  for (const d of days) {
    moving = [...d.timedItems, ...d.untimedItems].find((e) => e.item.id === itemId) ?? null;
    if (moving) break;
  }
  if (!moving) return days;
  const moved: ItemEntry = { ...moving, item: { ...moving.item, date: dateISO } };
  const timed = Boolean(moved.item.startTime);
  return days.map((d) => {
    const timedItems = d.timedItems.filter((e) => e.item.id !== itemId);
    const untimedItems = d.untimedItems.filter((e) => e.item.id !== itemId);
    if (d.dateISO !== dateISO) {
      return timedItems.length === d.timedItems.length && untimedItems.length === d.untimedItems.length
        ? d
        : { ...d, timedItems, untimedItems };
    }
    return timed
      ? { ...d, untimedItems, timedItems: [...timedItems, moved].sort((a, b) => (a.item.startTime ?? "").localeCompare(b.item.startTime ?? "")) }
      : { ...d, timedItems, untimedItems: [...untimedItems, moved] };
  });
}
```

`components/trip/calendar-views.tsx`: replace line 14 (`import { toast } …`) with:
```ts
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { moveItemInDays } from "@/lib/calendar-move";
```
Replace `handleDropItem` with:
```ts
  // Spec 2026-10-06 §W: a dated item moves the moment it's dropped and moves
  // back if the server refuses. A Wishlist idea is copied in (ADR 0019), so
  // it appears when the server answers.
  const [shownDays, moveShown] = React.useOptimistic(days, (state, move: { itemId: string; dateISO: string }) =>
    moveItemInDays(state, move.itemId, move.dateISO),
  );

  const handleDropItem = React.useCallback(
    (itemId: string, dateISO: string) => {
      startTransition(async () => {
        const isIdea = wishlistIds.has(itemId);
        if (!isIdea) moveShown({ itemId, dateISO });
        try {
          const result = isIdea
            ? await scheduleItem(itemId, { date: dateISO })
            : await rescheduleItem(itemId, dateISO);
          if (!result.success) {
            toastRefused(result.errors.date?.[0], "Couldn't move that item.");
            return;
          }
        } catch {
          toastRejected("Couldn't move that item.");
          return;
        }
        router.refresh();
      });
    },
    [router, wishlistIds, moveShown],
  );
```
On `<MonthGrid …>`, change `days={days}` to `days={shownDays}`. Leave `AgendaView` on `days`; the drag only happens in the month grid. Keep `router.refresh()`: removing it is §J's job, not this task's.

- [ ] **Step 4: Run the tests to verify they pass**
Run: `TZ=UTC npx vitest run lib/calendar-move.test.ts components/trip/calendar-views.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/calendar-move.ts lib/calendar-move.test.ts components/trip/calendar-views.tsx components/trip/calendar-views.test.tsx
git commit -m "feat(calendar): a dragged plan lands at once

Spec 2026-10-06 §W: the month grid waited for the round trip before showing
a moved Item. useOptimistic moves it immediately and moves it back, with a
toast, when the server refuses.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task list

31. Failure-toast helpers + Item dialog delete (§E)
32. Plan editor: chapter delete, accommodation delete, adjust dates (§E)
33. Cost, Wishlist idea and Globe Marker deletes (§E)
34. Attachment, Reminder and To-pay deletes (§E)
35. Calendar feed and Share-link panels (§E)
36. `?add=` hook + Wishlist `?add=item` + Search "Add Item" (§F)
37. Phase-aware Other-cost defaults (§K)
38. Money `?add=cost` with Phase defaults + Quick action "Add a cost" (§F, §K)
39. `?add=stop` shortcuts + Plan `?add=transport&from&to` (§F)
40. Flags and Next steps land on their Stop or leg (§F)
41. Summary departure date in the leg's timezone (§G)
42. Editing a Stop uses PlaceCombobox (§L)
43. FormDialog asks before discarding: infra + Stop and Chapter (§M)
44. Item, Transport and Accommodation forms report dirtiness (§M)
45. Nights stepper on the Stop header and phone sheet (§N)
46. Share chooser from the Trip header and Search (§O)
47. Optimistic votes and checklist ticks (§W)
48. Optimistic calendar drag (§W)

## Section self-check

**Covered:**
- **§E, every listed site.** `item-form-dialog:624` → 31. `itinerary-manager:998,1058,1202` → 32. `cost-editor:398` (with a new catch), `wishlist-board:142`, `globe-view:82` → 33. `attachment-list:208`, `reminders-card:219`, `to-pay-panel:116` → 34. `calendar-feed-panel:90-96`, `share-links-panel:182` → 35. Each site has a success:false or rejection test, and the dialog stays open in 31 and 32.
- **§F.**
  - `?add=stop` links → 39.
  - `?add=item` and Search "Add Item" → 36.
  - `?add=cost` and Quick action "Add a cost" → 38.
  - Flag and nudge hrefs → 40, plus the `?add=transport` handler → 39.
  - Param stripping → 36 and 39.
- **§G** → 41.
- **§K** → 37 (lib and form), 38 (budget page wiring).
- **§L** → 42.
- **§M** → 43 (FormDialog, Stop, Chapter), 44 (Item, Transport, Accommodation).
- **§N** → 45.
- **§O** → 46.
- **§W** → 47 (votes, checklist), 48 (calendar).

**Judgement calls and deviations:**
1. **No file written.** The plan file itself couldn't be written because my system rules for this session forbid creating files; the full content is above.
2. **Spec paths and lines that drifted.**
   - `cost-editor.tsx` lives at `components/trip/`, not `components/money/`.
   - The `?add=stop` handler is at `itinerary-manager.tsx:582-603` and `?stop=` at 729, both as cited.
   - The Summary badge is at 660-667.
3. **`?stop=` is not stripped after opening** (§F's last bullet). It *is* the Stop sheet's open state, so stripping it would close the sheet. `closeStopSheet` already removes it on close. On desktop, `?stop=` opens the existing full-screen StopSheet, which is the existing behaviour.
4. **TRANSPORT Flags carry a transport id in `targetId`, not a Stop id.** Task 40 adds `Flag.stopId` and `Flag.connection` so these Flags reach the right Stop or the Add-transport form. The "Book transport" link is applied to the missing-connection Flag ("No transport booked between A and B"). The "legs missing times" nudge stays `/plan` because it concerns existing legs. Task 40 also routes the Summary `FlagList` links through `flagHref`; they went to the trip Home before. That's within "Flags land on their Stop", but it's an addition beyond the spec's next-steps-only wording.
5. **§O: there is no overflow menu in the Trip header.** The Share button sits beside the Notification bell in all four header homes. "The existing toast" for copying doesn't exist, so Task 46 uses `toast({ title: "Link copied" })`.
6. **§K "with §F the quick action opens the form directly"** is done in 38. The §A CONTEXT.md amendment named under §K belongs to whoever plans §A; it isn't planned here.
7. **Commit footer.** RULES.md specifies "Claude Fable 5.1"; the attribution reminder in this session requires "Claude Fable 5.1", and I followed the reminder. Pick one to make the sections consistent.
8. **Ordering and test-file sharing.**
   - 31 must land first.
   - 36 before 38 and 39.
   - 37 before 38.
   - 35 before 46 (it exports `shareUrl`).
   - 43 before 44.
   - 42 before 43, because 43 references Task 42's `picked` state in `StopForm`.
   - Tasks 32, 39 and 45 all edit `itinerary-manager.tsx` and its test, so run them in order.

**Could not plan:** nothing from the assigned parts was left out.


---

# Section 4 — Photon typeahead, batch-geocode spacing, platform tooling, docs (Tasks 49–62)

Specs: `docs/specs/2026-10-06-typeahead-photon.md` (all of §A–§E) and `docs/specs/2026-10-06-perf-ux-batch.md` §X (everything except `server-only`, the AWS pin and lazy S3) and §Y.

**Order constraints:** Tasks 49→50 and 49→51 in order. Task 58 runs after the §B Day-loader tasks from the other section. Tasks 59–60 (knip) run after every other code task in the whole plan. 61 and 62 run last.

---

### Task 49: Photon client `searchPlacesTypeahead`  (photon spec §A)

**Files:**
- Modify: `lib/geocode.ts:1-10` (module docblock), `lib/geocode.ts:144-165` (`cachedFetchJson`), append after `searchPlacesWithStatus` (ends line 219)
- Test: `lib/geocode.test.ts`

**Interfaces:**
- Consumes: `cachedFetchJson`, `GeoCandidate`, `PlaceSearchOutcome`, `ACCEPT_LANGUAGE`, `_resetGeocodeCacheForTests` (all in `lib/geocode.ts` today)
- Produces: `export async function searchPlacesTypeahead(query: string, limit = 5): Promise<PlaceSearchOutcome>`

- [ ] **Step 1: Write the failing test**

In `lib/geocode.test.ts`, change line 2's import to:
```ts
import { geocodePlace, searchPlaces, searchPlacesWithStatus, searchPlacesTypeahead, reverseGeocode, _resetGeocodeCacheForTests } from "./geocode";
```
Then append at the end of the file:
```ts
// ADR 0069: the as-you-type combobox searches Photon, not Nominatim.
const photonFC = (features: unknown[]) => ({ type: "FeatureCollection", features });
const photonFeature = (coordinates: unknown, properties: Record<string, unknown>) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties,
});

describe("searchPlacesTypeahead (Photon)", () => {
  it("maps a feature to a GeoCandidate, lng/lat order, lower-cased country code", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        photonFC([
          photonFeature([139.7454, 35.6586], {
            name: "Tokyo Tower", city: "Tokyo", country: "Japan", countrycode: "JP", osm_value: "attraction",
          }),
        ]),
    });
    const res = await searchPlacesTypeahead("Tokyo Tower");
    expect(res).toEqual({
      status: "ok",
      candidates: [{ name: "Tokyo Tower, Tokyo, Japan", lat: 35.6586, lng: 139.7454, city: "Tokyo", country: "Japan", countryCode: "jp" }],
    });
  });

  it("falls back through town/village/locality and drops a duplicate name part", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        photonFC([
          photonFeature([13.64, 47.56], { name: "Hallstatt", village: "Hallstatt", country: "Austria", countrycode: "AT" }),
          photonFeature([2.1, 41.4], { name: "Sagrada Família", locality: "Eixample", country: "Spain" }),
        ]),
    });
    const res = await searchPlacesTypeahead("place");
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.candidates[0]).toMatchObject({ name: "Hallstatt, Austria", city: "Hallstatt", countryCode: "at" });
    expect(res.candidates[1]).toMatchObject({ name: "Sagrada Família, Eixample, Spain", city: "Eixample", countryCode: null });
  });

  it("skips features without numeric coordinates", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        photonFC([
          photonFeature(["x", 1], { name: "Bad" }),
          { type: "Feature", properties: { name: "No geometry" } },
          photonFeature([151.21, -33.87], { name: "Sydney", country: "Australia", countrycode: "AU" }),
        ]),
    });
    const res = await searchPlacesTypeahead("syd");
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.candidates.map((c) => c.name)).toEqual(["Sydney, Australia"]);
  });

  it("returns ok with no candidates on an empty FeatureCollection", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => photonFC([]) });
    expect(await searchPlacesTypeahead("nowhere-xyz")).toEqual({ status: "ok", candidates: [] });
  });

  it("returns ok with no candidates and no fetch for a blank query", async () => {
    expect(await searchPlacesTypeahead("   ")).toEqual({ status: "ok", candidates: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns error on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    expect(await searchPlacesTypeahead("paris")).toEqual({ status: "error" });
  });

  it("returns error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await searchPlacesTypeahead("paris")).toEqual({ status: "error" });
  });

  it("returns error on a body that is not a GeoJSON FeatureCollection, and does not cache it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: "oops" }) });
    expect(await searchPlacesTypeahead("retry-photon")).toEqual({ status: "error" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => photonFC([]) });
    expect(await searchPlacesTypeahead("retry-photon")).toEqual({ status: "ok", candidates: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls Photon with q, limit and lang=en", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => photonFC([]) });
    await searchPlacesTypeahead("Tokyo Tower", 5);
    const [url] = fetchMock.mock.calls[0];
    expect(url as string).toMatch(/^https:\/\/photon\.komoot\.io\/api\?/);
    expect(url as string).toContain("lang=en");
    expect(url as string).toContain("limit=5");
    expect(url as string).toContain("q=Tokyo+Tower");
  });

  it("serves a repeated identical query from cache (one fetch)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => photonFC([photonFeature([2.35, 48.85], { name: "Paris", country: "France", countrycode: "FR" })]),
    });
    await searchPlacesTypeahead("cache-hit-photon");
    const second = await searchPlacesTypeahead("cache-hit-photon");
    expect(second.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run lib/geocode.test.ts -t "Photon"`
Expected: FAIL with `searchPlacesTypeahead is not a function` (or a TS import error).

- [ ] **Step 3: Implement**

(a) Replace the module docblock (lines 1–10) with:
```ts
/**
 * Geocoding helpers — OpenStreetMap Nominatim for one-off lookups (saving a
 * place, reverse geocoding, button-press search) and Photon (komoot) for the
 * as-you-type place combobox (ADR 0069; Nominatim's policy forbids
 * autocomplete).
 *
 * Rules:
 * - Never throws; always returns null / { status: "error" } on any error.
 * - Uses an AbortController timeout so it doesn't block actions indefinitely.
 * - Sets a descriptive User-Agent header (required by Nominatim's usage policy;
 *   harmless to Photon).
 * - Memoises successful responses in-process by URL (ADR 0028). Failures —
 *   including a 2xx body of the wrong shape — are never cached.
 */
```

(b) Replace `cachedFetchJson` (lines 144–165, docblock included) with:
```ts
/**
 * Fetch and parse JSON from a geocoder URL, memoising successful responses by
 * URL. Returns the parsed body on success (HTTP 2xx + valid JSON + `accept`
 * says the shape is right), or null on any failure (which is NOT cached).
 * Never throws.
 */
async function cachedFetchJson(
  url: string,
  accept: (data: unknown) => boolean = () => true,
): Promise<unknown | null> {
  if (responseCache.has(url)) return responseCache.get(url) ?? null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!accept(data)) return null;
    responseCache.set(url, data);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

(c) Directly after `searchPlacesWithStatus` (after its closing brace, currently line 219), insert:
```ts
// ---------------------------------------------------------------------------
// Photon (komoot) — the as-you-type place search (ADR 0069)
// ---------------------------------------------------------------------------

const PHOTON_URL = "https://photon.komoot.io/api";

interface PhotonProperties {
  name?: string;
  city?: string;
  town?: string;
  village?: string;
  locality?: string;
  country?: string;
  /** ISO 3166-1 alpha-2, upper-case in Photon's responses. */
  countrycode?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: PhotonProperties;
}

function isPhotonFeatureCollection(data: unknown): data is { type: "FeatureCollection"; features: PhotonFeature[] } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as { type?: unknown; features?: unknown };
  return d.type === "FeatureCollection" && Array.isArray(d.features);
}

/** Photon has no `display_name`: compose "name, city, country", blanks and repeats dropped. */
function photonToCandidate(feature: PhotonFeature): GeoCandidate | null {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords; // GeoJSON order
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = feature.properties ?? {};
  const city = p.city ?? p.town ?? p.village ?? p.locality ?? null;
  const country = p.country ?? null;
  const parts: string[] = [];
  for (const part of [p.name, city, country]) {
    const t = part?.trim();
    if (t && !parts.includes(t)) parts.push(t);
  }
  return {
    name: parts.join(", "),
    lat,
    lng,
    city,
    country,
    countryCode: p.countrycode ? p.countrycode.toLowerCase() : null,
  };
}

/**
 * As-you-type place search on Photon (photon.komoot.io), built for
 * autocomplete. Same contract as `searchPlacesWithStatus`: never throws;
 * "error" on network error, timeout, non-2xx or a body that is not a GeoJSON
 * FeatureCollection; "ok" with [] on no match. No fallback to Nominatim on
 * error — that would recreate the policy violation (ADR 0069).
 */
export async function searchPlacesTypeahead(query: string, limit = 5): Promise<PlaceSearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "ok", candidates: [] };

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", ACCEPT_LANGUAGE);

  const data = await cachedFetchJson(url.toString(), isPhotonFeatureCollection);
  if (!isPhotonFeatureCollection(data)) return { status: "error" };
  const candidates = data.features
    .map(photonToCandidate)
    .filter((c): c is GeoCandidate => c !== null);
  return { status: "ok", candidates };
}
```
Also change the `GeoCandidate` docblock (line 73) from "A resolved place from Nominatim, …" to "A resolved place from Nominatim or Photon, with the address components we care about."

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run lib/geocode.test.ts`
Expected: PASS (all the existing Nominatim tests too).

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/geocode.ts lib/geocode.test.ts
git commit -m "feat(geocode): add Photon client for the typeahead

Nominatim's usage policy forbids autocomplete; the place combobox now
queries from two characters (ADR 0069). searchPlacesTypeahead keeps
searchPlacesWithStatus's contract and cache, and a wrong-shape body is
an error that is never cached.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 50: The combobox's action uses Photon  (photon spec §B)

**Files:**
- Modify: `server/actions/places.ts:1-14`
- Test: `server/actions/places.test.ts`

**Interfaces:**
- Consumes: `searchPlacesTypeahead(query: string, limit = 5): Promise<PlaceSearchOutcome>` (Task 49)
- Produces: nothing new (`findPlaces(query: string): Promise<PlaceSearchOutcome>` unchanged)

- [ ] **Step 1: Write the failing test**

Replace lines 3–5 of `server/actions/places.test.ts` with:
```ts
const { requireUser, search, nominatim } = vi.hoisted(() => ({ requireUser: vi.fn(), search: vi.fn(), nominatim: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser }));
vi.mock("@/lib/geocode", () => ({ searchPlacesTypeahead: search, searchPlacesWithStatus: nominatim }));
```
In the `beforeEach`, add `nominatim.mockReset();`. Then add this test inside the `describe`:
```ts
  it("searches Photon, never Nominatim (ADR 0069: no autocomplete on Nominatim)", async () => {
    await findPlaces("Sydney");
    expect(search).toHaveBeenCalledWith("Sydney", 5);
    expect(nominatim).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run server/actions/places.test.ts -t "Photon"`
Expected: FAIL. `search` was not called, and `nominatim` was called with ("Sydney", 5).

- [ ] **Step 3: Implement**

Replace the whole of `server/actions/places.ts` with:
```ts
"use server";

import { requireUser } from "@/lib/guards";
import { searchPlacesTypeahead, type PlaceSearchOutcome } from "@/lib/geocode";

/**
 * The place combobox's as-you-type search (components/ui/place-combobox.tsx),
 * for pages with no Trip or Globe yet (New trip) and the Stop forms. Goes to
 * Photon, not Nominatim — Nominatim forbids autocomplete (ADR 0069).
 * Server-side and session-gated like every action.
 */
export async function findPlaces(query: string): Promise<PlaceSearchOutcome> {
  await requireUser();
  if (typeof query !== "string") return { status: "ok", candidates: [] };
  return searchPlacesTypeahead(query.slice(0, 200), 5);
}
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run server/actions/places.test.ts components/ui/place-combobox.test.tsx lib/server-action-exports.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add server/actions/places.ts server/actions/places.test.ts
git commit -m "feat(places): send the combobox typeahead to Photon

findPlaces backs the as-you-type place combobox, which Nominatim's
policy forbids. Same session gate, 200-char cap and five results. The
Globe and Transport button-press searches stay on Nominatim (ADR 0069).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 51: Batch geocodes skip located Stops and are spaced 1 s  (photon spec §C)

The spec's lines have drifted slightly. The geocode calls are at `server/actions/stops.ts:925` (`firmUpSegment`) and `:1053` (`firmUpTrip`). Both are firm-up loops: the spec's "re-flow ~925" is `firmUpSegment`. `locateRoughStops` is at `server/actions/trips.ts:165-177`.

**Files:**
- Modify: `lib/geocode.ts` (append after `_resetGeocodeCacheForTests`, line 142)
- Modify: `server/actions/stops.ts:9` (import), `:881-892` (select), `:923-925` (loop), `:1022-1025` (select), `:1051-1053` (loop)
- Modify: `server/actions/trips.ts:9` (import), `:165-177`
- Test: `lib/geocode.test.ts`, `server/actions/stops.test.ts`, `server/actions/firm-up-trip.test.ts`, `server/actions/trips.test.ts`

**Interfaces:**
- Consumes: `geocodePlaceDetailed(query: string): Promise<GeoCandidate | null>` (exists)
- Produces: `export async function paceNominatim(): Promise<void>`, `export function _resetNominatimPaceForTests(): void`

- [ ] **Step 1: Write the failing tests**

(a) `lib/geocode.test.ts`: add `paceNominatim, _resetNominatimPaceForTests` to the line-2 import and append:
```ts
describe("paceNominatim", () => {
  afterEach(() => {
    vi.useRealTimers();
    _resetNominatimPaceForTests();
  });

  it("is a no-op for the first call", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = paceNominatim().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await p;
  });

  it("spaces the next call at least 1000 ms after the previous one", async () => {
    vi.useFakeTimers();
    await paceNominatim();
    let done = false;
    const p = paceNominatim().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });

  it("does not wait when the previous call was over a second ago", async () => {
    vi.useFakeTimers();
    await paceNominatim();
    await vi.advanceTimersByTimeAsync(1500);
    let done = false;
    const p = paceNominatim().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await p;
  });
});
```

(b) `server/actions/stops.test.ts`: directly above line 154 (`vi.mock("@/lib/geocode", …)`) add `const paceNominatimMock = vi.hoisted(() => vi.fn());`, and change line 154 to:
```ts
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodePlaceMock, geocodePlaceDetailed: geocodePlaceDetailedMock, paceNominatim: paceNominatimMock }));
```
Append at the end of the file:
```ts
// ADR 0069 / spec 2026-10-06-typeahead-photon §C.
describe("firmUpSegment: geocodes respect Nominatim", () => {
  const row = (id: string, sortOrder: number, located: boolean) => ({
    id, sortOrder, chapterId: null, nights: 2, pinned: false, arriveDate: null, departDate: null,
    timezone: null, name: `Stop ${id}`, country: "Italy",
    lat: located ? 41.9 : null, lng: located ? 12.5 : null,
  });

  beforeEach(() => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopUpdateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});
    geocodePlaceDetailedMock.mockResolvedValue(null);
  });

  it("selects lat/lng so it can tell a located Stop", async () => {
    stopFindManyMock.mockResolvedValue([row("a", 0, true)]);
    await firmUpSegment({ tripId: "trip-1" });
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ lat: true, lng: true }) }),
    );
  });

  it("makes zero geocode calls when every Stop is located, writing only dates and timezone", async () => {
    stopFindManyMock.mockResolvedValue([row("a", 0, true), row("b", 1, true)]);
    await firmUpSegment({ tripId: "trip-1" });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(paceNominatimMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).toHaveBeenCalledTimes(2);
    for (const [arg] of stopUpdateMock.mock.calls) {
      expect(Object.keys(arg.data).sort()).toEqual(["arriveDate", "departDate", "timezone"]);
    }
  });

  it("makes two paced geocode calls for two unlocated Stops", async () => {
    stopFindManyMock.mockResolvedValue([row("a", 0, false), row("b", 1, false)]);
    await firmUpSegment({ tripId: "trip-1" });
    expect(geocodePlaceDetailedMock).toHaveBeenCalledTimes(2);
    expect(paceNominatimMock).toHaveBeenCalledTimes(2);
  });
});
```

(c) `server/actions/firm-up-trip.test.ts`: add `paceMock` to the hoisted destructure and object (`paceMock: vi.fn(),`). Change line 25 to:
```ts
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodeMock, geocodePlaceDetailed: geocodeMock, paceNominatim: paceMock }));
```
Append:
```ts
// ADR 0069 / spec 2026-10-06-typeahead-photon §C.
describe("firmUpTrip: geocodes respect Nominatim", () => {
  const located = (id: string, sortOrder: number) => ({ ...roughRow(id, sortOrder, 2), lat: 41.9, lng: 12.5 });
  const unlocated = (id: string, sortOrder: number) => ({ ...roughRow(id, sortOrder, 2), lat: null, lng: null });

  it("makes zero geocode calls when every Stop is located", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([located("a", 0), located("b", 1)]);
    await firmUpTrip("trip-1");
    expect(geocodeMock).not.toHaveBeenCalled();
    expect(paceMock).not.toHaveBeenCalled();
    for (const [arg] of stopUpdateMock.mock.calls) expect(arg.data).not.toHaveProperty("lat");
  });

  it("makes two paced geocode calls for two unlocated Stops", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([unlocated("a", 0), unlocated("b", 1)]);
    await firmUpTrip("trip-1");
    expect(geocodeMock).toHaveBeenCalledTimes(2);
    expect(paceMock).toHaveBeenCalledTimes(2);
  });
});
```

(d) `server/actions/trips.test.ts`: add `paceNominatimMock` to the hoisted destructure (line ~45) and the returned object (`paceNominatimMock: vi.fn(),` next to `geocodePlaceDetailedMock: vi.fn(),` at line 133). Change lines 151–153 to:
```ts
vi.mock("@/lib/geocode", () => ({
  geocodePlaceDetailed: geocodePlaceDetailedMock,
  paceNominatim: paceNominatimMock,
}));
```
Insert after the `it("a stop whose geocode fails is still created with null coords", …)` block (ends line 505):
```ts
  it("paces each rough-Stop geocode and skips located Stops (ADR 0069)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-pace" });
    geocodePlaceDetailedMock.mockResolvedValue(null);
    await createTrip({
      name: "Kansai", homeCurrency: "AUD", startDate: "2026-04-01", endDate: "2026-04-07",
      stops: [{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }, { name: "Nara" }, { name: "Osaka" }],
    });
    expect(geocodePlaceDetailedMock).toHaveBeenCalledTimes(2);
    expect(paceNominatimMock).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run lib/geocode.test.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/trips.test.ts -t "paceNominatim|respect Nominatim|paces each"`
Expected: FAIL. `paceNominatim is not a function` in geocode.test; in the action tests the geocode is still called for located Stops and `paceNominatimMock`/`paceMock` has 0 calls.

- [ ] **Step 3: Implement**

(a) `lib/geocode.ts`, after `_resetGeocodeCacheForTests` (line 142):
```ts
// Nominatim asks for at most one request per second. A batch (firm-up, New
// trip) calls paceNominatim() before each geocode it actually runs, so
// consecutive calls are ≥1 s apart (ADR 0069). Process-local: a reservation
// is taken synchronously, so concurrent callers in one instance queue up
// rather than racing. The first call — and any call over a second after the
// previous one — does not wait.
const NOMINATIM_MIN_GAP_MS = 1_000;
let nextNominatimSlot = 0;

export async function paceNominatim(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextNominatimSlot - now);
  nextNominatimSlot = Math.max(now, nextNominatimSlot) + NOMINATIM_MIN_GAP_MS;
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}

/** Test-only seam: forget the last paced call. */
export function _resetNominatimPaceForTests(): void {
  nextNominatimSlot = 0;
}
```

(b) `server/actions/stops.ts` line 9: `import { geocodePlaceDetailed, paceNominatim } from "@/lib/geocode";`

In `firmUpSegment`'s select (lines 881–892), add after `country: true,`:
```ts
        lat: true,
        lng: true,
```
Replace lines 923–925 (`for (const r of results) {` / `const s = segById[r.id];` / `const coords = await geocodePlaceDetailed(…)`) with:
```ts
  for (const r of results) {
    const s = segById[r.id];
    // ADR 0069: a Stop that already has coordinates keeps them (only its
    // dates/timezone are written); a geocode that does run is spaced ≥1 s.
    const located = s.lat != null && s.lng != null;
    if (!located) await paceNominatim();
    const coords = located ? null : await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
```

In `firmUpTrip`'s select (lines 1022–1025) change the second line to:
```ts
        arriveDate: true, departDate: true, timezone: true, name: true, country: true, lat: true, lng: true,
```
Replace lines 1051–1053 the same way:
```ts
  for (const r of results) {
    const s = stopById[r.id];
    // ADR 0069: skip located Stops; space the geocodes that do run ≥1 s.
    const located = s.lat != null && s.lng != null;
    if (!located) await paceNominatim();
    const coords = located ? null : await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
```

(c) `server/actions/trips.ts` line 9: `import { geocodePlaceDetailed, paceNominatim } from "@/lib/geocode";`. In `locateRoughStops`, replace lines 173–174 (the comment + `const geo = …`) with:
```ts
    // A Route copy carries the country; a bare name ("Paris") can land anywhere.
    // ADR 0069: consecutive Nominatim calls are spaced ≥1 s.
    await paceNominatim();
    const geo = await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run lib/geocode.test.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/trips.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/geocode.ts lib/geocode.test.ts server/actions/stops.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/trips.ts server/actions/trips.test.ts
git commit -m "fix(geocode): batch geocodes skip located Stops, 1s apart

Firm-up and New trip geocoded every Stop back to back, against
Nominatim's one-request-per-second rule. A Stop that already has
coordinates is no longer re-geocoded; the rest go through
paceNominatim (ADR 0069).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 52: Privacy page names Photon  (photon spec §D)

**Files:**
- Modify: `app/privacy/page.tsx:211-218`, header comment line 25
- Test: `app/privacy/page.test.tsx:35`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Write the failing test**
In `app/privacy/page.test.tsx`, replace line 35 with:
```ts
    expect(screen.getByText(/OpenStreetMap \(Nominatim\), Photon \(komoot\) and CARTO/)).toBeInTheDocument();
```
Add a new test at the end of the `describe`:
```ts
  // ADR 0069: the as-you-type place search goes to Photon.
  it("says which geocoder sees what is typed", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByText(/Photon for\s*as-you-type search, Nominatim when a place is saved/),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run app/privacy/page.test.tsx -t "third parties|geocoder"`
Expected: FAIL. Unable to find an element with the text /OpenStreetMap \(Nominatim\), Photon …/.

- [ ] **Step 3: Implement**
Replace the `<li>` at lines 211–218 with:
```tsx
          <li>
            <span className="font-bold">
              OpenStreetMap (Nominatim), Photon (komoot) and CARTO
            </span>{" "}
            — turn place names you type into map coordinates (Photon for
            as-you-type search, Nominatim when a place is saved), and draw
            the map tiles you see on the Summary, the Globe and the Day
            map.
          </li>
```
In the header comment, line 25: `lib/push.ts, lib/geocode.ts (Nominatim and Photon, ADR 0069), lib/map-tiles.ts, lib/storage.ts,`

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run app/privacy/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add app/privacy/page.tsx app/privacy/page.test.tsx
git commit -m "docs(privacy): name Photon as a geocoding processor

ADR 0059: a new processor is a promise to Travellers. Place names typed
into the combobox now go to Photon (ADR 0069).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 53: ADR 0028 amended note, HANDOFF and .env.example  (photon spec §E; perf spec §Y "ADR 0028 marked amended by 0069")

**Files:**
- Modify: `docs/adr/0028-nominatim-response-cache-not-rate-limiting.md:1-2`
- Modify: `docs/HANDOFF.md:16`, `:203`, `:226-228`, `:372`
- Modify: `.env.example:117-123`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Write the failing check**
Run: `grep -c "Amended by ADR 0069" docs/adr/0028-*.md; grep -c "Photon" docs/HANDOFF.md .env.example`
Expected (before): every count `0`.

- [ ] **Step 2: Confirm it fails**
Same command; all zeros.

- [ ] **Step 3: Implement**

(a) ADR 0028: insert after line 1 (the H1), following the repo's blockquote convention (`docs/adr/0006-…md:3`):
```markdown

> **Amended by ADR 0069 (2026-10-06).** This ADR's premise — geocodes happen
> at human pace — no longer holds: the place combobox became a typeahead, and
> firm-up geocoded every Stop back to back. The as-you-type search now goes
> to Photon; Nominatim keeps one-off lookups behind the cache below; batch
> geocodes skip Stops that already have coordinates and are spaced ≥1 s
> apart (`paceNominatim` in `lib/geocode.ts`). The caching decision stands.
```

(b) `docs/HANDOFF.md` line 16, replace the row with:
```markdown
| Maps / geocoding | Leaflet + CARTO tiles + Nominatim + Photon — works with no key, but tiles carry a CARTO watermark without `NEXT_PUBLIC_CARTO_API_KEY`; saving a place and the Globe/Transport search buttons need `NOMINATIM_CONTACT` (see §5); the as-you-type place search uses Photon, which needs no key and no contact |
```
Line 203, replace `— and [Nominatim](https://nominatim.org/) for geocoding.` with:
```markdown
— [Nominatim](https://nominatim.org/) for geocoding a saved place and for the Globe marker and Transport location search buttons, and [Photon](https://photon.komoot.io/) for the as-you-type place search (ADR 0069).
```
Line 228, replace the paragraph with:
```markdown
Geocoding requires no API key, but Nominatim's usage policy requires a real contact (email or app URL) in the User-Agent and returns **HTTP 403** for a missing or placeholder one. Set `NOMINATIM_CONTACT` in every environment where geocoding must work — without it, saving a place gets no coordinates and the Globe marker and Transport location searches show "Place search is temporarily unavailable". The as-you-type place combobox goes to **Photon** instead (ADR 0069), which needs neither a key nor a contact.
```
Line 372, change the purpose cell to `Real contact for Nominatim's User-Agent (Photon, the typeahead, needs none)`.

(c) `.env.example`: after line 122 (`# don't need any location lookups — search will not work until it is set.`) insert:
```
# The as-you-type place search (the place combobox) uses Photon
# (photon.komoot.io) instead, which needs no key and no contact (ADR 0069).
```

- [ ] **Step 4: Verify**
Run: `grep -c "Amended by ADR 0069" docs/adr/0028-*.md; grep -c "Photon" docs/HANDOFF.md .env.example`
Expected: `1`; HANDOFF `≥3`; .env.example `1`.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add docs/adr/0028-nominatim-response-cache-not-rate-limiting.md docs/HANDOFF.md .env.example
git commit -m "docs(geocode): record Photon beside Nominatim

ADR 0028's human-pace premise was overtaken by the typeahead; mark it
amended by 0069 and tell operators Photon needs no key or contact.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 54: Vercel Speed Insights, with the share-token redaction  (perf spec §X)

**Files:**
- Modify: `package.json` (dependency via npm)
- Modify: `components/analytics.tsx`
- Modify: `app/layout.tsx:8`, `:59-60`
- Modify: `app/privacy/page.tsx:25-28` (comment), `:265-268`, `:289-310`
- Test: `components/analytics.test.tsx`, `app/privacy/page.test.tsx`

**Interfaces:**
- Consumes: `redactShareToken(url: string): string` (exists)
- Produces: `analyticsBeforeSend<E extends { url: string }>(event: E): E` (now generic) and `export function VercelSpeedInsights(): JSX.Element`

- [ ] **Step 1: Install and check the prop type**
Run: `npm install @vercel/speed-insights` (latest at install time; a runtime dependency, beside `@vercel/analytics`).
Then: `grep -n "beforeSend\|url" node_modules/@vercel/speed-insights/dist/next/index.d.ts`. Confirm that the `beforeSend` event carries `url: string`. If it doesn't, stop and report back; don't improvise a different redaction.

- [ ] **Step 2: Write the failing tests**
At the top of `components/analytics.test.tsx` (after the vitest import) add:
```ts
import { render } from "@testing-library/react";
import { vi } from "vitest";

const { speedInsightsProps } = vi.hoisted(() => ({ speedInsightsProps: [] as Array<{ beforeSend?: unknown }> }));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: (props: { beforeSend?: unknown }) => {
    speedInsightsProps.push(props);
    return null;
  },
}));
```
Change the `./analytics` import to `import { redactShareToken, analyticsBeforeSend, VercelSpeedInsights } from "./analytics";` and append:
```ts
describe("VercelSpeedInsights", () => {
  it("sends page timings through the same share-token redaction", () => {
    render(<VercelSpeedInsights />);
    expect(speedInsightsProps.at(-1)?.beforeSend).toBe(analyticsBeforeSend);
  });

  it("redacts a Speed Insights vital's URL too", () => {
    const vital = { type: "vital" as const, url: "/share/secret-token", route: "/share/[token]" };
    expect(analyticsBeforeSend(vital)).toEqual({ ...vital, url: "/share/[token]" });
  });
});
```
In `app/privacy/page.test.tsx` add:
```ts
  it("names Speed Insights as page-timing only", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/Vercel Speed Insights/)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/page timing only, no Trip content/i);
    expect(document.body.textContent).not.toMatch(/Beyond that one page-view counter/);
  });
```

- [ ] **Step 3: Run tests to verify they fail**
Run: `npx vitest run components/analytics.test.tsx app/privacy/page.test.tsx -t "Speed Insights|VercelSpeedInsights"`
Expected: FAIL. `VercelSpeedInsights` is not exported; the privacy text isn't found.

- [ ] **Step 4: Implement**

(a) `components/analytics.tsx`. Replace the `import type { BeforeSendEvent } from "@vercel/analytics";` line with `import { SpeedInsights } from "@vercel/speed-insights/next";`. Replace `analyticsBeforeSend` with a generic version and add the component:
```tsx
/**
 * The `beforeSend` middleware handed to both Vercel clients — Web Analytics
 * page views and Speed Insights vitals each carry the resolved URL.
 */
export function analyticsBeforeSend<E extends { url: string }>(event: E): E {
  const url = redactShareToken(event.url);
  return url === event.url ? event : { ...event, url };
}

export function VercelAnalytics() {
  return <Analytics beforeSend={analyticsBeforeSend} />;
}

/**
 * Vercel Speed Insights — real-device page-load timings (Core Web Vitals) with
 * the page URL, so the same share-token redaction applies. Vercel is already
 * a named processor; /privacy names Speed Insights (ADR 0059).
 */
export function VercelSpeedInsights() {
  return <SpeedInsights beforeSend={analyticsBeforeSend} />;
}
```
Add one line to the file docblock's first paragraph: `Also mounts Vercel Speed Insights with the same redaction.`

(b) `app/layout.tsx` line 8: `import { VercelAnalytics, VercelSpeedInsights } from "@/components/analytics";`. After `<VercelAnalytics />` (line 60) add `<VercelSpeedInsights />`.

(c) `app/privacy/page.tsx`:
- Line 267: `deploy, and runs the Web Analytics and Speed Insights described below.`
- In the Analytics paragraph, after `does not use cookies and does not build a personal profile.` (line 299) insert:
```tsx
          Teepee also uses{" "}
          <span className="font-bold">Vercel Speed Insights</span> (part
          of the same hosting) to measure how quickly pages load and
          respond on real devices: the page address, the kind of device
          and the timings — page timing only, no Trip content.
```
- Change `so that token is stripped before the page view is sent to analytics —` to `so that token is stripped before the page view is sent to analytics, and before a page timing is sent to Speed Insights —`. This keeps the two pinned regexes `/stripped\s*before the page view is sent to analytics/` and `/still appears,\s*unredacted, in an Error report/` matching.
- Change `Beyond that one page-view counter, there is no other analytics.` to `Beyond those page views and page timings, there is no other analytics.`
- Header comment line 27: `components/analytics.tsx + app/layout.tsx (Vercel Web Analytics and Speed Insights — what`.

- [ ] **Step 5: Run tests to verify they pass**
Run: `npx vitest run components/analytics.test.tsx app/privacy/page.test.tsx app/layout.test.tsx`
Expected: PASS

- [ ] **Step 6: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 7: Commit**
```bash
git add package.json package-lock.json components/analytics.tsx components/analytics.test.tsx app/layout.tsx app/privacy/page.tsx app/privacy/page.test.tsx
git commit -m "feat(analytics): add Vercel Speed Insights

The slow-on-iPhone reports behind ADRs 0063/0065 were diagnosed with no
field data. Speed Insights sends page timings with the URL, so it gets
the same share-token redaction; /privacy names it (ADR 0059). It
reports only once Speed Insights is switched on in the Vercel project.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 55: TIMEZONES from `Intl.supportedValuesOf`, curated list as fallback  (perf spec §X)

Node 24's ICU returns legacy ids (`Asia/Calcutta`, `Asia/Saigon`) and no `UTC`. So the curated entries stay first, keeping their stored values and labels, and Intl aliases of them are dropped.

**Files:**
- Modify: `lib/tz.ts:13-91`
- Test: `lib/tz.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `export const CURATED_TIMEZONES: TimezoneOption[]`, `export function buildTimezones(supported: readonly string[] | null): TimezoneOption[]`, `export const TIMEZONES: TimezoneOption[]` (same name and type as today)

- [ ] **Step 1: Write the failing test**
In `lib/tz.test.ts` add `CURATED_TIMEZONES, buildTimezones,` to the import and insert after the `describe("TIMEZONES", …)` block:
```ts
describe("buildTimezones", () => {
  it("falls back to the curated list when Intl offers none", () => {
    expect(buildTimezones(null)).toEqual(CURATED_TIMEZONES);
    expect(buildTimezones([])).toEqual(CURATED_TIMEZONES);
  });

  it("keeps the curated entries first, then adds uncovered zones sorted by label", () => {
    const out = buildTimezones(["Pacific/Guam", "Europe/London", "Africa/Abidjan"]);
    expect(out.slice(0, CURATED_TIMEZONES.length)).toEqual(CURATED_TIMEZONES);
    expect(out.slice(CURATED_TIMEZONES.length)).toEqual([
      { value: "Africa/Abidjan", label: "Africa/Abidjan" },
      { value: "Pacific/Guam", label: "Pacific/Guam" },
    ]);
  });

  it("drops an Intl alias of a curated zone (Asia/Calcutta is Asia/Kolkata)", () => {
    const out = buildTimezones(["Asia/Calcutta", "Asia/Saigon"]);
    expect(out.map((t) => t.value)).not.toContain("Asia/Calcutta");
    expect(out.map((t) => t.value)).not.toContain("Asia/Saigon");
    expect(out.map((t) => t.value)).toContain("Asia/Kolkata");
  });

  it("labels an uncurated zone by its id with spaces for underscores", () => {
    expect(buildTimezones(["America/Port_of_Spain"]).at(-1)).toEqual({
      value: "America/Port_of_Spain",
      label: "America/Port of Spain",
    });
  });
});

describe("TIMEZONES on this runtime", () => {
  it("covers zones beyond the curated list, with no duplicate values", () => {
    const values = TIMEZONES.map((t) => t.value);
    expect(values).toContain("Africa/Abidjan");
    expect(new Set(values).size).toBe(values.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run lib/tz.test.ts -t "buildTimezones|on this runtime"`
Expected: FAIL. `buildTimezones` / `CURATED_TIMEZONES` are not exported, and TIMEZONES lacks `Africa/Abidjan`.

- [ ] **Step 3: Implement**
In `lib/tz.ts`, rename the array: line 13–17 becomes
```ts
/**
 * Curated common IANA timezones with friendly labels. Listed first in the
 * selector, and the whole list where `Intl.supportedValuesOf` is missing.
 */
export const CURATED_TIMEZONES: TimezoneOption[] = [
```
(entries unchanged). After its closing `];` (line 91) insert:
```ts
/** A zone's canonical id on this runtime (V8: "Asia/Kolkata" → "Asia/Calcutta"). */
function canonicalZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
}

/**
 * The selector's list: every curated entry (stored values keep their label),
 * then every zone `supported` names that the curated list doesn't already
 * cover (directly or as an alias), sorted by label. `null`/empty → curated only.
 */
export function buildTimezones(supported: readonly string[] | null): TimezoneOption[] {
  if (!supported || supported.length === 0) return CURATED_TIMEZONES;
  const covered = new Set<string>();
  for (const c of CURATED_TIMEZONES) {
    covered.add(c.value);
    covered.add(canonicalZone(c.value));
  }
  const extra = supported
    .filter((zone) => !covered.has(zone) && !covered.has(canonicalZone(zone)))
    .map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...CURATED_TIMEZONES, ...extra];
}

function supportedTimeZones(): readonly string[] | null {
  try {
    return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : null;
  } catch {
    return null;
  }
}

/** Every timezone for the selector (perf spec §X). */
export const TIMEZONES: TimezoneOption[] = buildTimezones(supportedTimeZones());
```
Update the module docblock (lines 1–6): "Provides the IANA timezone list for UI selectors (runtime `Intl` list, curated names first) and a best-effort guesser …".

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run lib/tz.test.ts components/trip/stop-form-dialog.test.tsx`
Expected: PASS. If `stop-form-dialog.test.tsx` doesn't exist, run only `lib/tz.test.ts`.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/tz.ts lib/tz.test.ts
git commit -m "feat(tz): list every runtime timezone in the selector

A Stop in a zone the 78-entry list lacked could not be set by hand.
TIMEZONES now comes from Intl.supportedValuesOf, curated entries first
so stored values keep their label; the curated list is the fallback.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 56: `typedRoutes: true` and fix every rejected href  (perf spec §X)

Read first: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/typedRoutes.md`, and `…/05-config/02-typescript.md` §"Statically Typed Links". Facts from the Next 16.3.4 generator (`node_modules/next/dist/server/lib/router-utils/typegen.js:258-298`):
- `Route` = static routes | `?…`/`#…` | `x:y` URLs | literals matching a dynamic route (a slug may not contain `/`).
- A plain `string` is rejected by `<Link href>`, `router.push/replace/prefetch`, `redirect`/`permanentRedirect` and `next/form` `action`.
- Without typed routes, `Route` is `string & {}` (`node_modules/next/dist/types.d.ts:31`), so the type changes below compile either way.
- The types land in `.next/types/link.d.ts`, which `tsconfig.json` already includes. **Run `npx next typegen` before `npx tsc --noEmit`**, or the check is silently skipped.

**Files:**
- Modify: `next.config.ts:21`
- Modify: `lib/trip-path.ts`, `components/trip/use-trip-href.ts:19-22`, `components/navigation/use-app-router.ts:37-46`, `server/actions/trips.ts:27`
- Modify: the further sites `tsc` reports (expected list in Step 6)
- Test: `next.config.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `tripPath(ref: string, sub?: string): Route` (was `string`); `useTripHref(tripId): (sub?: string) => Route`; `CreateTripResult` = `ActionResult<{ tripId: string; href: Route }>`

- [ ] **Step 1: Write the failing test**
Append inside the `describe` in `next.config.test.ts`:
```ts
  it("types every internal link and navigation (typedRoutes)", () => {
    expect(config.typedRoutes).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run next.config.test.ts -t "typedRoutes"`
Expected: FAIL (expected undefined to be true).

- [ ] **Step 3: Turn it on**
In `next.config.ts`, add as the first key of `nextConfig` (line 22):
```ts
  // Statically typed links (perf spec §X): <Link href>, router.push/replace/
  // prefetch and redirect() reject a path that is not a route.
  typedRoutes: true,
```

- [ ] **Step 4: Fix the shared builders first**
`lib/trip-path.ts`:
```ts
import type { Route } from "next";
…
export function tripPath(ref: string, sub = ""): Route {
  if (sub !== "" && !/^[/?#]/.test(sub)) {
    throw new Error(`tripPath: sub must start with "/", "?" or "#" (got "${sub}")`);
  }
  // Runtime-built, so cast once here: every Trip URL goes through this function (ADR 0064).
  return `/trips/${encodeURIComponent(ref)}${sub}` as Route;
}
```
`components/trip/use-trip-href.ts`: add `import type { Route } from "next";` and change line 19 to `export function useTripHref(tripId: string): (sub?: string) => Route {`.
`components/navigation/use-app-router.ts`: add `import type { Route } from "next";` and change the two inner calls to `router.push(href as Route, options)` and `router.replace(href as Route, options)`. Its own `href: string` parameters stay: they accept everything Route does.
`server/actions/trips.ts:27`: `export type CreateTripResult = ActionResult<{ tripId: string; href: Route }>;` plus `import type { Route } from "next";`.

- [ ] **Step 5: Generate the route types and collect the errors**
Run: `npx next typegen && npx tsc --noEmit`
Expected: a list of errors like `Type 'string' is not assignable to type 'RouteImpl<…>'` / `UrlObject`.

- [ ] **Step 6: Fix each reported error by these rules, in this order**
1. **A prop or field that holds an href and is always built in code** (from literals, `tripPath`, `useTripHref`): type it `Route` (`import type { Route } from "next"`) where it's declared. Expected sites:
   - `components/ui/tab-bar.tsx:9`, `components/ui/dock.tsx:10`
   - `components/shell/sidebar-nav.tsx:54`
   - `components/trip/trip-nav.tsx:13,54,71,126`
   - `components/trip/home/quick-actions.tsx:12`, `components/trip/home/budget-glance.tsx:9`, `components/trip/home/desktop/{countdown-tile,spend-so-far-tile,shared-pot-tile}.tsx`
   - `components/trips/trip-card.tsx:19`
   - `components/trip/day/day-carousel.tsx:14,20`, `components/trip/day/day-arrow.tsx:18` (`Route | null`), `components/trip/day/day-keyboard-nav.tsx:16`
   - `components/legal/legal-page.tsx:29`
   - `components/command-palette-results.tsx:40` (`tripPages` return type) and the `href` of the item type read at `:192`
   - `lib/next-steps.ts:16,110`, `lib/sort-these-out.ts:32` (`Route | null`)
   - `components/trip/days-href-context.tsx:14` (`Route | null`)
2. **A value only known at runtime** (`usePathname()`, a URL read from the database, a server-action result typed `string`, `app/share/[token]/pending-link.tsx`'s `href`): cast once where it enters navigation, `as Route`. Expected:
   - `components/trip/itinerary-manager.tsx:602`
   - `components/money/breakdown-switch.tsx:32`: `router.replace((qs ? \`${pathname}?${qs}\` : pathname) as Route, { scroll: false })`
   - `components/trip/fork-switcher.tsx:278`
   - `components/trip/settings/trip-details-form.tsx:87`
   - `app/share/[token]/pending-link.tsx:14` (type the prop `Route`, cast at its call site)
3. **A wrapper component that forwards `href` to `next/link`**: type its prop `Route`, not `React.ComponentProps<typeof Link>["href"]` widened to string.
4. **Test files** that pass a non-literal string: cast in the test (`"/x" as Route`).
5. Never `as any`, `@ts-expect-error` or `@ts-ignore`. If a site fits none of the rules, stop and report it.

Re-run `npx next typegen && npx tsc --noEmit` until it's clean.

- [ ] **Step 7: Run tests to verify they pass**
Run: `npx vitest run next.config.test.ts lib/trip-path.test.ts components/trip/use-trip-href.test.tsx lib/trip-links.guard.test.ts && npm test`
Expected: PASS (type-only changes; no behaviour change).

- [ ] **Step 8: Typecheck + lint + build**
Run: `npx next typegen && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 9: Commit**
```bash
git add -A next.config.ts next.config.test.ts lib components app server
git commit -m "feat(next): turn on typedRoutes and type every href

A typo'd or stale internal link now fails the typecheck instead of
404ing. tripPath returns Route, so Trip URLs are checked in one place;
runtime paths (usePathname, server-action hrefs) are cast once where
they enter navigation. Run 'npx next typegen' before 'tsc --noEmit'
locally; 'next build' does it itself.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 57: Playwright as a real devDependency; delete the shim  (perf spec §X)

`tsconfig.json` needs no change: it has no `types`/`typeRoots` and no NODE_PATH. The shim was found through `include: ["**/*.ts"]`.

**Files:**
- Modify: `package.json`, `package-lock.json` (npm)
- Delete: `scripts/types/playwright-shim.d.ts`
- Modify: `scripts/lib/audit-browser.ts:1-109`
- Modify: `scripts/layout-audit.ts:36-44,105-111,138,674-684`, `scripts/contrast-audit.ts:26-55,294-296,303,982-992`, `scripts/nav-audit.ts:17-18,234`, `scripts/layout-audit/crops.ts:14-17,50,297-304`
- Test: `scripts/lib/audit-browser.test.ts`, `scripts/layout-audit/run.test.ts:174-321`

**Interfaces:**
- Consumes: nothing
- Produces: `resolvePlaywright(): { chromium: BrowserType }` (no parameter now); `playwrightMissingMessage` is deleted

- [ ] **Step 1: Write the failing test**
In `scripts/lib/audit-browser.test.ts`:
- Remove `playwrightMissingMessage` from the import and add `resolvePlaywright`.
- Add `import { chromium } from "playwright";`.
- Delete the whole `describe("playwrightMissingMessage", …)` block (from line 79 to its end).
- Append:
```ts
describe("resolvePlaywright", () => {
  it("hands back the installed package's chromium (Playwright is a devDependency now)", () => {
    expect(resolvePlaywright().chromium).toBe(chromium);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run scripts/lib/audit-browser.test.ts -t "resolvePlaywright"`
Expected: FAIL. `Cannot find package 'playwright'`, or a different object if a global copy resolves.

- [ ] **Step 3: Install**
Run: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --save-dev --save-exact playwright@1.63.0`
Why 1.63.0: it's the version installed globally in this environment (`/usr/local/lib/node_modules/playwright`), so browser builds already in the machine's Playwright cache match. Then: `git rm scripts/types/playwright-shim.d.ts`.

- [ ] **Step 4: Implement**

(a) `scripts/lib/audit-browser.ts`. Replace lines 1–109 (docblock, imports, the whole "Resolving Playwright at runtime" block, `isModuleNotFoundError`, `playwrightMissingMessage`, `resolvePlaywright`) with:
```ts
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
```
Leave everything from the `// Auth` section down unchanged.

(b) Callers. Replace each try/catch block with one line, and drop `BrowserType` from that file's `import type { … } from "playwright"`. In every file it's only used by the deleted `let chromium: BrowserType;`.
- `scripts/layout-audit.ts:675-684` → `const { chromium } = resolvePlaywright();`
- `scripts/contrast-audit.ts:983-992` → same.
- `scripts/layout-audit/crops.ts:298-304` → same.
- `scripts/nav-audit.ts:234` → `const { chromium } = resolvePlaywright();`

(c) Docblocks:
- `scripts/contrast-audit.ts` lines 29–36: replace with
```
 *   - `npx playwright install chromium` — once per machine. Playwright is a
 *     devDependency; its browsers are not fetched by `npm install`
 *     (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 guarantees that in CI).
```
  Replace the whole "WHY NOT A DEPENDENCY" section (lines 49–54) with:
```
 * PLAYWRIGHT
 * -----------------
 *   A devDependency since 2026-10-06 (perf spec §X). The npm package is
 *   small; the ~300MB is the browsers, installed separately as above.
```
  Line 295 `NODE_PATH=/usr/local/lib/node_modules npm run audit:contrast` → `npm run audit:contrast`.
- `scripts/layout-audit.ts:39-42`: `- Playwright + Chromium: \`npx playwright install chromium\` once (see contrast-audit.ts), then \`npm run audit:layout\`.`
  Line 110: `in turn), \`node:\` builtins, and \`playwright\` — values only in scripts/lib/audit-browser.ts — nothing else.`
- `scripts/nav-audit.ts:17-18`: `- Playwright + Chromium: \`npx playwright install chromium\` once, then \`npm run audit:nav\`.`
- `scripts/layout-audit/crops.ts:14-17`: `Playwright for the audit itself (resolvePlaywright() in scripts/lib/audit-browser.ts), so cropping and downscaling is done the same way — …`

(d) `scripts/layout-audit/run.test.ts`:
- Comment lines 179–184: replace the `playwright` bullet with `` - `playwright`, type-only — except scripts/lib/audit-browser.ts, the one file that imports its value (resolvePlaywright()). `` Drop "or scripts/types/" from the relative-path bullet, and change the last sentence to "…and so is any use of `require` as a value."
- Line 186: `const HARNESS_DIRS = ["scripts/layout-audit", "scripts/lib"].map((d) => path.join(ROOT, d));`
- Lines 245–246: replace with
```ts
    } else if (spec === "playwright") {
      if (!ref.typeOnly && path.relative(ROOT, file) !== "scripts/lib/audit-browser.ts") {
        out.push(`${ref.text}: playwright values come only through resolvePlaywright() in scripts/lib/audit-browser.ts`);
      }
```
- Files list (lines 262–271): delete the `...readdirSync("scripts/types")…` spread. The directory no longer exists, and `readdirSync` would throw.
- In the positive-control `good` list, add a sanctioned case after the loop:
```ts
    expect(check(`import { chromium, type Page } from "playwright";`, path.join(ROOT, "scripts/lib/audit-browser.ts"))).toEqual([]);
```
- Line 318: `expect(moduleRefs(src, file).requireAliases).toBe(0);` and delete the comment above it.

- [ ] **Step 5: Run tests to verify they pass**
Run: `npx vitest run scripts/`
Expected: PASS

- [ ] **Step 6: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`
The real Playwright types replace the hand-written shim. If tsc reports an audit-script call the shim typed loosely, fix the call to match the real type and list it in the commit body. Don't widen anything to `any`.

- [ ] **Step 7: Commit**
```bash
git add package.json package-lock.json scripts/
git commit -m "build(audits): make Playwright a real devDependency

The hand-maintained shim drifted with every audit and the scripts
needed NODE_PATH tricks to find a global install. The package is now
a pinned devDependency; browsers still install separately, and
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 keeps CI installs browser-free.
run.test.ts still allowlists playwright values to audit-browser.ts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 58: Real-Postgres integration tier on the docker-compose DB, seeded with a Day-loader test  (perf spec §X)

**Run after the other section's §B tasks** (the `loadDayTripData`/`projectDay` split of `lib/day-view-loader.ts`). Those keep `getDay`'s signature, and this test drives it so it covers whatever reads §B introduced.

**Drift note:** CI already runs this tier. `.github/workflows/ci.yml:29-57` has an `integration` job: postgres:16, `prisma migrate deploy`, `npm run test:integration`, `INTEGRATION=1`. This task doesn't touch CI.

**Files:**
- Create: `test/helpers/local-db.ts`, `test/helpers/local-db.test.ts`, `test/server-only-stub.ts`, `test/integration/day-view-loader.test.ts`
- Modify: `vitest.integration.config.ts`, `docker-compose.yml:1-7`

**Interfaces:**
- Consumes: `getDay(tripId: string, dateParam: string, viewerId: string): Promise<DayViewData | "invalid" | "out-of-range" | "dateless">` (`lib/day-view-loader.ts`, signature kept by §B)
- Produces: `DOCKER_COMPOSE_DATABASE_URL: string`, `integrationDatabaseUrl(env: Record<string, string | undefined>): string`

- [ ] **Step 1: Write the failing test**
`test/helpers/local-db.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DOCKER_COMPOSE_DATABASE_URL, integrationDatabaseUrl } from "./local-db";

describe("integrationDatabaseUrl", () => {
  it("defaults to the docker-compose database", () => {
    expect(integrationDatabaseUrl({})).toBe(DOCKER_COMPOSE_DATABASE_URL);
    expect(DOCKER_COMPOSE_DATABASE_URL).toBe("postgresql://trip:trip@localhost:5432/trip?schema=public");
  });

  it("keeps a local DATABASE_URL (CI's service container)", () => {
    expect(integrationDatabaseUrl({ DATABASE_URL: "postgresql://trip:trip@127.0.0.1:5432/trip" })).toBe(
      "postgresql://trip:trip@127.0.0.1:5432/trip",
    );
  });

  it("refuses any non-local host — the tests delete rows", () => {
    expect(() => integrationDatabaseUrl({ DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" })).toThrow(/local Postgres/);
  });

  it("refuses a URL it cannot parse", () => {
    expect(() => integrationDatabaseUrl({ DATABASE_URL: "not a url" })).toThrow(/not a valid URL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/helpers/local-db.test.ts`
Expected: FAIL. Cannot find module `./local-db`.

- [ ] **Step 3: Implement**
`test/helpers/local-db.ts`:
```ts
/** docker-compose.yml's database — the same URL as .env.example's DATABASE_URL. */
export const DOCKER_COMPOSE_DATABASE_URL = "postgresql://trip:trip@localhost:5432/trip?schema=public";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The database the integration tier runs against: DATABASE_URL when set,
 * else the docker-compose one. Throws for any non-local host: these tests
 * delete rows, and a shell can easily be holding a production URL
 * (scripts/load-env.ts prefers .env.production.local).
 */
export function integrationDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.DATABASE_URL?.trim() || DOCKER_COMPOSE_DATABASE_URL;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL; the integration tests need the docker-compose Postgres.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Integration tests only run against a local Postgres (docker compose up -d); DATABASE_URL points at "${host}".`,
    );
  }
  return url;
}
```
`test/server-only-stub.ts`:
```ts
// `server-only` throws outside React's server condition, and vitest does not
// use it. The integration tier imports real lib/db (perf spec §X adds
// `import "server-only"` there), so it resolves the package to this no-op.
export {};
```
Replace `vitest.integration.config.ts` with:
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'
import { integrationDatabaseUrl } from './test/helpers/local-db'

// The real-Postgres tier (perf spec §X): docker compose up -d, then
// npx prisma migrate deploy, then npm run test:integration. CI's `integration`
// job runs the same against a service container. Refuses a non-local DB.
const databaseUrl = integrationDatabaseUrl(process.env)

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/integration/**/*.test.ts'],
    // These tests share one database — no parallel files/tests.
    fileParallelism: false,
    testTimeout: 30_000,
    env: { DATABASE_URL: databaseUrl, INTEGRATION: '1' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
```
`docker-compose.yml`: replace lines 4–6 of the header comment with:
```yaml
#   docker compose up -d          # start
#   npx prisma migrate deploy     # apply the committed migrations
#   npm run db:seed               # seed sample data
#   npm run test:integration      # the real-Postgres test tier (test/integration/)
```
`test/integration/day-view-loader.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getDay } from "@/lib/day-view-loader";

// Real Postgres (npm run test:integration). The seed test for the loaders
// spec 2026-10-06 §B/§C reshaped: their unit tests mock the db and count
// queries, so only a real database proves every select, relation filter and
// groupBy is one Postgres accepts.
const USER = "it-day-user";
const TRIP_ID = "it-day-trip";
const STOP_ID = "it-day-lisbon";

describe.skipIf(process.env.INTEGRATION !== "1")("getDay (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "day@example.test", name: "Day IT" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } }); // cascades stops, items, day titles
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Day", homeCurrency: "AUD", createdById: USER,
        startDate: "2027-05-01", endDate: "2027-05-04",
        members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.stop.create({
      data: {
        id: STOP_ID, tripId: TRIP_ID, name: "IT Lisbon", country: "Portugal", countryCode: "pt",
        timezone: "Europe/Lisbon", arriveDate: "2027-05-01", departDate: "2027-05-04", sortOrder: 0,
        lat: 38.72, lng: -9.14,
      },
    });
    await db.item.create({
      data: { tripId: TRIP_ID, stopId: STOP_ID, title: "IT Pastéis de Belém", category: "FOOD", date: "2027-05-02", sortOrder: 0 },
    });
    await db.dayTitle.create({ data: { stopId: STOP_ID, dayIndex: 1, title: "IT Belém day" } });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("projects one day from the Trip's real rows", async () => {
    const day = await getDay(TRIP_ID, "2027-05-02", USER);
    if (typeof day === "string") throw new Error(`getDay returned ${day}`);
    expect(day.stop?.name).toBe("IT Lisbon");
    expect(day.dayNumber).toBe(2);
    expect(day.totalDays).toBe(4);
    expect(day.prevDate).toBe("2027-05-01");
    expect(day.nextDate).toBe("2027-05-03");
    expect(day.dayTitle).toBe("IT Belém day");
    expect(JSON.stringify(day.ordered)).toContain("IT Pastéis de Belém");
    expect(day.strip.dates.find((d) => d.iso === "2027-05-02")?.count).toBe(1);
  });

  it("serves the Day page's three neighbouring days from one Trip", async () => {
    const days = await Promise.all(["2027-05-01", "2027-05-02", "2027-05-03"].map((d) => getDay(TRIP_ID, d, USER)));
    expect(days.map((d) => (typeof d === "string" ? d : d.dayNumber))).toEqual([1, 2, 3]);
  });

  it("answers out-of-range far outside the Trip", async () => {
    expect(await getDay(TRIP_ID, "2030-01-01", USER)).toBe("out-of-range");
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run test/helpers/local-db.test.ts`
Expected: PASS.
Then: `docker compose up -d && npx prisma migrate deploy && npm run test:integration`
Expected: PASS (three files: `locking`, `trip-slug`, `day-view-loader`). If Docker isn't available here, say so in the commit body; CI's `integration` job runs it.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add vitest.integration.config.ts docker-compose.yml test/helpers/local-db.ts test/helpers/local-db.test.ts test/server-only-stub.ts test/integration/day-view-loader.test.ts
git commit -m "test(integration): run on docker DB; seed Day-loader test

The loader rewrites (perf spec §B/§C) are unit-tested against a mocked
db, which cannot reject a bad select. The integration tier now defaults
to the docker-compose Postgres, refuses any non-local host, and gains
getDay as its first loader test.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 59: knip as a devDependency, configured  (perf spec §X)

**Run after every other code task in the plan.** This commit is config only; the removals are Task 60.

**Files:**
- Modify: `package.json` (devDependency via npm; script)
- Create: `knip.json`

**Interfaces:**
- Consumes: nothing
- Produces: `npm run knip`

- [ ] **Step 1: Install**
Run: `npm install --save-dev knip` (latest at install time).

- [ ] **Step 2: Add the script and config**
In `package.json` `scripts`, after `"lint": "eslint",` add:
```json
    "knip": "knip --include files,exports,types",
```
Create `knip.json`:
```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": [
    "proxy.ts",
    "scripts/*.ts",
    "scripts/**/*.ts",
    "prisma/seed*.ts",
    "prisma.config.ts"
  ],
  "project": ["**/*.{ts,tsx}"],
  "ignore": [
    "design_handoff/**",
    "types/**",
    "test/server-only-stub.ts"
  ]
}
```
Why each entry is there:
- `proxy.ts`: Next 16's middleware file, which knip's Next plugin may not know.
- `scripts/**`: run by `tsx`, including `scripts/verify-r2-presign.ts`, which has no npm script.
- `types/**`: ambient `.d.ts` files.
- `test/server-only-stub.ts`: referenced only by the integration config's alias string.

If knip warns that a config key is deprecated, switch to the replacement it names.

- [ ] **Step 3: Run it and triage**
Run: `npm run knip`
Sort each finding into one of two kinds:
- **False positive.** It's used in a way knip can't see: a Next.js file-convention export (`metadata`, `viewport`, `generateMetadata`, `dynamic`, `revalidate`, route-handler `GET`/`POST`…), something referenced by a string path (a config alias, `vercel.json`, a `package.json` script), or a `"use server"` export listed in `lib/server-action-exports.test.ts`. Confirm with `grep -rn "<name>" --include=*.{ts,tsx,json,mjs,js} . | grep -v node_modules`, then silence it narrowly in `knip.json`: add the file to `entry` if it's a real entry point, or `ignore` for a non-code file. Don't ignore whole folders of app code.
- **True positive.** Leave it in place for Task 60.

Re-run until only true positives remain.

- [ ] **Step 4: Verify**
Run: `npm run knip`
Expected: only true positives listed. Write down the count for the commit body.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json knip.json
git commit -m "build(knip): add knip with false positives configured

One run of knip over files, exports and types (perf spec §X). This
commit only configures it; the dead code it found (N findings) is
removed in the next commit so that diff reviews on its own.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(Replace N with the count from Step 4.)

---

### Task 60: Remove the dead code knip found  (perf spec §X — "removed in a separate commit")

**Files:**
- Modify/Delete: exactly the files `npm run knip` lists after Task 59

**Interfaces:**
- Consumes: `npm run knip` (Task 59)
- Produces: nothing

- [ ] **Step 1: Baseline**
Run: `npm run knip`
Expected: the true positives Task 59 recorded.

- [ ] **Step 2: Remove, one finding at a time**
- **Unused export, used inside its own file:** delete only the `export` keyword.
- **Unused export, used nowhere:** delete the declaration, then anything that becomes unused because of it (imports, helpers).
- **Unused exported type:** same two rules.
- **Unused file:** confirm with `grep -rn "<basename without extension>" . --include=*.{ts,tsx,json,mjs,md} | grep -v node_modules` that nothing refers to it (a doc mention is fine). Then `git rm` it, along with its own `*.test.ts(x)` if that tests only the deleted file.
- Never delete an export used only by tests: knip counts tests as usage, so it won't list those.

- [ ] **Step 3: Run until clean**
Run: `npm run knip`
Expected: no issues.

- [ ] **Step 4: Run tests**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Typecheck + lint + build**
Run: `npx next typegen && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "refactor: remove dead exports and files found by knip

No behaviour change. Exports used only in their own file lose the
export keyword; unused declarations and files are deleted. Separate
from the knip setup so the removal reviews on its own.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 61: docs/open-follow-ups.md — new entries and migration state  (perf spec §Y)

**Files:**
- Modify: `docs/open-follow-ups.md` (new subsection after the blockquote that ends line 604; new dated section appended at the end of the file, after line 2672)

**Interfaces:**
- Consumes: the migration folder written by the other section's §V task
- Produces: nothing

- [ ] **Step 1: Find the migration folder**
Run: `ls prisma/migrations | grep add_plan_order_indexes`
Expected: one folder name, `<timestamp>_add_plan_order_indexes`. Use it verbatim below. If it's missing, the §V task hasn't landed: stop and report.

- [ ] **Step 2: Add the migration state**
Insert after line 604 (the end of the `> **Mostly history …` blockquote), before `## Two migrations written on 2026-09-21`:
```markdown
## One migration written on 2026-10-06 — `<timestamp>_add_plan_order_indexes` — NOT applied

Written on branch `chore/codebase-audit-2026-10-06` (spec
`docs/specs/2026-10-06-perf-ux-batch.md` §V). Purely additive: `@@index([tripId,
forkId, sortOrder])` on `Stop`, `Transport` and `Item`, `@@index([tripId,
date])` on `Reminder`, `@@index([resolvedAt])` on `AccessRequest`. No column
changes, so it opens **no** `docs/DEPLOY.md` §4b window; `CREATE INDEX`
blocks writes to each table only while that index builds (seconds at this
size). **The operator applies it to production before the deploy that
ships the batch** (`npx prisma migrate deploy` against `DIRECT_URL`); the
production build's own `migrate deploy` (`vercel.json`) would otherwise run
it mid-deploy. Nothing here claims it has run.
```

- [ ] **Step 3: Append the dated section at the end of the file**
```markdown

## 2026-10-06 · Performance and UX batch (specs 2026-10-06-perf-ux-batch, 2026-10-06-typeahead-photon)

- **PX-01 · Backfill small cover copies.** §H stores a ~480w WebP at
  `<key>-sm` beside each cover uploaded from now on; covers uploaded before
  have none, and `app/api/trips/[tripId]/cover/route.ts` serves them the
  large copy for every `?w=` (correct, just heavier on the trips page and the
  blurred backdrop). A one-off `scripts/backfill-cover-small.ts`, shaped like
  `scripts/backfill-cover-aspect.ts`, would read each `Trip.coverImageKey`
  with no `-sm` sibling, run it through the same compression as upload and
  save `<key>-sm`. Needs production storage credentials; the operator runs
  it once.
- **PX-02 · The integration tier in CI.** CI already runs it: the
  `integration` job in `.github/workflows/ci.yml` starts postgres:16, runs
  `npx prisma migrate deploy`, then `npm run test:integration`. Still owed:
  (a) confirm it is a **required** check on `main` (a GitHub branch-protection
  setting, not visible from the repo); (b) grow the tier past its seed
  (`test/integration/day-view-loader.test.ts`) to the other loaders §C
  reshaped — `lib/travelling-home-loader.ts`, `lib/desktop-home-loader.ts`,
  `lib/next-steps-loader.ts`, `lib/trips/trips-page-loader.ts` and the Plan
  page's batch — since their unit tests mock the db and cannot catch a
  select Postgres rejects.
- **PX-03 · Switch Speed Insights on in Vercel.** `<VercelSpeedInsights />` is
  mounted (`app/layout.tsx`) and `/privacy` names it, but Vercel only collects
  once Speed Insights is enabled on the project in the Vercel dashboard.
  Operator step; nothing to build.
```

- [ ] **Step 4: Verify**
Run: `grep -n "add_plan_order_indexes\|PX-01\|PX-02\|PX-03" docs/open-follow-ups.md`
Expected: the subsection heading and the three entries.

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add docs/open-follow-ups.md
git commit -m "docs(follow-ups): record the 2026-10-06 batch's owed work

The new index migration is written, not applied; the cover backfill,
integration-tier growth and Speed Insights switch-on are owed. CI
already runs the integration job, so that entry names what is left.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 62: Release notes for the batch, worded to Travellers  (perf spec §Y)

**Files:**
- Modify: `lib/release-notes.ts:28` (insert at the top of `RELEASE_NOTES`)
- Test: `lib/release-notes.test.ts` (existing invariants: newest first, valid timestamp, one line ≤140 chars, no future date)

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Write the failing test**
Append inside `describe("RELEASE_NOTES", …)`:
```ts
  it("carries the 2026-10-06 performance and UX batch", () => {
    expect(RELEASE_NOTES.some((n) => n.text.startsWith("Travelling: a new cost starts in the local currency"))).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run lib/release-notes.test.ts -t "2026-10-06"`
Expected: FAIL (expected false to be true).

- [ ] **Step 3: Implement**
Get the release minute: `date -u +%Y-%m-%dT%H:%M:00Z`. Call it T. Notes get T, T−1 min, T−2 min, … in the order below, newest first. They must be no earlier than now (a dismissal between an earlier stamp and the deploy would swallow them) and never in the future (the test checks this). Drop any line whose spec part is not in `git log` on this branch; the part is in the trailing comment.
```ts
  {
    publishedAt: "<T>",
    text: "Travelling: a new cost starts in the local currency, set to On the trip and already paid — change any of it before saving.", // §K
  },
  {
    publishedAt: "<T − 1 min>",
    text: "Plan: change a stop's nights with − and + right on the stop, and edit its place with the same search as adding one.", // §N, §L
  },
  {
    publishedAt: "<T − 2 min>",
    text: "Add a stop, a cost or a Wishlist idea from Home or Search and the form opens straight away; a flag takes you to its stop.", // §F
  },
  {
    publishedAt: "<T − 3 min>",
    text: "Share: send one of your trip's Share links from the trip menu or from Search.", // §O
  },
  {
    publishedAt: "<T − 4 min>",
    text: "A form you've changed asks before it closes, and a save that fails now tells you and keeps what you typed.", // §M, §E
  },
  {
    publishedAt: "<T − 5 min>",
    text: "Votes, checklist ticks and calendar moves show the moment you make them.", // §W
  },
  {
    publishedAt: "<T − 6 min>",
    text: "Saved for offline refreshes every few hours rather than every visit, skips data-saver connections, and Settings says when it last saved.", // §A
  },
  {
    publishedAt: "<T − 7 min>",
    text: "Summary: a departure shows the date in the place you leave from.", // §G
  },
  {
    publishedAt: "<T − 8 min>",
    text: "Teepee is quicker: pages load in fewer steps, maps load only when on screen, and place search keeps up as you type.", // §B–§D, §H, §P–§U, Photon
  },
```
Write real ISO strings (e.g. T = `2026-10-06T14:20:00Z` → `14:19`, `14:18`, …), not the `<…>` markers, and don't keep the trailing comments.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run lib/release-notes.test.ts`
Expected: PASS (every line is one line and ≤140 chars; the longest, the Saved for offline one, is about 135).

- [ ] **Step 5: Typecheck + lint**
Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**
```bash
git add lib/release-notes.ts lib/release-notes.test.ts
git commit -m "docs(release-notes): tell Travellers about the 2026-10-06 batch

One line per change a Traveller would notice (ADR 0056), worded in
CONTEXT.md's terms; internal work (indexes, tooling, knip) earns none.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Section self-check

**Spec items covered → tasks**
- Photon §A (Photon client and its tests) → 49
- Photon §B (`findPlaces` uses Photon; Globe/Transport and the combobox unchanged) → 50
- Photon §C (skip located Stops in both firm-up loops; `paceNominatim`; `locateRoughStops` spacing; zero-geocode and two-geocode tests) → 51
- Photon §D (privacy page names Photon, plus test) → 52
- Photon §E (ADR 0028 amended; HANDOFF Maps row; `.env.example`) → 53
- Perf §X `@vercel/speed-insights`, /privacy sentence and test → 54
- Perf §X `Intl.supportedValuesOf("timeZone")` with fallback → 55
- Perf §X `typedRoutes: true` and the rejected hrefs → 56
- Perf §X Playwright devDependency, shim deleted, `audit-browser.ts` imports the package, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` documented → 57
- Perf §X real-Postgres integration tier on the docker-compose DB, plus the Day-loader seed test → 58
- Perf §X knip run, config and false positives → 59; dead code in a separate commit → 60
- Perf §Y ADR 0028 amended-by-0069 → 53; follow-ups (cover backfill, integration-tier CI, `add_plan_order_indexes` migration state) → 61; release notes → 62

**Couldn't plan exactly, and why**
- **typedRoutes (56):** the full list of rejected hrefs only exists after `next typegen` and `tsc`, which write files. The task gives the generator's real rules, concrete fixes for the shared builders, the expected sites found by grep, and fixed rules for the rest.
- **knip (59/60):** what it finds is only known after installing and running it. The tasks give the config, triage rules and removal rules, not a list of deletions.

**Drift and cross-section flags**
- The geocode lines are `stops.ts:925` (`firmUpSegment`) and `:1053` (`firmUpTrip`); both are firm-up loops. `locateRoughStops` is at `trips.ts:165-177`. The loops also needed `lat`/`lng` added to their `findMany` selects.
- CI already runs the integration tier (`.github/workflows/ci.yml:29-57`), so the spec's "CI wiring is a follow-up" is partly done. PX-02 names what's actually left.
- **`server-only` coordination:** Task 58 adds a `server-only` alias pointing at `test/server-only-stub.ts` in `vitest.integration.config.ts`. Once the other planner puts `import "server-only"` in `lib/db.ts`, all three integration files need it. If that planner also creates a stub (for `vitest.config.ts`), merge on one file.
- Task 58 depends on the other section's §B tasks; Task 61 depends on its §V migration folder name; Task 62's lines depend on which spec parts actually landed.
- Small additions beyond the letter of the spec:
  - Speed Insights reuses the share-token redaction. Its timings carry the URL too, so not doing it would leak tokens.
  - Photon wrong-shape bodies are never cached, to meet the spec's "failures never cached".
  - The integration config refuses a non-local `DATABASE_URL`, because the tests delete rows.
  - PX-03 is an operator note: Speed Insights collects nothing until it's switched on in Vercel.
- Playwright is pinned to 1.63.0 to match this environment's global install. Pinning is a choice; the spec named no version.
- Commit trailers follow RULES.md (`Claude Fable 5.1`), not this session's commit-attribution reminder.

---

## Task list

49. Photon client `searchPlacesTypeahead` (photon §A)
50. The combobox's action uses Photon (photon §B)
51. Batch geocodes skip located Stops and are spaced 1 s (photon §C)
52. Privacy page names Photon (photon §D)
53. ADR 0028 amended note, HANDOFF and .env.example (photon §E; perf §Y ADR item)
54. Vercel Speed Insights, with the share-token redaction (perf §X)
55. TIMEZONES from `Intl.supportedValuesOf`, curated list as fallback (perf §X)
56. `typedRoutes: true` and fix every rejected href (perf §X)
57. Playwright as a real devDependency; delete the shim (perf §X)
58. Real-Postgres integration tier on the docker-compose DB, seeded with a Day-loader test (perf §X)
59. knip as a devDependency, configured (perf §X)
60. Remove the dead code knip found (perf §X)
61. docs/open-follow-ups.md — new entries and migration state (perf §Y)
62. Release notes for the batch, worded to Travellers (perf §Y)

The self-check is the last part of the section above.

