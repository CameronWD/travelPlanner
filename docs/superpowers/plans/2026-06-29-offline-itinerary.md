# Offline Itinerary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make a trip's itinerary viewable offline (read-only). Two gaps to close over the existing service worker: (1) **proactively cache** the active trip's key pages when you open it (today a page is only cached after you happen to visit it), and (2) a clear **offline UX** (an app-wide banner).

**Architecture:** The SW (`public/sw.js`, mirroring `lib/offline.ts`) already does network-first for pages — any page fetched while online is cached and served as an offline fallback, and the cache is cleared on sign-out (no cross-user leak). We add (a) a pure `tripOfflinePaths` helper listing the trip's read-while-travelling URLs; (b) an `OfflineWarmer` client component, mounted in the trip layout, that background-fetches those URLs when online so they're cached before signal drops; and (c) a `useOnlineStatus` hook + `OfflineBanner` shown app-wide. Offline editing is explicitly OUT of scope (read-only) — the banner is the offline signal; per-action "can't edit" toasts are deferred (see ADR 0016).

**Tech Stack:** Next.js 16 App Router, React 19, existing SW, Vitest + Testing Library.

---

### Task 1: `tripOfflinePaths` — the warm set

**Files:**
- Modify: `lib/offline.ts` (add the helper)
- Test: `lib/offline.test.ts` (read it for conventions)

Pure: given a tripId + (optional) date range, return the list of paths to pre-cache — the read-while-travelling essentials.

- [ ] **Step 1: Failing tests**

Add to `lib/offline.test.ts`:
1. `tripOfflinePaths("t1", "2026-07-01", "2026-07-03")` returns, in order: `/trips/t1`, `/trips/t1/plan`, `/trips/t1/summary`, `/trips/t1/today`, `/trips/t1/checklists`, then a `/trips/t1/day/<date>` for EACH date in the inclusive range (`2026-07-01`, `-07-02`, `-07-03`).
2. A date-less trip (`tripOfflinePaths("t1", null, null)`) returns the five non-day paths only (no day pages).
3. Caps the day pages at a sane maximum (e.g. 60 days) so a mis-entered multi-year range can't warm thousands of URLs — assert a 400-day range yields exactly `5 + 60` paths (or document the chosen cap).

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/offline.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Add to `lib/offline.ts` (import `addDays`, `daysBetween` from `@/lib/dates`):

```ts
/** Max day-pages to pre-warm, guarding against a mis-entered huge range. */
export const MAX_WARM_DAYS = 60;

/**
 * The set of same-origin paths worth pre-caching for offline viewing of a trip:
 * the read-while-travelling essentials + one page per dated day (capped).
 * Pure — no browser APIs.
 */
export function tripOfflinePaths(
  tripId: string,
  startDate: string | null,
  endDate: string | null,
): string[] {
  const base = `/trips/${tripId}`;
  const paths = [base, `${base}/plan`, `${base}/summary`, `${base}/today`, `${base}/checklists`];
  if (startDate && endDate && endDate >= startDate) {
    const span = Math.min(daysBetween(startDate, endDate), MAX_WARM_DAYS - 1);
    for (let i = 0; i <= span; i++) {
      paths.push(`${base}/day/${addDays(startDate, i)}`);
    }
  }
  return paths;
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/offline.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/offline.ts lib/offline.test.ts
git commit -m "feat(offline): tripOfflinePaths — the pre-warm URL set"
```

---

### Task 2: `OfflineWarmer` — background pre-cache on trip open

**Files:**
- Create: `components/offline-warmer.tsx`
- Test: `components/offline-warmer.test.tsx`
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (mount it)

A client component that, once on mount and when online with an active SW, background-fetches each warm path so the network-first SW caches it. Fire-and-forget, low priority, never throws.

- [ ] **Step 1: Failing test**

