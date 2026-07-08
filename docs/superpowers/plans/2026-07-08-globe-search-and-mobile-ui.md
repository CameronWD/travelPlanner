# Globe: Fix Location Search + Mobile UI Audit + Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Nominatim location search (broken by a blocklisted placeholder User-Agent), surface search failures in the Globe UI, clarify the confusing two-search-box layout, eliminate mobile overlap/inconsistency across the Globe + Wishlist surfaces, and produce browser evidence the feature works end-to-end.

**Architecture:** The search failure is a shared-root config bug in `lib/geocode.ts`: with `NOMINATIM_CONTACT` unset, the User-Agent carries `contact@example.com`, which Nominatim blocklists → HTTP 403, silently swallowed to `[]`. We (1) stop sending the placeholder and warn when the contact is unset, (2) add an error-vs-empty *outcome* variant used only by the Globe place search so failures are distinguishable from "no matches", while the existing best-effort `searchPlaces()` contract is preserved for every other caller. Then a browser-driven audit catalogues and fixes remaining mobile UI issues, and a final drive produces a pass/fail verification report.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind v4, Radix UI, Leaflet 1.x + OpenStreetMap Nominatim, Vitest + Testing Library. Verification via the `verify` skill's browser driving (no new test dependency).

## Global Constraints

