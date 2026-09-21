# 0043 — Attachments warm for offline through the authenticated serve route

## Status
Accepted (2026-09-14). Narrows ADR 0016.

## Context
ADR 0016 excluded file attachments from the offline warm set on two grounds:
they are "served from object storage on a separate origin" and are "large".
Both are now false. Attachments are not fetched from a separate origin at
all — the browser only ever requests `/api/attachments/:id`, a same-origin
Next.js route that authenticates the caller (`requireUser`, then
`requireTripAccess` or `requireGlobeAccess`) before reading the bytes from
storage and returning them with `Cache-Control: private, max-age=3600`.
Object storage is an implementation detail behind that route, invisible to
the service worker. Size is also no longer unbounded: `validateUpload` in
`lib/storage.ts` rejects any upload over 10 MiB (`MAX_BYTES`) before it is
ever stored, so "large" no longer describes what's in the database.

With both original objections gone, the reasoning that carved attachments
out of ADR 0016's warm set no longer applies. A traveller offline with a
flight or hotel booking attached to a Stop still couldn't open it — the one
case where losing signal and needing a document coincide most often.

## Decision
- `lib/offline.ts` adds `isAttachmentRoute`, matching `/api/attachments/:id`,
  and a new Rule 3a ahead of the general `/api/*` rule: attachment requests
  get `network-first` instead of `network-only`, so a previously-fetched
  attachment falls back to its cached response when offline.
  `public/sw.js` mirrors the same rule in plain JS.
- `tripOfflinePaths` takes a fourth argument, `attachments: WarmAttachment[]`
  (`{ url, size }`), and appends each attachment's URL to the warm set,
  skipping any over `MAX_WARM_ATTACHMENT_BYTES` (10 MiB — matched to the
  upload cap, so in practice nothing is skipped, but the guard stays in the
  pure warmer rather than depending on that invariant holding forever).
  The trip layout (`app/(app)/trips/[tripId]/layout.tsx`) queries
  `db.attachment.findMany({ where: { tripId }, select: { url: true, size:
  true } })` and passes the result through.
- `/trips/:id/files` joins the base set of warmed pages, so the page that
  lists every attachment is itself available offline (the links on it work
  because the attachments behind them are warmed too).
- Attachment links (`attachment-links.tsx`, `attachment-list.tsx`) open as
  plain same-tab navigations rather than `target="_blank"`, so viewing a
  ticket stays in-app instead of handing off to a new browser tab/window
  that a PWA shell may not carry offline state into.
- `components/pwa-register.tsx` requests `navigator.storage.persist()` on
  registration, reducing the odds the browser evicts the runtime cache
  (including warmed attachment bytes) under storage pressure.
- `CACHE_VERSION` in `public/sw.js` bumps to `trip-planner-v3` so clients
  running the old cache-policy purge it and pick up the new rule cleanly.

## Considered Options
- **Per-file "save offline" button**, mirroring the page-warming manual
  alternative ADR 0016 already considered and rejected. Rejected here for
  the same reason: a manual step travellers routinely forget defeats the
  point of an invisible, automatic warm.
- **Caching inside `networkFirst` via a `Content-Length` check** on the
  response, instead of filtering by size before the URL is ever added to the
  warm set. Rejected: the warmer already knows each attachment's `size` from
  the database at build time — checking it again at fetch time from a
  response header is redundant work solving a problem the warmer already
  solved.
- **Including `/api/trips/:tripId/cover`** (the trip cover image) in the same
  carve-out. Rejected for now: it's cosmetic, not a ticket a traveller needs
  to prove — no one filed it as a problem. Deliberately left out; revisit if
  it becomes an actual complaint.

## Consequences
- The service worker's runtime cache now holds private file bytes (tickets,
  booking confirmations), not just HTML/RSC page bodies. This is not new
  exposure: the browser's own HTTP cache was already permitted to hold the
  same bytes under the same `Cache-Control: private` header; the SW cache is
  an additional copy with an identical trust boundary, and it is purged by
  the same sign-out `CLEAR_CACHE` message that clears every other cached
  page.
- The route's `// Files are user-private: never cache publicly` comment in
  `app/api/attachments/[id]/route.ts` stays true as written — `private`
  describes the HTTP cache directive, which forbids shared/CDN caching. The
  service worker cache is per-browser-profile, not a shared cache, so nothing
  about this decision makes that comment inaccurate.
- Verifying this still requires `next build` plus a local production server
  (or a deployed environment): per ADR 0016, the service worker is not
  registered under `next dev`, so offline behaviour — attachments included —
  is invisible in the dev server regardless of this change.

## Amendment — 2026-09-21: the same-tab rule is scoped to the installed PWA

A Traveller reported that opening an attachment navigates away from the page
they were working on — filed from desktop Chrome. That is precisely the
behaviour the Decision above introduced, so the two had to be reconciled
rather than one silently overwriting the other.

The Decision's stated reason is narrower than the rule it wrote. It names the
risk as handing off "to a new browser tab/window that a PWA shell may not
carry offline state into" — and that is true of the **installed PWA**, where
the handoff goes to an in-app browser outside the service worker's control. It
is not true of an ordinary browser tab: a new same-origin tab is controlled by
the *same* service worker and served from the *same* runtime cache, so a
warmed attachment opens offline there exactly as it does in the current tab.

So the rule is scoped to the context its reasoning actually covers:

- **Installed PWA — unchanged.** Attachment links navigate in-app. Everything
  the Decision above says continues to hold, and the offline-ticket case it
  was written for is untouched.
- **Ordinary browser tab — opens out.** Only for files the browser renders in
  place (`rendersInline`, `lib/attachment-display.ts`); a file it downloads
  never navigates, so opening a tab for one would leave it blank.

The choice is made in a click handler (`components/trip/attachment-link.tsx`),
not in the markup, so **no `target` attribute is rendered in either context**.
The test this ADR introduced —
`components/trip/attachment-links.test.tsx:15-19` — therefore still passes
verbatim, and still guards the thing it was written to guard.

This also closes a question raised while planning the change: whether
`target="_blank"` from the installed iPhone app would reach the sign-in page,
since a standalone iOS PWA can hold a cookie jar separate from Safari. Under
this amendment the installed app never opens out, so the case cannot arise and
needs no device verification.
