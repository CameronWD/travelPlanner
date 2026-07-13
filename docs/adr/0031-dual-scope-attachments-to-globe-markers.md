# Attachments are dual-scoped: Trip-owned or Globe-owned (for Markers)

## Context

Attachments were hard-wired to a **Trip**: `Attachment.tripId` was required, storage
keys were built as `trips/<tripId>/…`, and every access path (`uploadAttachment`,
the `/api/attachments/[id]` serve route, `deleteAttachment`) gated on
`requireTripAccess`. We now want to attach files to a **Marker**, which lives on
the account-level **Globe** (see ADR 0023) — a thing that has no Trip.

Alternatives considered:

1. **A separate `MarkerAttachment` table** with its own upload/serve/delete
   actions, storage path, and list component. Clean isolation, but duplicates the
   entire tested attachment stack (storage layer, serve route, `AttachmentList`
   UI) into a parallel one to build and maintain.
2. **A polymorphic owner** (`ownerType`/`ownerId`) replacing `tripId`. Cleanest in
   the abstract, but a bigger migration that rewrites every existing row and every
   query.
3. **Dual-scope the existing model** — keep it as one table that can be owned by a
   Trip *or* a Globe.

## Decision

Dual-scope the existing `Attachment` model (option 3):

1. **`tripId` becomes nullable; add a nullable `globeId`.** Exactly one of the two
   is set per row (a trip attachment or a globe attachment). Add `"MARKER"` to
   `TARGET_TYPES`; a Marker attachment is `{ globeId, targetType: "MARKER",
   targetId: <markerId> }`.
2. **Access, storage, and revalidation branch on scope.** `tripId` set →
   `requireTripAccess` + `trips/<tripId>/…` + revalidate `/trips/…`; `globeId` set
   → `requireGlobeAccess` (a user belongs to exactly one Globe, so no id
   parameter — verify the row's `globeId` matches the caller's Globe) +
   `globes/<globeId>/…` + revalidate `/globe`. The `/api/attachments/[id]` serve
   route picks the guard by which owner column is populated.
3. **The `AttachmentList` component + upload/delete actions take a scope** (a
   `tripId` or a `globeId`) rather than assuming a trip, so the same UI and storage
   code serve both. `Note` is **not** touched — Markers keep their single existing
   `note` field, so notes stay trip-only.

## Consequences

- **"Why does Attachment have both a tripId and a globeId?"** is exactly the
  question a future reader will ask — this ADR is the answer. The trade-off: we
  accept a nullable-owner invariant enforced in app code (exactly-one-set) in
  exchange for reusing the whole attachment stack instead of duplicating it.
- **Deleting a Marker** must clean up its Globe-scoped attachments + stored files,
  mirroring the trip-part cleanup (there is no FK cascade across the loose
  `targetId`).
- **No activity logging** for Marker attachments: the activity feed is Trip-scoped
  and the Globe has none, so Marker attachments (like Marker add/edit/delete) are
  not logged — consistent with the rest of the Globe.
- **Reversible at a price:** a down-migration would drop `globeId`, restore
  `tripId NOT NULL`, and remove `"MARKER"`; the `globes/…` blobs are harmless to
  leave.
