-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- includeJournal is NOT NULL with a DEFAULT, so the still-running old build
-- — which does not write it — inserts rows that get `false` for free, and
-- its reads are unaffected by a column it never selects. Nothing is
-- renamed, dropped, or newly constrained, so this does not reproduce the
-- share_links_per_audience write-path hazard.
--
-- Backfilled to `false` by the DEFAULT: every existing Share link showed no
-- Journal section before this migration, and per ADR 0051's amendment the
-- Journal dial is off on every existing link — `false` is the only value
-- that leaves every link's behaviour unchanged.

-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN "includeJournal" BOOLEAN NOT NULL DEFAULT false;
