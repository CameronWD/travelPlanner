# 0077 — A slow network is answered from the saved copy

## Status
Accepted (2026-11-17). Decided in the trip-proofing grill
(`docs/specs/2026-11-17-trip-proofing.md`, A5). Amends ADR 0016: for a page
navigation the cache is no longer only an offline fallback.

## Context

`networkFirst` in `public/sw.js` waited on the network with no timeout and
fell back to the cache only when the fetch rejected. On one bar of signal, or
behind a captive portal, a fetch neither succeeds nor fails for tens of
seconds, so every tap hung although the page was Saved for offline on the
phone. The app cannot tell this case apart from a good connection:
`navigator.onLine` is true on one bar and on a captive portal. A server error
(a bad deploy, the database down) also showed an error page while a saved
copy sat in the cache.

## Decision

1. **A navigation races the network for 4 seconds.** For a page navigation
   handled network-first, the fetch races `NAVIGATION_TIMEOUT_MS` (4000). If
   the network answers first with anything but a 5xx, that answer is
   returned as it came: a success (cached as before), a 4xx (a deleted Trip's
   404 is never masked by a stale copy) or a redirect (a signed-out user sent
   to the Landing).
2. **A timeout or a 5xx gives way to the saved copy.** The saved copy is the
   page's own cache entry through `servableCached`, so a redirected entry is
   never one. For `/` it is the redirect to the saved Trip that an offline
   launch already gets (spec A1), and the page it lands on is served from the
   cache at once instead of racing the network a second time.
3. **No saved copy: unchanged.** The navigation waits for the network however
   long it takes, and gets the offline page only if the fetch fails.
4. **The fetch carries on.** After a timeout the fetch continues under
   `event.waitUntil` and refreshes the cache when it lands, through
   `storableResponse` as every stored response does. If it fails later,
   nothing happens. A 5xx is never cached.
5. **The page is told, and can ask.** A copy served this way carries the
   response header `X-Teepee-Saved-Copy: 1`, and the worker posts
   `{ type: 'SAVED_COPY', url }` to the client the navigation creates
   (`event.resultingClientId`). That client exists only once the response
   arrives, so the worker asks for it every 100 ms for up to 5 seconds and
   never holds the response back. A pushed message alone is unreliable: a
   page's message queue flushes at DOMContentLoaded, before React hydrates
   and listens, and `resultingClientId` may be empty on some browsers. So the
   worker also keeps a short-lived in-memory record of the paths it just
   answered with a saved copy (60 seconds, 8 entries, cleared when the same
   path is next answered from the network), and the page asks it on mount
   with `{ type: 'WAS_SAVED_COPY', url }` over a `MessageChannel`, getting
   `{ savedCopy: boolean }` back. The saved-copy line (spec B3) uses the
   answer and honours the pushed message if it does arrive.
   A copy served because the fetch failed outright is marked the same way
   (header, message, record), as is the page an offline `/` redirects to.
6. **Navigations only.** Attachments (cache-first), the trip cover
   (network-first, but an image request), static chunks and every other
   request behave as before. The rules (`NAVIGATION_TIMEOUT_MS`,
   `SAVED_COPY_HEADER`, `SAVED_COPY_MESSAGE`, `isServerFailure`,
   `savedCopyResponse`, `savedCopyMessage`) live in `lib/offline.ts` and are
   mirrored in `public/sw.js`.

## Considered options

- *Stale-while-revalidate for every navigation.* An online Traveller would
  see a stale private page first on every tap, and their partner's edits one
  visit late.
- *A shorter timeout.* The database cold-starts in 1 to 3 seconds on the
  first request after idle, so 2 seconds would show saved copies to people on
  a good connection.
- *Relying on `navigator.onLine`.* It is true on one bar and on a captive
  portal, the two cases this is for.

## Consequences

- On a slow connection a Traveller can see a page as old as the last time it
  was saved, by the warm or by a visit. The saved-copy line (spec B3) says
  so. The background fetch refreshes only the page that timed out, and only
  if it lands; on a connection that stays slow the next tap times out again.
  A restarted worker forgets its record, so the line then rests on the pushed
  message and on the date check.
- A cold start slower than 4 seconds on a good connection shows the saved
  copy once. That is the cost of the 4-second line, accepted over a hang:
  opening the same page again still races the network first, and the copy it
  falls back to is the one the background fetch refreshed, if that landed. The
  database is warm by then, so the second try is usually fast.
- A slow network on a page that was never saved still waits: there is
  nothing to show instead.
- **Signed-out safety.** The timeout does not widen who can see a cached
  page. The cache is cleared on sign-out (`CLEAR_CACHE`), so a saved copy
  only exists for the user signed in on this browser. The known exception is
  an expired session: its cache stays, and a slow network now shows that
  user's saved copy where the network would have redirected to sign-in
  (ARCH-TEN-12 in `docs/open.md`). Accepted for this trip.
- The pushed message depends on `FetchEvent.resultingClientId`. Where a
  browser does not provide it, the page's pull still works, because it asks
  `navigator.serviceWorker.controller` by URL path. Page script cannot read a
  navigation's headers, so the header is for tests and devtools. Support for
  `resultingClientId` on iOS Safari is unverified.
- Verifying this needs `next build` and `next start`: the worker is not
  registered under `next dev` (ADR 0016).
