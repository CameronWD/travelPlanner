# Globe Map Pins Not Rendering — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Globe map so category pins actually render on initial page load (today they only appear after the user changes a filter or adds/edits a marker).

**Architecture:** `components/globe/globe-map.tsx` creates the Leaflet map asynchronously in one effect and plots the pins in a *second* effect that reads the map ref synchronously and bails when the map isn't created yet. On a server-loaded Globe the plotting effect's dependency (the located-markers key) never changes, so after that first early-return it never re-runs — pins are never plotted. The fix introduces a `ready` state flag that flips true once the map exists and is added to the plotting effect's dependency array, so the plotting effect re-runs the moment the map is ready (and still re-runs on later filter/marker changes).

**Tech Stack:** React 19, Leaflet (dynamic `import("leaflet")`, `ssr:false` via `createMapLoader`), Next.js.

## Global Constraints

- **Scope is exactly one file:** `components/globe/globe-map.tsx`. No other file changes.
- **Preserve all existing behaviour:** async map init, category-coloured `divIcon` pins, pin click → `onSelect`, map click → `onMapClick`, fit-bounds-or-world-view, the strict-mode double-init guard, and re-plotting when the located set changes (filter/add/edit). The ONLY change is that pins now also plot on initial load.
- **No automated test for this fix (documented, deliberate).** These Leaflet map components have no unit tests in this repo *by design*: jsdom has no layout engine and Leaflet needs a real DOM, and the sandbox cannot boot a browser. `wishlist-map.tsx`, `route-map.tsx`, `day-map.tsx` are all untested for the same reason. Verification for this task is: `npx tsc --noEmit` clean, `npx eslint` clean, code review of the effect ordering, and a manual browser check by the user. Do NOT add a jsdom/Leaflet rendering test — it would be fragile and assert nothing meaningful.
- **Sandbox:** do NOT run `npm run build`/`next build` or start a dev server (no DB/browser).
- Commit trailer (last line, after a blank line): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Gate pin-plotting on a map-ready flag

**Files:**
- Modify: `components/globe/globe-map.tsx`

**Interfaces:**
- Consumes / Produces: none external. `GlobeMap`'s props (`markers`, `onSelect`, `onMapClick`) and export are unchanged. This is an internal effect-ordering fix.

**Context for the implementer — why this works:**
- Effect 1 (map init) creates the map inside `import("leaflet").then(...)`, which resolves *after* the synchronous effect pass. Effect 2 (pin plotting) runs in that same synchronous pass, sees `leafletMapRef.current === null`, and returns. Because the Globe is loaded server-side, the plotting effect's dependency string is stable, so it never re-runs and pins never appear.
- Adding a `ready` state that flips `true` at the end of the init effect — and listing `ready` in the plotting effect's dependencies — makes the plotting effect re-run once the map exists. It still re-runs on later located-set changes (filter/add/edit), so that behaviour is preserved.
- The three sibling maps (`wishlist-map.tsx`, `route-map.tsx`, `day-map.tsx`) avoid this by plotting inside the init `.then`; they are the reference for "plot only after the map exists."

- [ ] **Step 1: Add `useState` to the React import**

Change the import at the top of `components/globe/globe-map.tsx`:

```typescript
import { useEffect, useRef, useState } from "react";
```

- [ ] **Step 2: Add the `ready` state flag**

Immediately after the two callback refs and the ref-sync effect (right before the `const located = ...` line, around line 63), add:

```typescript
  // Flips true once the async Leaflet map exists, so the pin-plotting effect
  // below re-runs and actually plots on first load (it otherwise runs once,
  // before the async map is created, and — for a server-loaded Globe whose
  // marker set is stable — never runs again). See plan 2026-07-09.
  const [ready, setReady] = useState(false);
```

- [ ] **Step 3: Flip `ready` true after the map is created, and reset it on teardown**

In the map-init effect, at the END of the `import("leaflet").then((leaflet) => { ... })` callback — after the `if (located.length > 0) { map.fitBounds(...) } else { map.setView(...) }` block, still inside the `.then` — add:

```typescript
      setReady(true);
```

Then in that same effect's cleanup function, reset the flag so a genuine remount re-plots. Change the cleanup from:

```typescript
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
```

to:

```typescript
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      setReady(false);
    };
```

- [ ] **Step 4: Gate the plotting effect on `ready` and add it to the dependency array**

In the pin-plotting effect, change the guard from:

```typescript
    const map = leafletMapRef.current;
    if (!map) return;
```

to:

```typescript
    const map = leafletMapRef.current;
    if (!map || !ready) return;
```

And add `ready` to that effect's dependency array. Change:

```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.map((m) => `${m.id}:${m.lat},${m.lng}:${m.category}`).join("|")]);
```

to:

```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, located.map((m) => `${m.id}:${m.lat},${m.lng}:${m.category}`).join("|")]);
```

- [ ] **Step 5: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx eslint components/globe/globe-map.tsx`
Expected: 0 errors. (In particular, no `react-hooks` errors — this repo's eslint is strict about hooks; the existing `eslint-disable-next-line react-hooks/exhaustive-deps` above the dep array stays.)

- [ ] **Step 6: Sanity-check the existing globe test still passes**

There is no test for `globe-map.tsx` itself, but confirm nothing else broke:

Run: `npx vitest run components/globe`
Expected: PASS (the existing `marker-form`, `marker-list`, `globe-invite-button` tests — `globe-map.tsx` has none).

- [ ] **Step 7: Commit**

```bash
git add components/globe/globe-map.tsx
git commit -m "fix(globe): plot map pins on initial load (map-ready race)"
```
(Include the co-author trailer from Global Constraints as the last line.)

---

## Manual verification (user, after Task 1 — cannot be automated here)

With the app running: open `/globe` on a Globe that has at least one located Marker, on a **fresh load** (do not add/filter first). Expected: the category pins appear on the map immediately, matching the places listed below. Then change a filter and add a marker to confirm pins still update.

## Self-review notes

- **Root-cause coverage:** the fix targets exactly the confirmed cause (plotting effect never re-runs after async map creation) via the `ready` flag + dependency; no symptom-patching. ✓
- **Behaviour preserved:** async init, divIcons, click handlers, fit-bounds, strict-mode guard, and filter/add/edit re-plotting all unchanged; only initial-load plotting is added. ✓
- **No placeholders:** every step shows the exact before/after code and exact commands. ✓
- **Test honesty:** no automated test, with the repo-consistent rationale documented in Global Constraints (map components untested by design; no browser/layout engine available). ✓
