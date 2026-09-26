-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- coverFocalX/coverFocalY are nullable, so the still-running old build — which
-- does not write them — cannot violate a NOT NULL constraint during the
-- migrate-then-build window, and its reads are unaffected by columns it never
-- selects. Nothing is renamed, dropped, or newly constrained, so this does not
-- reproduce the share_links_per_audience write-path hazard.
--
-- Deliberately NOT backfilled. NULL means "no focal point chosen", which the
-- cover reads as the centre of the photo (spec E2) — exactly what every
-- existing cover shows today.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "coverFocalX" DOUBLE PRECISION,
ADD COLUMN "coverFocalY" DOUBLE PRECISION;
