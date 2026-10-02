# Spec — Long names no longer widen the Share page or Summary; a storage quota; a 30-day Recently deleted for Trips (2026-10-02)

**Status:** agreed with Cam 2026-10-02; awaiting "go".
**Branch:** `fix/summary-width-and-safety-2026-10-02`. Target `main`.
Terminology follows `CONTEXT.md` (new term this round: **Recently deleted**; ADR 0067).

| Part | Contents | Closes |
|---|---|---|
| A | Long user text (Stop, place, Traveller, Trip names) can no longer widen the Share page or the Summary on a phone | — |
| B | Storage quota: 500 MB per Trip, 8 GB across the app, admin email at the ceiling | — |
| C | Deleting a Trip moves it to **Recently deleted** for 30 days; the owner can Restore; the sweep destroys it after | — |
| D | Small hardening: per-IP cooldown on `POST /api/client-error`; `uploadAttachment` checks access before buffering the file | — |
| E | Docs: ADR 0067, a restore runbook, a manual checklist for Cam | — |
| F | A cover or Item photo that fails to load falls back to the generated art or a tinted glyph; the offline warm set is capped at 200 MB per Trip | — |

**Context that shaped the scope (Cam, 2026-10-02):** Vercel and Resend have no card on
file and Neon is on the free tier, so those three *pause* rather than bill when exhausted;
the AI provider is not connected. The only metered service that can charge is Cloudflare
R2, which has a card. So the cost work is the storage quota and nothing else.

**Out of scope (decided):** per-user AI call quotas (AI is off); a cooldown on sign-in
link sends (Resend cannot bill); provider-side spend caps (manual, see §E); widening
Undo to Costs, Accommodation or Transport; changing who may delete Stops, Items or Costs
(members may, shared editing is the product); an account-deletion flow; magic-byte
sniffing of uploads; a trash for Globes or Globe Markers; the three *Needs review*
feedback notes (shopping list, lower-case logo, the Bali Sisters note) — Cam accepts or
declines those.

---

## A. Long names no longer widen the page

**Why.** On Cam's phone the Share page for the EU trip became wider than the screen and
squeezed everything else; a long name somewhere did it. The cause is structural, not one
string: flex and grid children carrying user text have no `min-w-0`, so their minimum
width is the text's unbroken width.

**What.** On `app/share/[token]/*` and `app/(app)/trips/[tripId]/summary/page.tsx`
(plus the Trip shell header in `app/(app)/trips/[tripId]/layout.tsx:133-136`):

