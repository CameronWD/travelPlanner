-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- coverAspect is nullable, so the still-running old build — which does not
-- write it — cannot violate a NOT NULL constraint during the migrate-then-
-- build window, and its reads are unaffected by a column it never selects.
-- Nothing is renamed, dropped, or newly constrained, so this does not
-- reproduce the share_links_per_audience write-path hazard.
--
-- Deliberately NOT backfilled here. NULL means "aspect not yet known" — the
-- trips-list card falls back to client-side portrait detection (spec F) for
-- such a cover — and existing covers are backfilled out-of-band by the
-- operator-run scripts/backfill-cover-aspect.ts.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "coverAspect" DOUBLE PRECISION;
