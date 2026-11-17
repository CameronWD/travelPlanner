# Trip-proofing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Teepee safe to rely on for five weeks on phones with poor signal and no deploys: offline that really works, a Today view that leads with right now, read-only details, a Digest that reaches every zone on the route, and a tidy repo.

**Architecture:** Most offline behaviour lives in two mirrored places: pure rules in `lib/offline.ts` (unit-tested) and the hand-written worker `public/sw.js` (tested by `public/sw.test.ts`); every rule change lands in both. UI changes are phase- and layout-gated (`TripPhase` from `lib/trip-phase.ts`, the existing phone/desktop split) so planning and desktop do not move. Nothing adds a dependency.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before using any Next API), React 19, Prisma 7 + Postgres, Better Auth 1.7, Vitest + Testing Library, Playwright (via npx cache) for the offline end-to-end checks.

**Spec:** `docs/specs/2026-11-17-trip-proofing.md` — read the section named in each task before starting it.

## Global Constraints

- Branch `feat/trip-proofing`. One commit per task (more if a step says so). Commit trailer exactly: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Never run any `npm run feedback:*` script. Never read or load `.env.production.local`. Never connect to a non-localhost database. Never push. Never stage `AGENTS.md`.
- No new dependencies. No major-version bumps.
- No em-dashes in Traveller-facing strings (`test/copy-style.test.ts`). Use the glossary words in `CONTEXT.md` (Traveller, Stop, Item, Transport, Accommodation, Home, Today view, Day view, Saved for offline, Digest).
- Default to zero comments; comment only a non-obvious why. No JSDoc on new code. No defensive checks for impossible cases. No features beyond the spec.
- `"use client"` modules export components only; pure helpers go in `lib/`. `react-hooks/set-state-in-effect` forbids useEffect + setState-from-props. `useSyncExternalStore` snapshots must be primitives.
- A new server action must be added to the allowlist in `lib/server-action-exports.test.ts`.
- Any rule changed in `public/sw.js` is changed identically in `lib/offline.ts`, and the reverse. A worker behaviour change bumps nothing by hand: the worker is registered as `/sw.js?build=<id>`.
- Verification per task (CLAUDE.md tiers): inner loop `TZ=UTC npx vitest run <test files>`; task done `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never run `npm test` or `npm run build` per task (Tasks 9 and 34 are the stated exceptions).
- Planning phases and desktop layouts must render exactly as before unless a task says otherwise; each UI task keeps or adds a test proving the untouched variant is unchanged.

## Review Focus

1. **A Transport, Accommodation or Item with almost no data** (no times, no address, no reference, no files, no notes) opened in the read-only sheet or shown on the Now / next card: it must render a sensible short card, never blank rows, "null", or a crash. Tests in Tasks 16 and 20.
2. **A Trip with zero Attachments, or one Attachment over the function size limit**, saved for offline: the count must read correctly ("12 of 12", or "11 of 12") and never divide by zero or hang. Tests in Tasks 3 and 10.
3. **Offline at the instant of a tap** (airplane mode toggled while a sheet is open): every write surface on the travelling screens keeps input and shows the offline message. Tests in Task 13.
4. **A device clock that disagrees with the server** (phone still on Brisbane time in Munich, or a saved page from two days ago): the saved-copy line must point at the right Day and never loop or flash on a fresh page. Tests in Task 12.
5. **The day the phase flips and the days at the ends** (4 Dec departure from Home, 7 to 8 Jan overnight return, the day after): Now / next, Where you are and Trip today must each have an answer. Tests in Tasks 15, 17 and 28.

---

## Section H0: dependencies

### Task 1: Patch bumps

**Files:** Modify `package.json`, `package-lock.json`. Possibly small call-site fixes the bumps force.

- [ ] **Step 1:** Read the changelogs: `better-auth` 1.7.10 → latest 1.7.x (session, cookie, `nextCookies`, oauth-provider, mcp), `next` 16.4.2 → latest 16.4.x, `postal-mime` 4.0.7 → ≥ 4.2.1. Note anything touching session refresh; Task 5 depends on it.
- [ ] **Step 2:** Bump `postal-mime`; bump `next` (and `eslint-config-next` if pinned to match); bump `better-auth` and every `@better-auth/*` to one identical version; run `npm audit fix` (never `--force`). `npm install` must leave no peer warnings for these.
- [ ] **Step 3:** Verify: `npx tsc --noEmit`; `TZ=UTC npx vitest run lib/auth lib/booking-import app/api/mcp proxy.test.ts proxy.route.test.ts`; `npm audit --omit=dev` shows no high advisory for `postal-mime`. If a bump breaks behaviour that cannot be fixed in a few lines, revert that one package and record why in the commit body.
- [ ] **Step 4:** Commit `chore(deps): security patch bumps before the trip freeze`.

---

## Section A: can't-strand-you

### Task 2: The worker never stores or serves a redirected response

**Spec:** A2 (third bullet). **Files:** Modify `public/sw.js` (`cacheFirst`, `networkFirst`), `lib/offline.ts`; Test `public/sw.test.ts`, `lib/offline.test.ts`.

**Interfaces — Produces:** in both files, `function storableResponse(response)`: returns `response` when `response.redirected` is false, else `new Response(response.body, { status, statusText, headers })`. Both strategies call it before every `cache.put`. On a cache hit for a `request.mode === 'navigate'`, an entry with `redirected === true` is treated as a miss and deleted.

- [ ] **Step 1: Failing tests** in `public/sw.test.ts` (follow the file's existing harness): `stores a clean copy of a redirected response` (fetch resolves a response with `redirected: true`; the object passed to `cache.put` has `redirected === false` and the same body text and `Content-Type`); `a redirected cached entry is not returned to a navigation` (cache holds a `redirected: true` entry; navigate request → network is used, entry deleted). Mirror the pure helper test in `lib/offline.test.ts`.
- [ ] **Step 2:** Run both test files; expect the new tests to fail.
- [ ] **Step 3:** Implement in both files.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `fix(offline): never keep or serve a redirected response`.

### Task 3: Attachments and the cover save for offline as bytes

**Spec:** A2. **Files:** Modify `lib/attachment-serve.ts`, `lib/storage.ts`, `app/api/attachments/[id]/route.ts`, `app/api/trips/[tripId]/cover/route.ts`, `lib/offline.ts`, `public/sw.js`, `components/offline-warmer.tsx`; Tests beside each.

**Interfaces — Produces:**
- `Storage.readStream(key: string): Promise<ReadableStream<Uint8Array> | null>` on both drivers (S3 driver: `GetObject` body as a web stream; local: file stream).
- `ServeAttachmentOptions.bytes?: boolean` — when true, `serveAttachment` never presigns: 200, streamed body, same `Content-Type`, `Content-Disposition`, `X-Content-Type-Options`, `Cache-Control`, and `Content-Length` from the Attachment's stored `size` when known.
- `OFFLINE_BYTES_PARAM = "offline"` exported from `lib/offline.ts`; routes pass `bytes: true` when `searchParams.get("offline") === "1"`. Auth and access checks are unchanged and run first.
- `warmUrlFor(path: string): string` in `lib/offline.ts`: appends `offline=1` to Attachment and cover paths, leaves pages alone. The warmer fetches `warmUrlFor(path)` but keeps `caches.match(path)` as its already-saved check.
- Worker: for Attachment and cover routes the cache key is the URL with the `offline` param removed (`fileCacheKey(url)` in both files); a request carrying the param is fetched as-is and stored under the stripped key.

- [ ] **Step 1:** Check the current Vercel function response-size behaviour for streamed bodies (docs via web or `node_modules/next/dist/docs/`); record the finding in the commit body. If a streamed body up to 10 MiB is not servable, set `MAX_OFFLINE_BYTES_SERVE` in `lib/offline.ts` to the real limit and have `bytes: true` fall back to the redirect above it (the warmer then counts that file as not saved in Task 10).
- [ ] **Step 2: Failing tests.** `lib/attachment-serve.test.ts`: `bytes:true returns 200 with the body even when the driver can presign` (stub storage with `presignDownload` returning a URL and `readStream` returning bytes; assert status 200, body equals bytes, no `Location`, `Content-Disposition` matches the redirect path's value). `app/api/attachments/[id]/route.test.ts`: `?offline=1 serves bytes` and `?offline=1 still refuses a non-member` (existing 403/404 shape). Same pair for the cover route. `lib/offline.test.ts`: `warmUrlFor` adds the param to `/api/attachments/x` and `/api/trips/t/cover?v=k` (result `...cover?v=k&offline=1`) and not to `/trips/t`; `fileCacheKey` strips it and preserves `v`. `public/sw.test.ts`: `an offline=1 attachment fetch is cached under the plain URL` and `a later plain request is a cache hit`. `components/offline-warmer.test.tsx`: fetch is called with the `offline=1` URL; a path already answered by `caches.match(plain)` is skipped.
- [ ] **Step 3:** Run; expect failures.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Tests pass; task-done verification (include `lib/storage.ts` related tests).
- [ ] **Step 6:** Commit `feat(offline): files save for offline as bytes through the serve route`.

### Task 4: Opening the app offline lands on the Trip

**Spec:** A1. **Files:** Modify `public/sw.js` (`networkFirst` fallback, `message` handler unchanged), `lib/offline.ts`, `public/offline.html`; Test `public/sw.test.ts`, `lib/offline.test.ts`, a new `public/offline-html.test.ts`.

**Interfaces — Produces:** `pickOfflineStart(cachedUrls: string[], lastTripPath: string | null): string | null` in both files — returns `lastTripPath` if cached, else the first cached `/trips/<ref>` Home (path with exactly two segments), else `/trips` if cached, else null. The worker records the last Trip Home it served successfully in the meta cache (`META_CACHE_NAME`, key `/__teepee/last-trip`). `offline.html` gets an inline script that lists cached Trip pages as links.

- [ ] **Step 1: Failing tests.** `pickOfflineStart(["/trips/a/budget","/trips/a","/trips"], null)` → `"/trips/a"`; with `lastTripPath "/trips/b"` cached → `"/trips/b"`; `(["/"], null)` → null (a cached Landing is never chosen); `([], null)` → null. Worker: `offline navigation to / serves the cached Trip Home` (network rejects; cache holds `/trips/a`; response body is that entry's); `offline navigation to / with nothing saved serves offline.html`. `offline-html.test.ts` (read the file as text): does not contain "will sync"; contains "need a connection"; contains a container with `id="saved-trips"`.
- [ ] **Step 2:** Run; fail.
- [ ] **Step 3:** Implement. In `offline.html` the script uses `caches.open('teepee-pages-v1')`, keeps same-origin keys matching `^/trips(/[^/]+)?$`, renders each as a full-width link ("Your trips" for `/trips`, the path's last segment title-cased otherwise) and hides the list when empty. Copy: heading "You're offline", body "Saved pages can still be read. Changes need a connection."
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `fix(offline): a cold launch with no signal opens the saved Trip`.

### Task 5: Sign-in lasts 120 days and the cookie really renews

**Spec:** A3. **Files:** Modify `lib/auth/auth.ts`, `lib/auth/auth.test.ts`; add the renewal where cookies can be written — prefer the route handler path: Create `app/api/auth-keepalive/route.ts` (+ test) and call it from an existing always-mounted client component in the root layout (extend `components/account/device-sync.tsx`'s module or add `components/account/session-keepalive.tsx` mounted beside it in `app/(app)/layout.tsx`).

**Interfaces — Produces:** `SESSION_DAYS = 120` in `lib/auth/auth.ts`. `POST /api/auth-keepalive`: calls `authServer.api.getSession({ headers })` in a route handler (where Better Auth can set cookies), responds 204 when signed in (with any `Set-Cookie` Better Auth produced), 401 otherwise. `SessionKeepalive` posts to it at most once per 24 hours per browser (timestamp in `localStorage`, wrapped in try/catch), on mount and on `visibilitychange` to visible; silent on failure.

- [ ] **Step 1:** Read Better Auth's `getSession` (`node_modules/better-auth/dist/api/routes/session.mjs`) and `nextCookies` to confirm the refresh condition (`expiresAt - expiresIn + updateAge <= now`) and that a route handler writes the cookie. If the Task 1 bump changed this, follow the new code. If a document load earlier the same day already advanced the session row (so `shouldBeUpdated` is false), the keepalive must still re-issue the cookie: in that case set the session cookie explicitly from the route using Better Auth's own cookie helper so the browser's expiry matches the row's.
- [ ] **Step 2: Failing tests.** `auth.test.ts`: `expiresIn` is `120 * 24 * 60 * 60`. Route test: signed-out → 401; signed-in with a session row whose `expiresAt` is 100 days out → 204 and a `Set-Cookie` for the session token whose Max-Age (or Expires) is more than 110 days out. `session-keepalive.test.tsx`: posts once on mount; does not post again within 24 hours; posts after the stored stamp is older than 24 hours when the tab becomes visible.
- [ ] **Step 3:** Run; fail.
- [ ] **Step 4:** Implement. Exempt the route from anything in `proxy.ts` that would redirect it, and add it to `app/route-conventions.test.ts` if that test lists routes.
- [ ] **Step 5:** Tests pass; task-done verification; `TZ=UTC npx vitest run proxy.test.ts proxy.route.test.ts`.
- [ ] **Step 6:** Commit `fix(auth): sign-in lasts 120 days and renews on use`.

### Task 6: Day view no longer widens with a Journal entry

**Spec:** A4. **Files:** the day carousel component (find the scroller with `snap-x snap-mandatory overflow-x-auto` under `components/trip/day/`), its test.

- [ ] **Step 1: Failing test:** the scroller element (or each panel) has the `relative` class. Add to `scripts/layout-audit` nothing; instead add a DOM test asserting the journal editor's `sr-only` inputs have a positioned ancestor inside the panel (walk `parentElement` until the panel; one must have class `relative`).
- [ ] **Step 2:** Run; fail. **Step 3:** Add `relative` to each panel. **Step 4:** Pass; task-done verification.
- [ ] **Step 5:** Commit `fix(day): keep the Journal's hidden inputs inside the day carousel`.

### Task 7: A slow network falls back to the saved copy

**Spec:** A5. **Files:** Modify `public/sw.js` (`networkFirst`), `lib/offline.ts`; Tests `public/sw.test.ts`, `lib/offline.test.ts`; Create `docs/adr/0077-a-slow-network-is-answered-from-the-saved-copy.md`.

**Interfaces — Produces:** `NAVIGATION_TIMEOUT_MS = 4000` (both files). For `request.mode === 'navigate'` with a cached copy: race the fetch against the timer; on timeout or on `response.status >= 500` serve the cached copy with header `X-Teepee-Saved-Copy: 1` added (rebuild the Response to add it) and let the fetch continue to refresh the cache (`event.waitUntil`). No cached copy: unchanged. Non-navigations: unchanged. `SAVED_COPY_COOKIE`: none — the page learns it was a saved copy from Task 12's date check plus a `<meta>`-free signal: the worker posts `{ type: 'SAVED_COPY', url }` to the client that made the navigation (`event.resultingClientId`) once it exists.

- [ ] **Step 1: Failing tests** (fake timers): `a navigation slower than 4s is answered from the cache`; `the slow fetch still refreshes the cache when it lands`; `a 503 with a cached copy serves the cached copy`; `a 503 with no cached copy is returned as-is`; `a fast response is never delayed or replaced`; `a non-navigation GET waits for the network as before`.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement. **Step 4:** Pass; task-done verification.
- [ ] **Step 5:** Write ADR 0077 (format of the newest ADRs): context (weak signal hangs every tap; `navigator.onLine` is true on one bar), decision (4s race for navigations with a saved copy; 5xx treated as failure), options rejected (stale-while-revalidate always — an online Traveller would see stale private pages first; shorter timeout — Neon cold start is 1 to 3s), consequences (a Traveller may see a copy up to a warm old; Task 12's line says so).
- [ ] **Step 6:** Commit `feat(offline): a slow network is answered from the saved copy`.

### Task 8: Amend ADR 0043 and the glossary for Section A

**Files:** Modify `docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md` (append "Amendment — 2026-11-17: the warm asks for bytes"; update the Status line), `CONTEXT.md` (**Saved for offline**: add that it reports how much was saved, that a slow connection shows the saved copy, and that opening the app with no connection opens the saved Trip; no implementation detail).

- [ ] **Step 1:** Write the amendment: the presigned redirect broke the ADR's "same-origin bytes" premise; the 2026-10-01 note that the worker "follows the redirect and caches the final bytes" was never verified and depends on bucket CORS; decision per Task 3; redirected responses are never stored (Task 2).
- [ ] **Step 2:** `TZ=UTC npx vitest run test/copy-style.test.ts` (and any test that parses `CONTEXT.md`). Commit `docs: ADR 0043 amended, Saved for offline glossary`.

### Task 9: Offline end-to-end harness (production build, local)

**Spec:** Verification. **Files:** Create `scripts/offline-audit.ts`; Modify `package.json` (script `audit:offline`), `knip.json` if scripts need listing.

Stated exception to the per-task tiers: this task runs `npm run build`.

- [ ] **Step 1:** Model on `scripts/nav-audit.ts` (dev login, Playwright from the npx cache; see its header for `NODE_PATH`). The script expects a server at `http://localhost:3100` started by the operator with `next start`; it does not start one.
- [ ] **Step 2:** Checks, each printing PASS/FAIL and exiting non-zero on any FAIL: (a) open a demo Trip online, wait for the Settings row to say Saved for offline; (b) `context.setOffline(true)`, new page at `/` → lands on a Trip page, not `offline.html`; (c) offline, open the Files page and navigate to a seeded Attachment URL → status 200 from the service worker, body length > 0; (d) offline, navigate to `/trips/<ref>/budget` → renders the Money heading; (e) with a route delaying document requests 6s (`page.route`), a navigation renders within 5s. The script uploads one small PDF and one PNG to the demo Trip first if it has no Attachments.
- [ ] **Step 3:** Run it: `DATABASE_URL=postgresql://trip:trip@localhost:5432/trip?schema=public DIRECT_URL=<same> ALLOW_DEV_LOGIN=true npm run build`, then `next start -p 3100` in the background with the same env, then `npm run audit:offline`. All PASS. Stop the server. If the service worker refuses to register under `ALLOW_DEV_LOGIN` or localhost, read `components/pwa-register.tsx` and adapt the harness, not the app.
- [ ] **Step 4:** Commit `test(offline): end-to-end offline audit against a production build`.

---

## Section B: honest offline

### Task 10: Saved for offline counts what it saved, and a fresh install saves

**Spec:** B1. **Files:** Modify `lib/offline-status.ts`, `components/offline-warmer.tsx`, `components/trip/settings/saved-for-offline.tsx`; Tests beside each.

**Interfaces — Produces:** `OfflineStatus` gains `total: number | null` and `saved: number | null`. `finishWarm(tripId, result: { total: number; saved: number; pagesFailed: number }, at?)`: stores the counts; sets `savedAt` only when `pagesFailed === 0`. A fetch counts as saved when it resolves with `response.ok` and (for files) is not a redirect; an already-cached file counts as saved. Row copy: complete → `Saved for offline · 2h ago` (as today); incomplete → `Saved 40 of 46 · 2h ago` with "Save again"; `total === 0` never renders "0 of 0".

- [ ] **Step 1: Failing tests.** Status: counts stored; `pagesFailed: 1` leaves `savedAt` unchanged. Warmer: one page fetch rejects, one returns 500 → `finishWarm` called with `pagesFailed: 2`; a Trip with no Attachments → `total` equals the page count; mounts with no controller, then a `controllerchange` event fires → the warm runs once. Row: renders `Saved 40 of 46`.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement (the `controllerchange` listener bumps a state the effect depends on). **Step 4:** Pass; task-done verification.
- [ ] **Step 5:** Commit `fix(offline): Saved for offline says how much was saved`.

### Task 11: The saved set covers the road

**Spec:** B2. **Files:** Modify `lib/offline.ts` (`tripOfflinePaths`), `public/sw.js` if it mirrors the list, `components/offline-warmer.tsx`; Tests.

**Interfaces — Produces:** `tripOfflinePaths` adds `/trips` and `/trips/<ref>/journal`, removes `/trips/<ref>/today`. `assetUrlsIn(html: string): string[]` in `lib/offline.ts`: same-origin `/_next/static/...` URLs from `<script src>` and `<link rel="stylesheet" href>`, de-duplicated. After fetching a page the warmer reads its text and fetches each asset URL not already cached; assets count toward `total`/`saved`.

- [ ] **Step 1: Failing tests:** path list contains journal and `/trips`, not `/today`; `assetUrlsIn` on a fixture with two scripts, one stylesheet, one cross-origin script, one duplicate → three URLs; warmer fetches the assets of a warmed page once.
- [ ] **Steps 2–4:** fail, implement, pass, task-done verification.
- [ ] **Step 5:** Commit `feat(offline): Journal, Trips and page scripts join the saved set`.

### Task 12: A saved copy from another day says so

**Spec:** B3. **Files:** Create `lib/saved-copy.ts` (+ test), `components/trip/saved-copy-line.tsx` (+ test); Modify the Trip layout `app/(app)/trips/[tripId]/layout.tsx` to mount it with the server's `today` and the current Stop's timezone.

**Interfaces — Produces:** `savedCopyState(input: { renderedToday: string; zone: string; now: Date; servedAsSavedCopy: boolean }): { stale: boolean; deviceToday: string }` — `stale` when the device's date in `zone` differs from `renderedToday`, or `servedAsSavedCopy`. `SavedCopyLine` (client): uses `useSyncExternalStore` over a tiny store fed by the worker's `SAVED_COPY` message (Task 7) and `online`/`offline` events; renders nothing when not stale; else one line: `Saved Thu 10 Dec. Open today` linking to the Day view for `deviceToday` when that date is inside the Trip, else to Home.

- [ ] **Step 1: Failing tests:** rendered `2026-12-10`, now `2026-12-11T06:00Z`, zone `Europe/Berlin` → stale, `deviceToday 2026-12-11`; same day → not stale; `servedAsSavedCopy` same day → stale; component renders nothing on a fresh page (no flash: first client snapshot equals the server snapshot); link targets the right Day; `deviceToday` after the Trip's end links to Home.
- [ ] **Steps 2–4**, then **Step 5:** Commit `feat(offline): a saved page from another day says so`.

### Task 13: Offline writes keep what was typed

**Spec:** B4. **Files:** Modify `components/trip/journal-editor.tsx`, `components/trip/checklist.tsx`, `app/(app)/trips/[tripId]/budget/cost-editor.tsx`, `other-cost-editor.tsx`, plus any travelling-surface site found in Step 1; Tests beside each.

- [ ] **Step 1:** `grep -n "startTransition(async" -r components/trip app/\(app\)/trips` and list the sites reachable from Home, Day view, Money, Checklists, Journal and Files that await a server action with no catch. Fix those; leave Plan-editor and Settings sites alone unless they are the same component.
- [ ] **Step 2: Failing tests** (make the action mock reject with `TypeError("Failed to fetch")` and set `navigator.onLine = false`): journal — typed text is still in the textarea and the offline message from `components/ui/failure-message.ts` is shown, no error boundary; journal photo — same message, picker reset; checklist add and edit — input keeps its text; cost add and edit — dialog still open, fields intact, message shown.
- [ ] **Steps 3–4:** implement with try/catch + the shared `failureMessage` toast helper already used by the checklist tick; pass; task-done verification.
- [ ] **Step 5:** Commit `fix(offline): a failed save keeps what was typed and says why`.

### Task 14: Sign out offline cannot wipe the saved Trip by accident

**Spec:** B5. **Files:** Modify `components/ui/sign-out-button.tsx` (+ test).

- [ ] **Step 1: Failing tests:** online → `authClient.signOut` resolves, then `CLEAR_CACHE` is posted (order asserted), then redirect; sign-out rejects → no `CLEAR_CACHE`; offline → a confirm appears with "You're offline. Signing out removes the saved copy of your trips from this phone."; cancel → nothing posted; confirm → cache cleared and redirect to `/`.
- [ ] **Steps 2–4**, use the repo's existing confirm dialog primitive (see `components/ui/`), not `window.confirm`. **Step 5:** Commit `fix(offline): sign out asks first when offline`. This also clears the `no-location-assign-relative-destination` lint warning in this file if the fix is trivial.

---

## Section C: Today view on a phone

### Task 15: Loader — Now / next, in-progress Transport, Where you are

**Spec:** C (Now / next, Where you are). **Files:** Create `lib/now-next.ts` (+ test); Modify `lib/travelling-home-loader.ts` (+ test), the Trips-list "Now in" source (find via `grep -rn "Now in" components lib`).

**Interfaces — Produces:**
```ts
export type NowNext =
  | { kind: "in-transit"; transportId: string; mode: TransportMode; routeLabel: string; arrivesAt: string; arrivesZone: string }
  | { kind: "next-thing"; target: { type: "item" | "transport" | "accommodation"; id: string }; title: string; startsAt: string | null; zone: string; place: LatLng | null; address: string | null }
  | { kind: "next-departure"; transportId: string; mode: TransportMode; routeLabel: string; departsAt: string; departsZone: string; withinDay: boolean }
  | { kind: "nothing" };
export function nowNext(input: NowNextInput, now: Date): NowNext;
export function whereYouAre(stops, transports, now: Date): { stopId: string; name: string } | null;
```
`routeLabel` is "Paris to London" from Stop names, falling back to the departure/arrival point text, then the Home base name for a Home end. `withinDay` is true when departure is under 24 hours away. `whereYouAre` on a Changeover day returns the departing Stop until that day's Transport `depAt` has passed (or until noon in the departing Stop's zone when the leg has no time), then the arriving Stop. `DatedTravellingHome` gains `nowNext: NowNext`; its existing "where you are" field and the Trips list both come from `whereYouAre`.

- [ ] **Step 1: Failing tests** in `lib/now-next.test.ts`: during a 08:30–16:00 drive → `in-transit` with that leg's arrival; before a 10:00 timed Item today → `next-thing`; today empty, departure in 74 hours → `next-departure` with `withinDay: false`; departure in 5 hours → `withinDay: true`; no Transport left → `nothing`; a Transport with no `depAt` is skipped; a leg from Home (4 Dec 07:50 Brisbane) labels "Gold Coast to Denpasar" using the Home base name; overnight Rome → Home leg at 23:00 on the 7th → `in-transit`. `whereYouAre`: changeover morning before the 07:02 departure → Paris; after → London; timeless leg before noon → departing Stop.
- [ ] **Steps 2–4:** implement; loader test asserts `nowNext` is present and the old next-departure fields still exist for desktop. **Step 5:** Commit `feat(home): Now / next and one rule for Where you are`.

### Task 16: Now / next card with Directions and Day map

**Spec:** C (card, Directions). **Files:** Create `components/trip/home/now-next-card.tsx` (+ test); Modify `lib/map/maps.ts` (+ test).

**Interfaces — Consumes:** `NowNext` (Task 15). **Produces:** `directionsFromHereUrl(dest: { lat: number; lng: number } | { address: string }, mode: LocalTravelMode | null): { google: string; apple: string }` — Google `https://www.google.com/maps/dir/?api=1&destination=<...>&travelmode=<transit|walking|driving|bicycling>` with no origin (Maps uses current location); unset mode → `transit`. `NowNextCard({ nowNext, dayMapHref, tripId })`.

- [ ] **Step 1: Failing tests:** `directionsFromHereUrl` for coords and for an address (URL-encoded), each mode, null mode → transit. Card: `in-transit` renders "Arrives London 09:30"; `next-departure` not within a day renders "Sat 19 Dec 07:02 · Paris to London" and no hours countdown; within a day renders the countdown; `next-thing` with neither place nor address renders no Directions button but still the title; `nothing` renders a quiet "Nothing left today" line; Directions is an `<a>` with the Google URL, 44px min target (`min-h-11`), Day map is a link/button to `dayMapHref`.
- [ ] **Steps 2–4**; reuse `components/trip/transport-countdown.tsx` for the countdown. **Step 5:** Commit `feat(home): Now / next card with Directions and Day map`.

### Task 17: Travelling Home reorders on phones

**Spec:** C (order, cover, What's new, Tonight's stay, quick actions, Still to book). **Files:** Modify `components/trip/home/phase-travelling.tsx` (+ test), `components/trip/home/quick-actions.tsx` (+ test), the Home page/layout that renders the cover and What's new above the phase (find in `app/(app)/trips/[tripId]/page.tsx` and siblings), `lib/travelling-home-loader.ts` if Tonight's stay needs more fields.

**Interfaces — Consumes:** `NowNextCard`, `DatedTravellingHome.nowNext`. Reuses the planning Home's Still to book block (extract it from `phase-planning.tsx` into `components/trip/home/still-to-book.tsx` rather than copying).

- [ ] **Step 1: Failing tests** (mobile layout): section order by `data-testid` is `day-line`, `now-next`, `todays-plan`, `tonights-stay`, `quick-actions`, `still-to-book`, `upcoming-payments`; no cover image and no What's new card in the Travelling mobile render; Tonight's stay shows confirmation number with a copy button, check-in time and notes when present and omits each row when absent; quick actions are Add a cost, Journal, Files, Checklists in that order; Still to book is absent when nothing is outstanding; Home Transport rows show Stop names. Desktop render snapshot/assertions unchanged. Planning Home still shows the cover and What's new.
- [ ] **Steps 2–4**. **Step 5:** Commit `feat(home): the Today view leads with right now on a phone`.

### Task 18: Today's rows route from here, with thumb-sized targets

**Spec:** C (row arrows), D2 (row links). **Files:** Modify `components/trip/timeline.tsx` (`DirectionsLink`), `lib/day-map.ts` (`buildItemDirections`), `components/trip/attachment-links.tsx`; Tests.

**Interfaces — Produces:** `buildItemDirections(points, opts?: { fromHere: boolean; mode: LocalTravelMode | null })` — with `fromHere` uses `directionsFromHereUrl`. Home and the Day view pass `fromHere: true` only when the day is today.

- [ ] **Step 1: Failing tests:** today → URL has no origin; another day → prev-to-this as before; the directions anchor and each attachment link on a row have `min-h-11 min-w-11`.
- [ ] **Steps 2–4**. **Step 5:** Commit `feat(day): today's directions start from where you are`.

### Task 19: Today view glossary

**Files:** Modify `CONTEXT.md` (**Today view**: the order it leads with, Now / next named as the lead card, Directions from where you are; **Home**: no cover or What's new while Travelling on a phone). Glossary only, no implementation. Commit `docs: Today view glossary`.

---

## Section D: read-only details

### Task 20: Details sheet

**Spec:** D1. **Files:** Create `components/trip/details-sheet.tsx` (+ test), `lib/details-view.ts` (+ test).

**Interfaces — Produces:**
```ts
export interface DetailsView {
  title: string; subtitle: string | null;
  times: Array<{ label: string; value: string }>;
  files: AttachmentView[];
  reference: string | null;
  address: string | null; place: LatLng | null;
  notes: string | null; link: string | null;
  tryList: TryEntry[] | null; openingHours: string | null;
  cost: { label: string; paid: boolean } | null;
}
export function transportDetails(t, ctx): DetailsView;
export function accommodationDetails(a, ctx): DetailsView;
export function itemDetails(i, ctx): DetailsView;
```
`DetailsSheet({ view, open, onOpenChange, onEdit, mode })` renders, in order: title, times, files (full-width rows via the shared `AttachmentLink`), reference with copy, address with maps link + Directions (`directionsFromHereUrl`), notes, link, Try list, opening hours, cost, then an **Edit** button calling `onEdit`. Every row is omitted when its value is null/empty.

- [ ] **Step 1: Failing tests:** a Transport with everything → all rows in that order; a bare Item (title only) → title and Edit only, no empty labels, no "null"; a Surprise the viewer is being surprised with (use the existing masked shape) → no more than the masked title; copy button writes the reference to the clipboard; Edit calls `onEdit`.
- [ ] **Steps 2–4**; use the existing sheet primitive the edit dialogs use on phones. **Step 5:** Commit `feat(trip): read-only details sheet`.

### Task 21: Taps open details while Travelling or Past on a phone

**Spec:** D1. **Files:** Modify `components/trip/day-entry-link.tsx` (+ test), `components/trip/timeline.tsx`, `components/trip/day/day-plan-card.tsx`, `components/trip/day/tonight-card.tsx`, `components/trip/home/phase-travelling.tsx` (pass an editor so Home rows are tappable).

**Interfaces — Consumes:** `DetailsSheet`, the three `*Details` builders. **Produces:** `DayEntryEditor` gains `readFirst: boolean`. When true and the layout is phone, `DayEntryLink` opens `DetailsSheet`; its Edit closes the sheet and opens today's form. `readFirst` is `phase === "travelling" || phase === "past"`, decided on the server and passed down. Phone vs desktop uses the same mechanism the edit dialogs already use to choose sheet vs dialog.

- [ ] **Step 1: Failing tests:** travelling + phone → tap shows the details sheet, not the form; Edit → form opens; planning + phone → form opens directly (unchanged); travelling + desktop → form opens directly; tapping a row's attachment link or directions arrow does not open the sheet; Home rows are tappable in Travelling.
- [ ] **Steps 2–4**. **Step 5:** Commit `feat(trip): tapping a booking on the road shows it before editing it`.

### Task 22: Files cards, More order, and the confirmation line while Travelling

**Spec:** D2, D3. **Files:** Modify `components/trip/files-index.tsx`, the More sheet (find via `grep -rn "Wishlist" components/navigation`), `components/trip/timeline.tsx` / `day-plan-card.tsx` where "No booking confirmation yet" renders; Tests.

- [ ] **Step 1: Failing tests:** the whole Files card is one link to the file (delete remains a separate button, and clicking it does not navigate); while Travelling the More sheet lists Files, Checklists, Journal first, otherwise the existing order; with `readFirst` (Travelling or Past) day rows render no "No booking confirmation yet" and no "Nothing to attach"; planning still renders them; the Files page section "Booking confirmations to add" is unchanged.
- [ ] **Steps 2–4**. **Step 5:** Commit `feat(files): whole card opens the file; quieter rows while travelling`.

---

## Section E: Day view and Money

### Task 23: Day view header slims down while Travelling on a phone

**Spec:** E. **Files:** the Day view page `app/(app)/trips/[tripId]/day/[date]/page.tsx`, the Weather card component, the trip header row that holds the switcher / Share / Notifications; Tests.

- [ ] **Step 1: Failing tests:** Travelling + phone → the switcher/Share/Notifications row is not rendered on the Day view (they stay reachable from Home and More) and the Weather card renders as a one-line strip (`15° / 9° · Rain`) that expands to the full card on tap; planning or desktop → unchanged.
- [ ] **Steps 2–4**. **Step 5:** Commit `feat(day): the plan starts in the first screen while travelling`.

### Task 24: Money shows recent Costs; days sum to the total

**Spec:** E. **Files:** `app/(app)/trips/[tripId]/budget/` page and `cost-summary.tsx`, the by-day grouping in `lib/money/` (find via `grep -rn "by=" app/\(app\)/trips/\[tripId\]/budget lib/money`); Tests.

**Interfaces — Produces:** `recentCosts(costs, limit = 5)` in `lib/money/`: newest first by paid date, else created. By-day grouping: a standalone Cost lands on its paid date, else its Due date; the rest go to a `Not on a day` group; the groups always sum to the grand total.

- [ ] **Step 1: Failing tests:** a Cost added and paid today is first in Recent; the Recent list links to all Costs; by-day with one standalone paid Cost and one undated unpaid Cost → the day gains the first, `Not on a day` holds the second, and the sum of groups equals `costTotalMinor`.
- [ ] **Steps 2–4**. **Step 5:** Commit `feat(money): recent costs, and days that add up`.

### Task 25: Flags name the things they are about

**Spec:** E. **Files:** `lib/flags.ts:780-800` (+ `lib/flags.test.ts`), any MCP test asserting the old text.

- [ ] **Step 1: Failing tests:** `Tight on 2026-12-09 between British Museum and Borough Market: only 0 min, but it's a ~18 min walk.`; `Cutting it close on 2026-12-09 between A and B: 5 min, and it's a ~4 min walk.` Titles longer than 40 characters are truncated with an ellipsis; a Surprise the viewer is being surprised with keeps its masked title.
- [ ] **Steps 2–4**; update snapshot/expectation tests elsewhere that match the old sentence. **Step 5:** Commit `feat(flags): tight-day flags name both things`.

---

## Section F: Digest and unattended running

### Task 26: Digest hours cover the whole route

**Spec:** F. **Files:** `lib/digest-schedule.ts` (+ test), `.github/workflows/digest-cron.yml`, `components/trip/settings/digest-panel.tsx` copy if it lists hours.

- [ ] **Step 1: Failing test:** for each of `Australia/Brisbane`, `Asia/Makassar`, `Asia/Bangkok`, `Europe/London`, `Europe/Dublin`, `Europe/Berlin`, `Europe/Paris`, `Europe/Rome`, on 2026-12-15, at least two of `DIGEST_CRON_UTC_HOURS` fall in the morning window and at least two in the evening window (`slotForZone`). The existing YAML-drift test must still pass.
- [ ] **Step 2:** Choose the smallest hour set that satisfies the test (expected shape: `[6, 7, 9, 10, 12, 13, 19, 20, 21, 22, 23]` or fewer; verify by the test, do not guess). Cron minute becomes `17`. Update the workflow's budget comment with the new runs per day.
- [ ] **Step 3:** Pass; `TZ=UTC npx vitest run lib/digest-schedule.test.ts lib/digest-dispatch.test.ts app/api/cron`. **Step 4:** Commit `feat(digest): every zone on the route gets a morning and an evening run, twice`.

### Task 27: Timezone on resume; crons fail loudly; storage guard

**Spec:** F. **Files:** `components/account/device-sync.tsx` (+ test); `.github/workflows/digest-cron.yml`, `purge-trips-cron.yml`; `lib/storage.ts` (+ test).

- [ ] **Step 1: Failing tests:** DeviceSync reports again on `visibilitychange` to visible when the zone differs from the last one reported or more than 6 hours have passed, and not otherwise. `getStorage()` throws `Error("STORAGE_DRIVER is local on Vercel production. Set STORAGE_DRIVER=r2.")` when `VERCEL_ENV === "production"` and the driver resolves to local; does not throw for preview, dev or test.
- [ ] **Step 2:** Implement. In both workflows any non-2xx status exits 1 with the status and body in the log (keep the existing 503 message).
- [ ] **Step 3:** Pass; task-done verification. Confirm `next build` cannot hit the guard at build time (the guard runs on use, not import). **Step 4:** Commit `fix(ops): timezone follows the phone, crons fail loudly, no local disk in production`.

### Task 28: Trip today respects the Home timezone at both ends

**Spec:** F. **Files:** `lib/tz.ts` (`currentTripTimezone`), `lib/trip-today.ts`, their tests, and callers that must pass `homeTimezone`.

**Interfaces — Produces:** `currentTripTimezone(stops, homeTimezone?: string | null)`: before the first Stop's arrive date (judged in the Home zone) and after the last Stop's depart date (judged in that Stop's zone) it returns `homeTimezone` when set; otherwise unchanged. `tripTodayISO(stops, homeTimezone?)` passes it through.

- [ ] **Step 1: Failing tests** (fake clock): 2026-12-03T15:00Z (01:00 on 4 Dec in Brisbane), first Stop Denpasar arriving 4 Dec → today is `2026-12-04`; 2027-01-07T22:00Z (08:00 on 8 Jan in Brisbane), last Stop Rome departing 7 Jan → `2027-01-08`; no `homeTimezone` → both as before; mid-trip unaffected.
- [ ] **Steps 2–4**; thread `homeTimezone` through the layout, Home loader, Day view loader and phase computation (grep callers of `tripTodayISO` and `currentTripTimezone`). **Step 5:** Commit `fix(tz): the Trip's today uses the Home timezone before and after`.

---

## Section G: small fixes

### Task 29: Hydration, compact money, bell copy, cost description

**Spec:** G. **Files:** `components/trip/journal-editor.tsx:359`, `lib/money/money.ts:246`, the Activity label builder behind "You updated the cost cost" (`lib/activity.ts`), `cost-editor.tsx` / `other-cost-editor.tsx` and their validation; Tests.

- [ ] **Step 1: Failing tests:** journal date renders through `lib/dates.ts` (no `toLocaleDateString`); `formatMoneyCompact(0, "AUD")` → `$0` and 1000 dollars → `$1K` with `minimumFractionDigits: 0` asserted in the options; an updated Cost with description "Lunch" reads `You updated the Lunch cost`, and with none reads `You updated a cost`; saving a Cost with a blank Description while Travelling stores the Category's label as the Description.
- [ ] **Steps 2–4**; run the four previously failing tests under Node 22 if `nvm` is available (`lib/money/money.test.ts`, `spend-so-far-tile.test.tsx`, `trip-cost-tile.test.tsx`). **Step 5:** Commit `fix: journal hydration, compact money on Node 22, bell and cost copy`.

### Task 30: Home leg keeps its departure point; a deleted Surprise takes its Reminders

**Spec:** G. **Files:** `server/actions/transport.ts:135,295` (+ tests); `prisma/schema.prisma:1065-1067` or the delete actions for Items and Stops (+ integration test if the local DB is up).

- [ ] **Step 1:** Read why the Home-end text is stripped (git blame, HT-02 in `docs/open-follow-ups.md:3267`). Keep the strip only for text the Traveller did not enter; an existing stored departure point survives an edit that does not change it.
- [ ] **Step 2: Failing tests:** editing a Home leg's time leaves `depPlace` "Gold Coast (OOL)" intact; clearing it explicitly clears it. Deleting a Surprise Item (and a Surprise Stop) deletes Reminders that pointed at it; deleting a non-Surprise Item keeps today's behaviour (Reminder survives, unlinked).
- [ ] **Step 3:** Implement the Reminder cleanup in the delete actions inside the existing transaction, not by changing `onDelete` (no migration). **Step 4:** Pass. **Step 5:** Commit `fix: Home leg keeps its departure point; Surprise deletes take their Reminders`.

---

## Section H: cleanup

### Task 31: Dead code and unused exports

**Files:** Delete `components/plan/mobile/pick-day-sheet.tsx` and its test, its reference in `components/plan/motion.test.tsx:26`; remove the knip-reported unused exports/types (`npm run knip` for the list); fix the remaining `no-unused-vars` warnings; correct the model default in `.env.example` to match `lib/ai.ts`.

- [ ] **Step 1:** `npm run knip` → note the list. **Step 2:** Remove; `npm run knip` exits 0; `npx tsc --noEmit`; `npx eslint .` has no new warnings. **Step 3:** Commit `chore: remove dead code and unused exports`.

### Task 32: One open list, the rest archived

**Spec:** H. **Files:** Create `docs/open.md`, `docs/archive/README.md`; `git mv` into `docs/archive/`: `docs/open-follow-ups.md`, `docs/things-to-fix.md`, `docs/architecture-sitrep-2026-09-22.md`, `docs/rollout-gate-manual-verify.md`, `docs/follow-ups/`, `SPEC.md`, `ONBOARDING.md`; Modify `docs/DEPLOY.md` (receive the blob-sweep `--execute` warning from the rollout gate §3), every file that links to a moved path (`grep -rn "open-follow-ups\|things-to-fix\|rollout-gate\|docs/follow-ups\|ONBOARDING.md\|SPEC.md" --include="*.md" --include="*.ts" --include="*.tsx" .` excluding `docs/archive` and `node_modules`).

- [ ] **Step 1:** Build `docs/open.md`: a short header (this is the only live list; add to it, strike nothing, delete when done), then the genuinely open items grouped as On the trip, Correctness, Auth and access, Ops, Performance. For each: one line, id if it has one, source path in the archive. Start from these verified-open items and spot-check each against the code before listing: CF-01/02/11, BI-05 (Stop timezone from the country, not the point); CF-03; CF-08/10; FT-02; HT-01 remainder; TC-13; BI-01/02; NAV-01/03/04; PM-03; FT-04; FT-07; RV-01/02; RG-01 (backup artifacts, token rotation); ARCH-TEN-12; the follow-ups in `docs/specs/2026-10-30-google-maps.md:305` and `2026-11-06-google-extras.md:227`; daily Travel-time cron; error re-notify after N days; Digest retries. Drop dev-only minors and anything this branch fixed. Aim for about 60 lines.
- [ ] **Step 2:** Move the files; fix links; update `CLAUDE.md` only if it names a moved file (it does not today, verify). **Step 3:** `TZ=UTC npx vitest run` on any test that reads a moved doc (grep tests for the paths). **Step 4:** Commit `docs: one open list; the old backlog archived untouched`.

### Task 33: Release note and Help

**Files:** the Release notes source (ADR 0056; find via `grep -rn "whats-new" lib | head`), `lib/help-guide*` "While you're away" section; Tests.

- [ ] **Step 1:** Add one Release note dated 2026-11-17 in the existing shape: opening the app with no signal, tickets offline, the new Today view order, tap to read a booking, Directions from where you are. Update Help's "While you're away" so it matches Sections A to D (what is readable offline, that changes need a connection, the saved count). No em-dashes.
- [ ] **Step 2:** `TZ=UTC npx vitest run lib/help-guide.test.ts test/copy-style.test.ts` plus the release-notes tests. **Step 3:** Commit `docs(app): release note and Help for trip-proofing`.

### Task 34: Branch verification

Stated exception: this task runs the full tiers.

- [ ] **Step 1:** `npm test` (Node per `.nvmrc`); `npx tsc --noEmit`; `npx eslint .`; `npm run knip`.
- [ ] **Step 2:** `npm run test:integration` if the local DB is up.
- [ ] **Step 3:** `npm run build` with the localhost DB env, `next start -p 3100`, `npm run audit:offline` → all PASS; stop the server.
- [ ] **Step 4:** Phone-size walkthrough of the Travelling demo Trip (reseed with `db:seed:demo` against localhost): screenshots of Home, a Day with a Journal entry (document width equals viewport), the details sheet, Money, Files. Report anything off; fix in a follow-up commit.
- [ ] **Step 5:** Delete local branches merged into main (`git branch --merged main`, excluding `main`, `beta`, the current branch). Do not push. Beta is fast-forwarded by the main session after the merge.
