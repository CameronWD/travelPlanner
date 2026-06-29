# Offline support is read-only, with proactive auto-warming of the active trip's key pages

A traveller who loses signal abroad needs to *read* their itinerary — not edit it. Trip data is server-rendered into the page HTML, so a page the browser has cached carries its data with it; no separate data-sync layer is needed. The existing service worker (`public/sw.js`) already uses a **network-first** strategy for page navigations, meaning any page visited while online is cached and served as an offline fallback automatically. We build on that by (a) proactively warming the active trip's key pages the moment a traveller opens the trip — via a `tripOfflinePaths` helper and an `OfflineWarmer` client component mounted in the trip layout — so the cache is populated before signal drops, and (b) surfacing offline state app-wide with an `OfflineBanner` driven by a `useOnlineStatus` hook so the traveller always knows they are offline and that their view is read-only.

## Considered Options

- **Explicit "Download for offline" button.** The traveller taps a button to cache the trip before leaving. Rejected for v1: it is a manual step that travellers routinely forget, and the whole point is that the warm should be invisible and automatic.
- **Offline editing with a mutation queue and sync.** Allow writes offline, queue them, and replay on reconnect. Rejected: large in scope, requires conflict-resolution logic for concurrent edits, and is well outside the goal of read access for v1.

## Consequences

- Edits (creating/updating Stops, costs, checklists, etc.) fail while offline. v1 signals this via the banner alone — per-action "can't edit offline" toasts are **explicitly deferred**: implementing them would require touching every mutation site across the app, and the cost was judged too high for the signal gained at this stage. This is a recorded choice, not an oversight.
- File attachments are not pre-warmed; they are large, are served from object storage on a separate origin, and are out of scope for the warm set.
- The service worker is production-only (it is not registered in `next dev`). Offline behaviour is therefore testable via `next build` and a local production server or a deployed environment — not the development server.
