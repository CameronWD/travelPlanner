# Offline audit — 2026-10-01

Spec: `docs/specs/2026-10-01-landing-shuffle-help-offline.md` §F. Decisions:
ADR 0016 (amended 2026-10-01), ADR 0043 (amended 2026-10-01). Glossary:
CONTEXT.md **Saved for offline**.

Method: code read of the whole offline path — `public/sw.js`,
`lib/offline.ts`, `components/offline-warmer.tsx`,
`components/offline-banner.tsx`, `components/ui/use-online-status.ts`,
`components/pwa-register.tsx`, `components/ui/use-server-action.ts`, every
handler in `components/trip/itinerary-manager.tsx`, the trip layout and the
cover/attachment serve routes — plus the existing unit tests. The service
worker is production-only, so nothing here was observed in `next dev`; the
browser verification steps are listed under Deferred.

## Result

**Read-only offline works as ADR 0016 promises for the pages it warms. Three
gaps in failure handling, one gap in coverage, and no way to tell whether a
Trip had been warmed. All fixed on this branch except the two deferred items
below.**

## What works

- **Registration and policy.** `PwaRegister` registers `/sw.js` in
  production only and asks for `navigator.storage.persist()`. The worker is
  network-first for every same-origin page and RSC request (fresh when
  online, cache only as an offline fallback — never a stale private page),
  cache-first for `/_next/static/*`, network-only for `/api/*` and anything
  non-GET or cross-origin, with the attachment route carved out as
  network-first (ADR 0043). `lib/offline.ts` is the pure source of truth;
  `sw.js` mirrors it and `lib/offline.test.ts` covers every rule.
- **Auto-warm.** The trip layout mounts `OfflineWarmer` with
  `tripOfflinePaths(...)`: Home, Plan, Summary, Checklists, Files, Help,
  What's new, up to 60 day pages, and every attachment at or under 10 MiB.
  It runs only when online and only when a service worker controls the page,
  deferred to idle, one `fetch(path, { cache: "no-store" })` per path, never
  throws.
- **The banner.** `OfflineBanner` (`role="status"`) sits app-wide on
  `useOnlineStatus` and already says plan changes need a connection and that
  feedback sends later.
- **Feedback notes offline.** `lib/feedback-queue.ts` queues a note in
  localStorage and sends it when the connection returns (ADR 0041) — the one
  write that is honestly promised offline.
- **Rejected actions mostly handled.** `useServerAction` catches a rejected
  action and reports a `_form` error. Ten of the Plan editor's handlers wrap
  their action in try/catch and toast "Something went wrong — nothing was
  changed. Try again.".
- **Sign-out purge.** `components/ui/sign-out-button.tsx` posts `CLEAR_CACHE`
  and the worker deletes every cache.

## Gaps found

1. **`handleAssign` did not catch** (`itinerary-manager.tsx` ~1045). It set
   the optimistic `chapterId`, awaited `assignStopToChapter`, and handled only
   a `{ success: false }` result. A thrown action — the connection is gone —
   left the stop drawn under a chapter it never joined and rejected unhandled
   from the click.
2. **`handleSuggestChapters` threw into the error boundary** (~1071). The
   await sat inside `startSuggestTransition` with try/finally only, so a
   rejection propagated out of the transition to
   `app/(app)/trips/[tripId]/plan/error.tsx`, replacing the Plan page with
   the recovery panel for an action that changed nothing.