- Every flex or grid child that contains user text gets `min-w-0`, and the text itself
  gets either `truncate` (single-line rows: route list rows, top bar, transport "from →
  to", accommodation name, stat values) or `break-words` (headings and multi-line text:
  Stop `h3`s, the hero's Trip name, contact details, chapter headers).
- The Share page root and the Summary page root get `overflow-x-hidden` as a backstop,
  so a spot missed later degrades to clipped text, never to a sideways-scrolling page.
- Known spots from the audit: Summary stop card header (`:593-615`), stop budget column
  (`:617`), accommodation row (`:641-648`), transport row (`:652-668`), rough stop cards
  (`:171-182`, `:505-517`), chapter header (`:553-568`), category rows (`:735-741`), stat
  bar (`:455`, `:788-793`); Share hero contacts (`share-hero.tsx:179-190`), route list
  rows (`share-route-list.tsx:37-100`), top bar (`share-top-bar.tsx:16-30`), day-by-day
  rows (`share-rows.tsx:155`, `day-by-day.tsx`).

**Test.** A render test for each page with a Stop named with 60 unbroken characters, a
Traveller display name of 50, and a Trip name of 80, asserting no element's
`scrollWidth` exceeds the 390px container (jsdom cannot lay out; assert the classes
instead — every element whose text is user-supplied has `min-w-0` on its flex/grid
ancestor chain and `truncate` or `break-words` on itself). Plus a manual check in the
browser at 390px with the same names (§E checklist).

## B. Storage quota

**Why.** Nothing bounds how much a Traveller can upload. R2 is the one service with a
card. 10 GB is R2's free allowance.

**What.**

- `lib/storage-quota.ts`: `TRIP_QUOTA_BYTES = 500 * 1024 * 1024`,
  `GLOBAL_QUOTA_BYTES = 8 * 1024 * 1024 * 1024`. `assertQuota({ tripId | globeId, size })`
  sums `Attachment.size` for the owner scope and for the whole table (a Trip in Recently
  deleted still counts — its files are still stored) and throws a typed `QuotaExceeded`
  with `scope: "trip" | "global"` when `sum + size` would exceed the cap.
- Every upload action calls it after the access check and before `storage.save`:
  `uploadAttachment`, `setCover`, `setItemPhoto`, `setProfilePhoto`, the Journal photo
  path. Profile photos and covers are Attachments or sit in the same bucket; whichever
  rows they create count toward the Trip (covers, Item and Journal photos) or only the
  global cap (profile photos, which belong to no Trip).
- Globe-scoped Attachments count toward the global cap only.
- Messages: trip scope — "This Trip has used its 500 MB of file storage. Delete some
  files to add more." Global scope — "Teepee's file storage is full. Cam has been told."
  Returned as the action's error result and shown by the existing error toast.
- At the global cap, `lib/admin-notify` sends one email per 24 hours (a `DigestDispatch`-style
  cooldown row or an in-table `AdminNotice` row — pick whichever the existing helper
  already supports), subject "Teepee storage is at its 8 GB ceiling".
- Settings → Files shows "Used 123 MB of 500 MB" under the Files heading on the Trip,
  read from the same sum. No bars, no colour until 90%, then the number goes amber.

**Test.** Unit tests on `assertQuota` at the boundary (exactly at cap passes, one byte
over throws; Trip-scoped and global). Action tests that an over-quota upload returns the
error result and leaves no `Attachment` row and no blob.

## C. Recently deleted (ADR 0067)

**What.**

- `Trip.deletedAt DateTime?` with an index. `deleteTrip` sets it instead of deleting and
  redirects to the Trips page as today. The confirm dialog keeps type-the-name; the button
  reads **Delete** and the copy says "Goes to Recently deleted for 30 days. Only you can
  restore it."
- `requireTripAccess` loads `trip.deletedAt` alongside membership and answers
  `notFound()` when set. The Trips list query, Share link resolution, `/api/calendar/[token]`,
  the Digest cron's trip selection, the Globe's trip reads and `last-trip` all filter
  `deletedAt: null`.
- Trips page: a **Recently deleted** section at the bottom, owner's deleted Trips only,
  each row: name, "Deleted 3 days ago · gone in 27 days", **Restore**. Section hidden when
  empty. `restoreTrip(tripId)` — owner or member Admin (ADR 0045), clears `deletedAt`,
  revalidates.
- `scripts/sweep-deleted-blobs.ts` gains a first step: `db.trip.deleteMany({ where: { deletedAt: { lt: now - 30d } } })`,
  logged per Trip, honouring the script's existing dry-run default.
- Duplicate: a deleted Trip cannot be duplicated (gated by `requireTripAccess`, so free).

**Test.** `deleteTrip` leaves the row with `deletedAt`; the owner's Trips list omits it
and the Recently deleted query includes it; a member's `requireTripAccess` is `notFound`;
Share link and calendar token answer 404; `restoreTrip` by a non-owner member is refused;
after restore the Share link answers again; the sweep destroys only Trips past 30 days.

## D. Small hardening

- `POST /api/client-error`: in-memory per-IP token bucket, 10 reports per minute, 429
  beyond. Documented as best-effort per instance (ADR 0059 already calls it
  rate-limited-by-obscurity; this makes it rate-limited-by-code on top).
- `uploadAttachment`: move `requireTripAccess` / `requireGlobeAccess` above
  `validateUpload` and the `arrayBuffer()` call (`server/actions/attachments.ts:121-134`).

## E. Docs and Cam's manual checklist

- ADR 0067 (written). CONTEXT.md gains **Recently deleted** (written).
- `docs/restore-runbook.md`: how to fetch the latest `db-backup.yml` artifact, restore it
  into a scratch Neon branch, and copy one Trip's rows across by `tripId` — written as a
  procedure for Cam, with the warning that it is a last resort now that §C exists.
- Manual, for Cam, not code: set a Cloudflare billing notification on R2 (dashboard →
  Notifications → Billing); confirm Vercel, Resend and Neon still have no card / free
  tier so exhaustion pauses rather than bills; after deploy, open the EU Trip's Share link
  at 390px and give one Stop a 60-character name to confirm §A.

## F. Images that fail to load; a cap on the offline warm set

**Why.** Cam asked whether a cover or Item photo that does not load has a nice
placeholder. The *no photo* state does (route sketch, passport stamp); the *failed
load* state does not — there is no `onError` on any image in the codebase, so offline before the
first online open on that device, after cache eviction, or on a missing blob the polaroid
shows the browser's broken-image glyph and the Item thumb an empty bordered square.

**What.**

- `CoverArt` (`components/trips/trip-cover.tsx`) always renders the generated art
  (sketch or stamp) as the bottom layer. When a photo exists, `CoverPhotoImage` sits on
  top with `opacity-0` until `onLoad`, then fades in over ~200 ms; on `onError` it
  unmounts and the generated art simply stays. The fallback is the exact art the Trip
  would have had with no photo, so an offline Trips page reads as designed, not broken.
  `sketchModel` is already computed in the same component; no new data is fetched.
- `ItemPhotoThumb` (`components/trip/item-photo-thumb.tsx`): on `onError` the `img`
  is replaced by a `bg-<hue>-fill` square with a 16px photo glyph (lucide `Image`),
  `aria-label="Photo unavailable"`, and the lightbox trigger is disabled. Hue comes from
  the Trip via the existing hue prop chain, or `bg-muted` where no hue reaches the thumb.
- The Share page's hero photo and the Globe Marker photo, if they render a blob, get the
  same treatment through the same two components (audit during the plan; add a case per
  component found).
- **Warm once per device, not per open.** Today the warmer fetches every Attachment with
  `cache: "no-store"` on every Trip open and the service worker's rule for
  `/api/attachments/:id` is network-first, so a 100-file Trip re-downloads all of it each
  visit — bandwidth for the Traveller, a membership query on Neon per file, and a function
  invocation per file on Vercel. Change: the warmer (`components/offline-warmer.tsx`)
  checks `caches.match(path)` first and skips files already cached; the service worker
  rule for `/api/attachments/:id` becomes **cache-first** (an Attachment id is immutable —
  a replaced file is a new id; the cover route keeps its `?v=` and network-first). Sign-out
  still purges the cache (ADR 0043), so a device handed to someone else holds nothing.
  Accepted consequence: a Traveller removed from a Trip keeps, on that device, the files
  it already downloaded until they sign out — no different from having saved them.
  ADR 0043's amendment records both this and the cap below.
- **Offline warm cap.** `tripOfflinePaths` (`lib/offline.ts`) takes the Attachment list
  sorted newest-first and stops adding files once their cumulative size passes
  `MAX_WARM_TRIP_BYTES = 200 * 1024 * 1024`. The 10 MiB per-file skip stays. A note on
  Files — "Files from the last 200 MB are kept on this device for offline use" — is
  shown only when the Trip exceeds the cap. ADR 0043 gets a one-paragraph amendment
  dated 2026-10-02.

**Test.** `CoverArt` with a photo renders both layers; firing `error` on the image leaves
only the generated art and no `img`. `ItemPhotoThumb` on `error` renders the glyph and
the trigger is `disabled`. `tripOfflinePaths` with 30 × 10 MiB attachments warms the 20
newest and skips the rest; at exactly 200 MB nothing is skipped. The warmer does not
fetch a path `caches.match` already answers; `cachePolicyFor('/api/attachments/x')` is
`cache-first` and `/api/trips/x/cover?v=1` stays `network-first`.
