-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- displayName/photoKey/photoUpdatedAt are all nullable, so the still-running
-- old build — which does not write or select them — cannot violate a NOT
-- NULL constraint during the migrate-then-build window, and its reads are
-- unaffected by columns it never selects. Nothing is renamed, dropped, or
-- newly constrained on an existing column, so this does not reproduce the
-- share_links_per_audience write-path hazard.
--
-- Deliberately NOT backfilled. NULL on every existing row means "hasn't set
-- one", which lib/traveller.ts reads as: fall back to the sign-in provider's
-- name/image, then initials — exactly what every existing Traveller shows
-- today (CONTEXT.md "Profile photo and display name").

-- AlterTable
ALTER TABLE "User" ADD COLUMN "displayName" TEXT,
ADD COLUMN "photoKey" TEXT,
ADD COLUMN "photoUpdatedAt" TIMESTAMP(3);