Create `components/offline-warmer.test.tsx`. Mock `global.fetch` (vi.fn resolving ok). Render `<OfflineWarmer paths={["/a","/b"]} />` with `navigator.onLine = true` and a stubbed `navigator.serviceWorker.controller` (truthy). Assert:
1. On mount it calls `fetch` once per path (with `{ cache: "no-store" }` or similar) — 2 calls.
2. When `navigator.onLine` is false, it does NOT fetch.
3. Renders nothing (`container.firstChild` null).
(Use `vi.stubGlobal`/`Object.defineProperty(navigator, "onLine", ...)` and a fake `navigator.serviceWorker` as needed; reset after.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/offline-warmer.test.tsx` → FAIL.

- [ ] **Step 3: Implement `components/offline-warmer.tsx`**

```tsx
"use client";

import { useEffect } from "react";

/**
 * Background-warms the SW cache with a trip's key pages so they're available
 * offline later. Fire-and-forget; never throws; renders nothing. The network-
 * first SW caches each successful GET as an offline fallback.
 */
export function OfflineWarmer({ paths }: { paths: string[] }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    // Only warm when a SW is actually controlling the page (prod); otherwise
    // these fetches do nothing useful.
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;

    let cancelled = false;
    const warm = async () => {
      for (const path of paths) {
        if (cancelled) return;
        try {
          await fetch(path, { cache: "no-store" });
        } catch {
          // ignore — best-effort warming
        }
      }
    };
    // Defer to idle so it never competes with the page the user is viewing.
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(() => void warm());
    else setTimeout(() => void warm(), 1500);

    return () => { cancelled = true; };
  }, [paths]);

  return null;
}
```

- [ ] **Step 4: Mount in the trip layout**

In `app/(app)/trips/[tripId]/layout.tsx`: import `tripOfflinePaths` from `@/lib/offline` and `OfflineWarmer`. After the `trip` is loaded, compute `const offlinePaths = tripOfflinePaths(tripId, trip.startDate, trip.endDate);` and render `<OfflineWarmer paths={offlinePaths} />` once inside the layout's root (e.g. just before `{children}`). (`trip.startDate`/`endDate` are already selected.)

- [ ] **Step 5: Verify** — `npx vitest run components/offline-warmer.test.tsx && npx tsc --noEmit && npx eslint components/offline-warmer.tsx "app/(app)/trips/[tripId]/layout.tsx" && npx vitest run` → all pass/clean.

- [ ] **Step 6: Commit**

```bash
git add components/offline-warmer.tsx components/offline-warmer.test.tsx "app/(app)/trips/[tripId]/layout.tsx"
git commit -m "feat(offline): auto-warm the trip's key pages on open"
```

---

### Task 3: `useOnlineStatus` + `OfflineBanner`

**Files:**
- Create: `components/ui/use-online-status.ts`
- Create: `components/offline-banner.tsx`
- Test: `components/offline-banner.test.tsx`
- Modify: `app/(app)/layout.tsx` (mount the banner app-wide)

- [ ] **Step 1: Failing test**

Create `components/offline-banner.test.tsx`. Control `navigator.onLine` and dispatch `window` `offline`/`online` events. Assert:
1. When online on mount → banner not rendered (`queryByRole("status")` / text null).
2. After an `offline` event → the banner appears with text matching `/offline/i` (and "saved trip").
3. After a subsequent `online` event → it disappears.

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/offline-banner.test.tsx` → FAIL.

- [ ] **Step 3: Implement `components/ui/use-online-status.ts`**

```ts
"use client";

import { useEffect, useState } from "react";

/** Reactive online/offline status. SSR-safe (assumes online until mounted). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
```

- [ ] **Step 4: Implement `components/offline-banner.tsx`**

```tsx
"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/components/ui/use-online-status";

/**
 * App-wide banner shown while the device is offline. Trip pages visited (or
 * pre-warmed) while online are served from the SW cache, so the user can still
 * read their itinerary — but edits need a connection.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-sm font-medium text-warning-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You&apos;re offline — showing your saved trip. Changes need a connection.
    </div>
  );
}
```

- [ ] **Step 5: Mount app-wide**

In `app/(app)/layout.tsx`: import `OfflineBanner` and render it at the very top of the returned tree (above the sticky header, inside the outer wrapper) so it spans all authenticated pages.

- [ ] **Step 6: Verify** — `npx vitest run components/offline-banner.test.tsx && npx tsc --noEmit && npx eslint components/ui/use-online-status.ts components/offline-banner.tsx "app/(app)/layout.tsx" && npx vitest run` → all pass/clean.

- [ ] **Step 7: Commit**

```bash
git add components/ui/use-online-status.ts components/offline-banner.tsx components/offline-banner.test.tsx "app/(app)/layout.tsx"
git commit -m "feat(offline): app-wide offline banner + useOnlineStatus"
```

---

### Task 4: ADR + final green

**Files:**
- Create: `docs/adr/0016-offline-read-only-auto-warm.md`

- [ ] **Step 1: ADR 0016**

Create `docs/adr/0016-offline-read-only-auto-warm.md` (match `docs/adr/0013` format). **Decision** — offline support is read-only: the existing network-first SW already serves visited pages offline; we proactively warm the active trip's key pages on open (`tripOfflinePaths` + `OfflineWarmer`) and surface offline state with an app-wide banner. **Context** — a traveller loses signal abroad and needs to *read* their itinerary; trip data is server-rendered into the page HTML, so a cached page carries its data. **Considered options** — explicit "Download for offline" button (rejected for v1: a manual step travellers forget); offline editing with a mutation queue + sync (rejected: large, conflict resolution, out of scope). **Consequences** — edits fail while offline; v1 signals this with the banner rather than per-action toasts (per-action "can't edit offline" toasts are DEFERRED — they'd require touching every mutation site; recorded here so it's an explicit choice, not an oversight). Files not pre-warmed (attachments are big/network-only). SW remains production-only (offline is testable via `next build`/deploy, not `next dev`).

- [ ] **Step 2: Full green**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all pass / 0 errors (only the 2 known pre-existing `calendar-views.test.tsx` warnings).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0016-offline-read-only-auto-warm.md docs/superpowers/plans/2026-06-29-offline-itinerary.md
git commit -m "docs(offline): ADR 0016 — read-only offline + auto-warm"
```

---

## Self-Review

**Spec coverage:** read-only offline ✓ (no edit path added) · auto-warm the trip's pages on open ✓ (T1+T2: home/plan/summary/today/each day/checklists) · files not warmed ✓ (not in the list) · offline banner ✓ (T3) · builds on existing SW (network-first already caches) ✓ · production-only SW noted ✓ (ADR). **Graceful per-action toast: explicitly DEFERRED to the banner signal — recorded in ADR 0016 (NOT silently dropped).**

**Type consistency:** `tripOfflinePaths(tripId, startDate|null, endDate|null) → string[]`, `MAX_WARM_DAYS`, `OfflineWarmer {paths: string[]}`, `useOnlineStatus(): boolean`, `OfflineBanner` (no props). Trip layout already selects `startDate`/`endDate`.

**Placeholder scan:** none — complete code in every code step.