3. **The failure never said why.** Both generic strings ("Something went
   wrong — nothing was changed. Try again." in the Plan editor; "Something
   went wrong. Check your connection and try again." in `useServerAction`)
   were shown unchanged with `navigator.onLine === false`. The banner was the
   only hint, and it is at the top of the page, not where the Traveller is
   looking. ADR 0016 recorded this as a choice ("the banner alone") and
   deferred per-action toasts; the choice was right about per-action copy
   and wrong about the point of failure.
4. **Coverage missed the road views.** Today (`/today`), Money (`/budget`)
   and Calendar (`/calendar`) were not in the warm set — the three pages most
   likely to be opened with no signal — and the cover photo was deliberately
   excluded (ADR 0043), so Home's polaroid and the Trips list showed a broken
   image offline. The cover is served through `next/image` with a passthrough
   loader, so its `<img src>` is the raw `/api/trips/<id>/cover?v=<key>` URL
   and nothing else needs to change for a cached entry to be hit.
5. **Nothing said whether the warm had happened.** The warm is silent by
   design (no button, no toast); in `next dev`, or in any browser where the
   worker is not yet controlling the page, it never runs, and there was no
   way to tell the two apart. Nor was there a way to refresh the cache after
   more planning short of a cold load of the trip.
6. **Verification is production-only.** Nothing offline is observable under
   `next dev` (ADR 0016). Not a defect, but it means every change below was
   verified by unit tests and the production-build steps under Deferred, not
   by a dev-server click-through.

## What this branch changes

- **Task 14 — graceful failure.** `handleAssign` gains try/catch + revert +
  toast; `handleSuggestChapters` catches inside the transition and toasts,
  releasing its in-flight guard. Tests:
  `components/trip/itinerary-manager.test.tsx` "rejected chapter actions
  fail like their siblings".
- **Task 15 — one shared offline message.** `components/ui/failure-message.ts`
  exports `failureMessage(fallback)` → "You're offline. Plan changes need a
  connection." when offline at the moment of failure, else the caller's
  wording. Used by `useServerAction` and by the Plan editor's single
  `toastRejected()` (all twelve rejected-action sites now go through it).
  Tests: `components/ui/failure-message.test.ts`,
  `components/ui/use-server-action.test.tsx`, the Plan editor's "while
  offline" test. ADR 0016 amended.
- **Task 16 — wider warm.** `tripOfflinePaths` adds `/today`, `/budget`,
  `/calendar` and a fifth `coverUrl` argument; the trip layout selects
  `coverImageKey` and passes the exact page URL. `isCoverRoute` joins the
  attachment carve-out in `lib/offline.ts` and `sw.js`; `CACHE_VERSION`
  → `trip-planner-v5`. Tests: `lib/offline.test.ts`, `public/sw.test.ts`
  (mirror pins), `app/(app)/trips/[tripId]/layout.test.tsx`. ADR 0043
  amended.
- **Task 17 — Saved for offline.** `lib/offline-status.ts` (idle | saving |
  saved, `savedAt` per trip in `localStorage` under
  `teepee.offline.savedAt.<tripId>`, `requestWarm()`); `OfflineWarmer`
  reports into it and re-runs on request; `SavedForOffline` on the trip
  Settings page shows "Saved for offline · <relative time>" / "Saving…" /
  "Not saved yet" with "Save again". Tests: `lib/offline-status.test.ts`,
  `components/offline-warmer.test.tsx`,
  `components/trip/settings/saved-for-offline.test.tsx`,
  `app/(app)/trips/[tripId]/settings/page.test.tsx`.
- **Docs.** This audit; ADR 0016 and ADR 0043 amendments; glossary entry
  already added (CONTEXT.md **Saved for offline**); the How-to guide's
  "While you're away" paragraph is updated in Part 3 of the same branch.

## Deferred

1. **Production-only service-worker verification.** The worker is not
   registered under `next dev`, so the end-to-end check has to run against a
   production build served locally — and never with `.env.production.local`
   (that file points at the production database):

   ```
   npm run build
   # with a non-production env file (e.g. .env or .env.local pointing at the
   # local Docker Postgres), then:
   npm run start
   ```

   In Chrome: open a trip (the warm runs at idle; Settings → Offline should
   flip from "Saving…" to "Saved for offline · just now"), DevTools →
   Application → Service Workers → tick Offline, then open Today, Money and
   Calendar (served from cache), open Home (the cover shows), try an edit in
   Plan (the toast says "You're offline. Plan changes need a connection."),
   and press "Save again" while online to watch the row cycle. Also confirm
   the cover's 302 → presigned storage URL is followed and cached under the
   request URL (Application → Cache Storage → `trip-planner-v5`); if the
   storage bucket does not answer the CORS preflight for that fetch, the
   cover will not warm and this needs a bucket CORS rule — attachments share
   the same path, so they would show the same symptom.
2. **ARCH-TEN-12 — cache purge only on explicit sign-out.** `CLEAR_CACHE` is
   sent by the sign-out button alone (`components/ui/sign-out-button.tsx:16`).
   An expired JWT session, a cleared cookie, or a second Traveller signing in
   on the same browser profile leaves the previous user's cached pages,
   attachments and — now — cover in place, served only when genuinely
   offline. The sitrep's fix sketch (send `CLEAR_CACHE` on sign-in as well,
   or key the cache on the user id) stands; out of scope for this branch
   per the spec.