- All work stays on branch `fix/globe-search-and-mobile-ui`. **Never** commit/merge/rebase to `main`, **never** deploy. (User's sandbox guardrails.)
- **Do NOT write any `.env` / `.env.local` / production env file.** Document `NOMINATIM_CONTACT` in `.env.example` only; the user sets the real value in dev + Vercel themselves.
- Code must **never** silently send the blocklisted placeholder contact `contact@example.com`. When `NOMINATIM_CONTACT` is unset, warn (log) instead.
- Visible search-failure feedback is added to the **Globe place search UI only**. Stops / accommodation / transport / item forms keep today's silent best-effort geocoding (a failed geocode just omits the map pin).
- The existing Vitest suite (808 tests) must stay green. New/changed logic gets tests first (TDD).
- For verification runs, a real `NOMINATIM_CONTACT` may be **exported into the dev server's environment for that run only** — nothing written to a file, nothing committed.
- User-Agent string must continue to start with `TripPlanner/` (existing test asserts `/TripPlanner/`).

---

### Task 1: Geocode robustness — drop the blocklisted default, warn when unset, add error-vs-empty outcome

**Files:**
- Modify: `lib/geocode.ts` (User-Agent setup near lines 11-18; add `PlaceSearchOutcome` + `searchPlacesWithStatus`; refactor `searchPlaces` near lines 158-179)
- Modify: `lib/geocode.test.ts` (add `searchPlacesWithStatus` describe block + UA assertion)
- Modify: `.env.example` (sharpen the `NOMINATIM_CONTACT` comment, lines 67-69)

**Interfaces:**
- Produces:
  - `export type PlaceSearchOutcome = { status: "ok"; candidates: GeoCandidate[] } | { status: "error" }`
  - `export async function searchPlacesWithStatus(query: string, limit?: number): Promise<PlaceSearchOutcome>` — `status:"ok"` with possibly-empty `candidates` means the request succeeded (empty = no matches); `status:"error"` means transport/HTTP/parse failure.
  - `export async function searchPlaces(query: string, limit?: number): Promise<GeoCandidate[]>` — unchanged signature/contract (best-effort, `[]` on any failure); now implemented on top of `searchPlacesWithStatus`.
- Consumes: existing `GeoCandidate`, `NominatimDetailedResult`, `toCandidate`, `NOMINATIM_URL`, `TIMEOUT_MS` from the same file.

- [ ] **Step 1: Write the failing tests for `searchPlacesWithStatus` + UA**

Add to the end of `lib/geocode.test.ts`, and add `searchPlacesWithStatus` to the import on line 2:

```ts
// line 2 becomes:
import { geocodePlace, searchPlaces, searchPlacesWithStatus, reverseGeocode } from "./geocode";
```

```ts
describe("searchPlacesWithStatus", () => {
  it("returns status 'ok' with candidates on a successful response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: "Tokyo Tower, Minato, Tokyo, Japan",
          lat: "35.6586",
          lon: "139.7454",
          address: { city: "Tokyo", country: "Japan", country_code: "jp" },
        },
      ],
    });
    const res = await searchPlacesWithStatus("Tokyo Tower");
    expect(res.status).toBe("ok");
    expect(res.status === "ok" && res.candidates).toHaveLength(1);
  });

  it("returns status 'ok' with an empty array when there are no matches", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await searchPlacesWithStatus("nowhere-xyz");
    expect(res).toEqual({ status: "ok", candidates: [] });
  });

  it("returns status 'error' when the HTTP response is not ok (e.g. 403)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const res = await searchPlacesWithStatus("paris");
    expect(res).toEqual({ status: "error" });
  });

  it("returns status 'error' when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const res = await searchPlacesWithStatus("paris");
    expect(res).toEqual({ status: "error" });
  });

  it("returns status 'error' when the JSON is not an array", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: "x" }) });
    const res = await searchPlacesWithStatus("paris");
    expect(res).toEqual({ status: "error" });
  });

  it("never sends the blocklisted example.com contact in the User-Agent", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    await searchPlacesWithStatus("paris");
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["User-Agent"]).toMatch(/TripPlanner/);
    expect(options.headers["User-Agent"]).not.toContain("example.com");
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- lib/geocode.test.ts`
Expected: FAIL — `searchPlacesWithStatus is not a function` (import undefined), and the `example.com` assertion fails against the current default UA.

- [ ] **Step 3: Implement in `lib/geocode.ts`**

Replace the contact/User-Agent block (currently around lines 12-18):

```ts
// Nominatim's usage policy requires a REAL contact (email or the app's public
// URL) in the User-Agent, and it blocklists placeholder contacts such as
// "example.com" with HTTP 403. We therefore never send a placeholder: if
// NOMINATIM_CONTACT is unset we warn and omit the contact entirely. Configure
// NOMINATIM_CONTACT in every environment where geocoding must work.
const NOMINATIM_CONTACT = process.env.NOMINATIM_CONTACT?.trim() || null;

if (!NOMINATIM_CONTACT) {
  console.warn(
    "[geocode] NOMINATIM_CONTACT is not set. OpenStreetMap Nominatim requires a " +
      "real contact (email or app URL) in the User-Agent and blocks placeholder " +
      "contacts with HTTP 403. Location search and geocoding will likely fail " +
      "until NOMINATIM_CONTACT is configured.",
  );
}

const USER_AGENT = NOMINATIM_CONTACT
  ? `TripPlanner/1.0 (${NOMINATIM_CONTACT})`
  : "TripPlanner/1.0";
```

Add the outcome type near the other exported types (e.g. just above `searchPlaces`):

```ts
/**
 * Result of a place search that distinguishes a genuine empty result
 * ("no matches") from a transport/HTTP/parse failure ("search unavailable").
 * Use this in interactive search UIs; use `searchPlaces` for best-effort paths.
 */
export type PlaceSearchOutcome =
  | { status: "ok"; candidates: GeoCandidate[] }
  | { status: "error" };
```

Replace the body of `searchPlaces` with a status-aware core + a best-effort wrapper:

```ts
/**
 * Forward-search a free-text place query, returning an outcome that
 * distinguishes "no matches" (status "ok", empty candidates) from a request
 * failure (status "error"). Never throws.
 */
export async function searchPlacesWithStatus(
  query: string,
  limit = 5,
): Promise<PlaceSearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "ok", candidates: [] };

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("q", trimmed);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return { status: "error" };
    const data = await res.json();
    if (!Array.isArray(data)) return { status: "error" };
    const candidates = (data as NominatimDetailedResult[])
      .map(toCandidate)
      .filter((c): c is GeoCandidate => c !== null);
    return { status: "ok", candidates };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort forward search. Returns up to `limit` candidates, or [] on any
 * failure OR empty result. Kept for callers that don't need error-vs-empty
 * (e.g. geocodePlaceDetailed, background stop/accommodation geocoding).
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeoCandidate[]> {
  const outcome = await searchPlacesWithStatus(query, limit);
  return outcome.status === "ok" ? outcome.candidates : [];
}
```

- [ ] **Step 4: Update `.env.example`** (lines 67-69) to reflect that the contact is effectively required for search:

```bash
# Geocoding (OpenStreetMap Nominatim) — REQUIRED for location search / geocoding.
# Nominatim's usage policy requires a real contact in the User-Agent and blocks
# placeholder contacts (e.g. anything on example.com) with HTTP 403. Set this to
# a real email you control OR your app's public URL. Leave blank ONLY if you
# don't need any location lookups — search will not work until it is set.
NOMINATIM_CONTACT=""
```

- [ ] **Step 5: Run the full geocode suite to verify pass**

Run: `npm test -- lib/geocode.test.ts`
Expected: PASS — all existing `geocodePlace` / `searchPlaces` / `reverseGeocode` tests still green (they assert `[]` on failure, which the wrapper preserves), plus the new `searchPlacesWithStatus` block.

- [ ] **Step 6: Commit**

```bash
git add lib/geocode.ts lib/geocode.test.ts .env.example
git commit -m "fix(geocode): drop blocklisted default contact, warn when unset, add error-vs-empty search outcome"
```

---

### Task 2: Surface search failures in the Globe UI + clarify the two-search-box layout

**Files:**
- Modify: `server/actions/globe.ts` (`searchPlacesAction`, lines 71-74)
- Modify: `components/globe/marker-form.tsx` (import, search state, `runSearch`, render)
- Modify: `components/globe/marker-form.test.tsx` (update mock shape + add feedback tests)
- Modify: `components/globe/globe-view.tsx` (header copy, line 38-40)
- Modify: `components/globe/marker-filters.tsx` (placeholder copy, line 18)

**Interfaces:**
- Consumes: `searchPlacesWithStatus`, `PlaceSearchOutcome` from `@/lib/geocode` (Task 1).
- Produces: `searchPlacesAction(query: string): Promise<PlaceSearchOutcome>` (return type changes from `GeoCandidate[]`).

- [ ] **Step 1: Write the failing UI tests**

In `components/globe/marker-form.test.tsx`, change the `searchPlacesAction` mock default (line 10) to the new outcome shape, and add feedback tests. Update line 10 to:

```ts
  searchPlacesAction: vi.fn().mockResolvedValue({ status: "ok", candidates: [] }),
```

Add this describe block:

```ts
import { searchPlacesAction } from "@/server/actions/globe";

describe("MarkerForm — place search feedback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an 'unavailable' message when the search request errors", async () => {
    const user = userEvent.setup();
    vi.mocked(searchPlacesAction).mockResolvedValue({ status: "error" });
    render(<MarkerForm {...baseProps} />);

    await user.type(screen.getByLabelText("Place search"), "Tokyo");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
  });

  it("shows a 'no matches' message when the search succeeds with zero results", async () => {
    const user = userEvent.setup();
    vi.mocked(searchPlacesAction).mockResolvedValue({ status: "ok", candidates: [] });
    render(<MarkerForm {...baseProps} />);

    await user.type(screen.getByLabelText("Place search"), "zzzz");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/no matching places/i)).toBeInTheDocument();
  });

  it("lists candidates and selecting one fills the title", async () => {
    const user = userEvent.setup();
    vi.mocked(searchPlacesAction).mockResolvedValue({
      status: "ok",
      candidates: [
        { name: "Kyoto, Japan", lat: 35.01, lng: 135.76, city: "Kyoto", country: "Japan", countryCode: "jp" },
      ],
    });
    render(<MarkerForm {...baseProps} />);

    await user.type(screen.getByLabelText("Place search"), "Kyoto");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await user.click(await screen.findByRole("button", { name: /kyoto, japan/i }));

    // Title input (placeholder "e.g. Tokyo Tower") is now populated.
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("Kyoto");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- components/globe/marker-form.test.tsx`
Expected: FAIL — the "unavailable"/"no matching places" text isn't rendered yet, and `runSearch` still treats the action result as an array.

- [ ] **Step 3: Update the server action** in `server/actions/globe.ts` (lines 71-74):

```ts
import { searchPlacesWithStatus, reverseGeocode, type GeoCandidate, type PlaceSearchOutcome } from "@/lib/geocode";
```
(Remove the now-unused `searchPlaces` from that import if nothing else uses it in the file.)

```ts
export async function searchPlacesAction(query: string): Promise<PlaceSearchOutcome> {
  await requireGlobeAccess(); // access-gate; also lazily creates the globe
  return searchPlacesWithStatus(query);
}
```

- [ ] **Step 4: Update `components/globe/marker-form.tsx`**

Add `searched` / `searchFailed` state next to the existing `candidates` state (line 68):

```ts
  const [candidates, setCandidates] = useState<GeoCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
```

Replace `runSearch` (lines 89-95):

```ts
  const runSearch = () => {
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      const res = await searchPlacesAction(q);
      setSearched(true);
      if (res.status === "error") {
        setSearchFailed(true);
        setCandidates([]);
      } else {
        setSearchFailed(false);
        setCandidates(res.candidates);
      }
    });
  };
```

In `chooseCandidate` (lines 97-101), reset the messages after picking:

```ts
  const chooseCandidate = (c: GeoCandidate) => {
    setTitle((t) => t || c.name.split(",")[0]);
    setPlace({ lat: c.lat, lng: c.lng, city: c.city, country: c.country, countryCode: c.countryCode });
    setCandidates([]);
    setSearched(false);
    setSearchFailed(false);
  };
```

On the query input `onChange` (line 156), clear stale messages as the user edits:

```tsx
                onChange={(e) => { setQuery(e.target.value); setSearched(false); setSearchFailed(false); }}
```

Add the feedback messages directly after the candidate `<ul>` block (after line 187, before the resolved-location caption):

```tsx
            {searchFailed && (
              <p className="text-xs text-destructive">
                Place search is temporarily unavailable. Please try again in a moment.
              </p>
            )}
            {searched && !searchFailed && candidates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No matching places found. Try a more specific search.
              </p>
            )}
```

- [ ] **Step 5: Clarify the two-search-box copy**

In `components/globe/globe-view.tsx` replace the header sentence (lines 38-40):

```tsx
        <p className="text-sm text-muted-foreground">
          Everywhere you want to go. Tap the map to drop a pin, or use{" "}
          <span className="font-medium text-foreground">Add marker</span> to search for a place.
        </p>
```

In `components/globe/marker-filters.tsx` change the filter placeholder (line 18) so it reads as a filter, not a place search:

```tsx
        placeholder="Filter your markers…"
```

- [ ] **Step 6: Run the marker-form + globe tests to verify pass**

Run: `npm test -- components/globe/marker-form.test.tsx`
Expected: PASS — add/edit/delete tests still green, plus the three new feedback tests.

- [ ] **Step 7: Type-check + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors (the `searchPlacesAction` return-type change ripples only into `marker-form.tsx`, already updated); all tests green.

- [ ] **Step 8: Commit**

```bash
git add server/actions/globe.ts components/globe/marker-form.tsx components/globe/marker-form.test.tsx components/globe/globe-view.tsx components/globe/marker-filters.tsx
git commit -m "feat(globe): surface place-search failures in UI and clarify search vs filter"
```

---

### Task 3: Mobile + desktop audit and baseline verification drive

> **Nature of this task:** investigation, not TDD. Its deliverable is a written report + screenshots that (a) verify the end-to-end flow and (b) catalogue every mobile UI overlap/inconsistency. Task 4 fixes what this finds. Use the **`verify` skill** to launch and drive the app.

**Files:**
- Create: `docs/superpowers/verification-globe.md` (the report)
- Create: screenshots under `.verify/globe/` (e.g. `mobile-01-map.png`, `mobile-02-add-dialog.png`, …, and `desktop-*`)

**Prerequisites for the run (do NOT commit any of this):**
- Postgres up (`docker compose up -d`), schema pushed, demo data seeded: `npm run db:seed:demo`.
- Export for the dev server process only: `ALLOW_DEV_LOGIN=true` and a real `NOMINATIM_CONTACT` (e.g. an email you control) so live search returns results. **Do not write these to any file.**
- Start `npm run dev`; sign in via the dev-login shim.

- [ ] **Step 1:** Drive the **Globe page at mobile width (375×812)** and screenshot each state: (a) map with markers, (b) "Add marker" dialog open — check the dialog fits, scrolls, and sits above the map; the category `Select` dropdown opens above the dialog; the candidate list doesn't overflow, (c) place search with real results (type a city, Search, pick a candidate), (d) drop-a-pin by tapping the map → dialog prefilled with a reverse-geocoded name, (e) filters row + marker list wrapping, (f) invite dialog.
- [ ] **Step 2:** Drive the **trip Wishlist surfaces at mobile width**: the wishlist board, the globe **suggestions strip** (horizontal scroll/overlap), the **Add-from-Globe** dialog, and **nearby-wishlist**. Screenshot each.
- [ ] **Step 3:** Repeat the key states at **desktop width (1280×800)** to confirm no regressions.
- [ ] **Step 4:** Write `docs/superpowers/verification-globe.md` with two sections:
  1. **End-to-end results** — a table of each flow step with PASS/FAIL and the screenshot filename. Note anything not fully verifiable with a single dev-login user (e.g. cross-account invite reconciliation) explicitly.
  2. **UI findings** — a numbered list of every overlap / clipping / z-index / scroll / spacing issue, each with: location, mobile/desktop, severity (blocker/major/minor), screenshot, and a one-line proposed fix.
- [ ] **Step 5: Commit** the report + screenshots (screenshots are safe to commit; the temp env vars were never written to disk):

```bash
git add docs/superpowers/verification-globe.md .verify/globe
git commit -m "docs(globe): baseline mobile/desktop verification report + UI findings"
```

---

### Task 4: Fix the catalogued mobile UI findings

> **Scope is defined by Task 3's "UI findings" list** — implement a fix for each blocker/major finding (minors at discretion). The fixes below are the *likely* set given the code (Tailwind + Radix Dialog/Select + Leaflet); confirm against the actual report and only apply what the audit found.

**Files (expected — confirm against findings):**
- Likely modify: `components/ui/dialog.tsx` (mobile max-height + internal scroll so tall dialogs like MarkerForm don't overflow the viewport)
- Likely modify: `components/globe/globe-map.tsx` (map height responsive on small screens, e.g. shorter than 440px on mobile)
- Likely modify: `components/globe/marker-form.tsx` (candidate list `max-height` + `overflow-y-auto`; ensure the Radix `Select` content renders above the dialog)
- Likely modify: `components/trip/globe-suggestions-strip.tsx` (horizontal scroll containment so the strip doesn't overlap neighbours)
- Likely modify: `app/globals.css` (only if a finding needs a shared stacking/z-index rule beyond the existing `.leaflet-container { isolation: isolate }`)

- [ ] **Step 1:** For each finding in the report, make the minimal fix in the owning component. Prefer Tailwind utilities and existing tokens; match surrounding style. Do NOT introduce new dependencies.
- [ ] **Step 2:** Where a fix touches component logic with existing tests (e.g. `dialog`, `marker-form`), add/adjust a Testing-Library assertion for the corrected behaviour where it's meaningfully testable (e.g. candidate list has a scroll container class). Skip assertions for purely visual CSS that a unit test can't observe — those are validated by the re-drive in Task 5.
- [ ] **Step 3:** Run `npx tsc --noEmit && npm test`. Expected: green.
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(globe): resolve mobile UI overlap/clipping issues from audit"
```

---

### Task 5: Final verification drive + report update

**Files:**
- Modify: `docs/superpowers/verification-globe.md` (flip findings to RESOLVED, add "after" evidence)
- Create: `.verify/globe/after-*.png` (post-fix screenshots)

- [ ] **Step 1:** Re-run the app with the same prerequisites as Task 3 (temp `ALLOW_DEV_LOGIN`/`NOMINATIM_CONTACT`, not committed). Re-drive the full mobile + desktop flow.
- [ ] **Step 2:** Confirm every Task 3 finding is resolved; re-screenshot each previously-failing state as `after-*.png`. Confirm live place search returns results and shows the correct empty/error states when forced.
- [ ] **Step 3:** Update `docs/superpowers/verification-globe.md`: mark each finding RESOLVED with its `after-*` screenshot, and flip the end-to-end table to all-PASS (noting any items genuinely out of reach for a single dev user).
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/verification-globe.md .verify/globe
git commit -m "docs(globe): final verification — search fixed, mobile UI issues resolved"
```

---

## Self-Review

**Spec coverage:**
- Workstream A (search fix): root fix + warn + no placeholder → Task 1; UI error surfacing (globe only) + two-boxes UX → Task 2; `.env.example` docs (don't set env) → Task 1 Step 4. ✓
- Workstream B (mobile audit + fixes): Task 3 (catalogue) + Task 4 (fix). ✓
- Workstream C (verification drive + report): Task 3 (baseline) + Task 5 (final report). ✓
- Blast radius: shared `geocode.ts` fix benefits all callers; UI feedback scoped to globe (constraint honoured — `searchPlaces` contract unchanged for stops/accommodation/transport/items). ✓
- Constraints: branch-only/no-deploy, no `.env` writes, temp env for verification only, 808 tests green. ✓

**Placeholder scan:** Tasks 1-2 contain complete code + exact commands. Tasks 3-5 are inherently audit-driven; Task 4's file list is explicitly marked "expected — confirm against findings" rather than fabricated, which is the honest representation of an audit-then-fix flow (not a TODO).

**Type consistency:** `PlaceSearchOutcome` / `searchPlacesWithStatus` defined in Task 1 and consumed with identical names/shape in Task 2 (`searchPlacesAction` return type, `res.status`/`res.candidates` in `marker-form.tsx` and tests). `searchPlaces` signature unchanged. ✓
