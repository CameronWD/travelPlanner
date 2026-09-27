-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- photoAttachmentId is nullable with no FK/constraint, so the still-running
-- old build — which does not write or select it — cannot violate a NOT NULL
-- constraint during the migrate-then-build window, and its reads are
-- unaffected by a column it never selects. Nothing is renamed, dropped, or
-- newly constrained on an existing column, so this does not reproduce the
-- share_links_per_audience write-path hazard.
--
-- Deliberately no foreign key: it is resolved leniently in app code
-- (lib/item-photo.ts `itemPhotoUrl`), so a row whose Attachment was removed
-- out from under it just renders no photo rather than failing a query.
--
-- Deliberately NOT backfilled. NULL on every existing row means "no photo
-- set", which is exactly what every existing Item shows today (CONTEXT.md
-- "Item photo").

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "photoAttachmentId" TEXT;
