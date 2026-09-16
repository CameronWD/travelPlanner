# Cover Cache-Bust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A replaced trip-cover photo appears immediately — no app restart. The cover `<img>` URL gains a version query param derived from the storage key, which changes on every upload, so the browser's 5-minute HTTP cache of the old bytes can never be shown for a new cover.

**Architecture:** `Trip.coverImageKey` already embeds a fresh uuid per upload, making it a perfect version token. `TripCover` gains an optional `coverVersion?: string | null` prop appended as `?v=<encoded>` to the img src; both render sites (trip home hero, trips-list card via `TripCard`) pass the key through. The serve route ignores query params — zero server changes, and the 200's `private, max-age=300` header stays (a versioned URL makes that cache harmless).

**Tech Stack:** React 19 server/client components, Vitest + Testing Library.

## Global Constraints

- Branch: `fix/cover-refresh` (already checked out). NEVER commit to `main`, never merge, never deploy.
- TDD: the new behavior lands with a test that fails before and passes after; RED/GREEN evidence in the report.
- No server-side changes: `app/api/trips/[tripId]/cover/route.ts`, `server/actions/cover.ts` untouched.
- Existing behavior with no cover (route-render / monogram fallbacks) and with `coverVersion` absent must be unchanged — `hasCover` keeps its meaning; the version is additive.
- Run `npx tsc --noEmit` before each commit; conventional commits.

---

### Task 1: Version the cover URL end to end

**Files:**
- Modify: `components/trip/trip-cover.tsx` (props + hasCover img branch)
- Modify: `components/trip/trip-card.tsx` (prop threading: interface ~line 46, destructure ~line 75, TripCover usage ~line 99)
- Modify: `app/(app)/trips/[tripId]/page.tsx` (pass the trip's `coverImageKey` — already selected there)
- Modify: `app/(app)/trips/page.tsx` (~line 67: the `hasCoverByTrip` map currently stores booleans from `t.coverImageKey != null`; store the key itself — e.g. rename to `coverKeyByTrip`, `Map<string, string | null>` — and pass it to `TripCard` at ~line 142 alongside the existing `hasCover` boolean derived from it)
- Test: `components/trip/trip-cover.test.tsx` (extend; follow its existing idioms — it queries via `container.querySelector("img")`)

**Interfaces:**
- `TripCoverProps` gains `coverVersion?: string | null` — when truthy AND `hasCover`, the img `src` becomes `` `/api/trips/${tripId}/cover?v=${encodeURIComponent(coverVersion)}` ``; when absent/null, src stays exactly `` `/api/trips/${tripId}/cover` `` (backward compatible).
- `TripCardProps` gains `coverVersion?: string | null`, passed straight through to `TripCover`.

- [ ] **Step 1: Write the failing tests**

In `components/trip/trip-cover.test.tsx` add:

```tsx
  it("versions the cover URL so a replaced photo busts the browser cache", () => {
    const { container } = render(
      <TripCover
        tripId="t1"
        name="Trip"
        hasCover={true}
        coverVersion="trips/t1/abc-cover.webp"
        stops={[]}
      />,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(
      `/api/trips/t1/cover?v=${encodeURIComponent("trips/t1/abc-cover.webp")}`,
    );
  });

  it("keeps the bare cover URL when no version is provided", () => {
    const { container } = render(
      <TripCover tripId="t1" name="Trip" hasCover={true} stops={[]} />,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/trips/t1/cover");
  });
```

(Adapt render props to the file's existing fixtures if they differ — assertions are the requirement.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trip/trip-cover.test.tsx`
Expected: the versioned-URL test FAILS (src has no `?v=`); the bare-URL test passes already.

- [ ] **Step 3: Implement**

`components/trip/trip-cover.tsx` — add to `TripCoverProps`:

```tsx
  /** Cache-bust token for the cover URL — pass Trip.coverImageKey. A new
   *  upload generates a new key, so the img URL changes exactly when the
   *  image does and the browser's max-age cache of the old bytes is never
   *  shown for a new cover. */
  coverVersion?: string | null;
```

Destructure `coverVersion` and change the img src in the `hasCover` branch:

```tsx
        src={`/api/trips/${tripId}/cover${coverVersion ? `?v=${encodeURIComponent(coverVersion)}` : ""}`}
```

`components/trip/trip-card.tsx` — add `coverVersion?: string | null;` to the props interface (~line 46), destructure it (~line 75), and pass `coverVersion={coverVersion}` to `TripCover` (~line 99).

`app/(app)/trips/[tripId]/page.tsx` — the trip query already selects `coverImageKey`; pass `coverVersion={trip.coverImageKey}` to the `TripCover` at ~line 63.

`app/(app)/trips/page.tsx` — replace the boolean map (~line 67):

```tsx
  const coverKeyByTrip = new Map(trips.map((t) => [t.id, t.coverImageKey]));
```

and at the `TripCard` usage (~line 142):

```tsx
                hasCover={(coverKeyByTrip.get(trip.id) ?? null) != null}
                coverVersion={coverKeyByTrip.get(trip.id) ?? null}
```

(Verify the trips query actually selects `coverImageKey` — line 67 already reads `t.coverImageKey`, so it does.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run components/trip/trip-cover.test.tsx components/trip/trip-card.test.tsx "app/(app)/trips/page.test.tsx"`
Expected: PASS — new tests plus all pre-existing tests in the three files (the page test from an earlier round renders the empty state and is unaffected; trip-card tests must still pass with the optional prop absent).

- [ ] **Step 5: Full check + commit**

Run: `npx tsc --noEmit`

```bash
git add components/trip/trip-cover.tsx components/trip/trip-card.tsx "app/(app)/trips/[tripId]/page.tsx" "app/(app)/trips/page.tsx" components/trip/trip-cover.test.tsx
git commit -m "fix(cover): version the cover URL so a new photo shows immediately"
```

---

## Final verification

- [ ] `npx vitest run` green, `npx tsc --noEmit` clean, `npm run lint` clean, `main` untouched.
