# Offline support is read-only, with proactive auto-warming of the active trip's key pages

A traveller who loses signal abroad needs to *read* their itinerary — not edit it. Trip data is server-rendered into the page HTML, so a page the browser has cached carries its data with it; no separate data-sync layer is needed. The existing service worker (`public/sw.js`) already uses a **network-first** strategy for page navigations, meaning any page visited while online is cached and served as an offline fallback automatically. We build on that by (a) proactively warming the active trip's key pages the moment a traveller opens the trip — via a `tripOfflinePaths` helper and an `OfflineWarmer` client component mounted in the trip layout — so the cache is populated before signal drops, and (b) surfacing offline state app-wide with an `OfflineBanner` driven by a `useOnlineStatus` hook so the traveller always knows they are offline and that their view is read-only.

## Considered Options

- **Explicit "Download for offline" button.** The traveller taps a button to cache the trip before leaving. Rejected for v1: it is a manual step that travellers routinely forget, and the whole point is that the warm should be invisible and automatic.
- **Offline editing with a mutation queue and sync.** Allow writes offline, queue them, and replay on reconnect. Rejected: large in scope, requires conflict-resolution logic for concurrent edits, and is well outside the goal of read access for v1.

## Consequences

- Edits (creating/updating Stops, costs, checklists, etc.) fail while offline. v1 signals this via the banner alone — per-action "can't edit offline" toasts are **explicitly deferred**: implementing them would require touching every mutation site across the app, and the cost was judged too high for the signal gained at this stage. This is a recorded choice, not an oversight.
- File attachments were originally excluded from the warm set; ADR 0043 narrows this — they are now warmed through the authenticated same-origin serve route.
- The service worker is production-only (it is not registered in `next dev`). Offline behaviour is therefore testable via `next build` and a local production server or a deployed environment — not the development server.

## Amendment — 2026-10-01: the banner plus one shared offline message at the point of failure

The Consequences above say v1 signals a failed offline edit "via the banner
alone" and defers per-action "can't edit offline" toasts. The offline audit
of 2026-10-01 (`docs/audits/2026-10-01-offline-audit.md`) found the banner
was not enough on its own — not because per-action copy was missing, but
because the failure a Traveller actually saw at the point of the edit never
named the connection ("Something went wrong — nothing was changed. Try
again."), and two Plan handlers did not catch a rejected action at all: one
left an optimistic change on screen, the other threw into the Plan error
boundary for an action that changed nothing.

What changes:

- **One shared message.** `failureMessage(fallback)` in
  `components/ui/failure-message.ts` returns "You're offline. Plan changes
  need a connection." when `navigator.onLine === false` at the moment of the
  failure, otherwise the caller's own generic wording. `useServerAction`
  (`components/ui/use-server-action.ts`) and the Plan editor's
  rejected-action toast (`toastRejected()` in
  `components/trip/itinerary-manager.tsx`) both use it. The offline copy is
  one string in one place; no mutation site carries its own.
- **The two Plan handlers fail like their siblings.** `handleAssign` wraps
  `assignStopToChapter` in try/catch, reverts the optimistic chapter move
  and toasts; `handleSuggestChapters` catches inside its transition and
  toasts instead of reaching `plan/error.tsx`.
- **Saved for offline is visible.** The Trip you last opened is still warmed
  automatically; the Trip's Settings page now says whether that finished
  ("Saved for offline · 2h ago" / "Saving…" / "Not saved yet") with a "Save
  again" retry (`lib/offline-status.ts`,
  `components/trip/settings/saved-for-offline.tsx`). The warm set grows to
  Today, Money, Calendar and the cover photo (ADR 0043, amended the same
  day).

What does not change: **per-action toasts — distinct copy per mutation site
— are still not pursued**, for the reason given above (every mutation site
would need touching for little extra signal; the shared message gives the
one fact that matters). Offline editing and a mutation queue remain out of
scope; a "Download for offline" button remains rejected; cache clearing on
session expiry stays a follow-up (ARCH-TEN-12).
