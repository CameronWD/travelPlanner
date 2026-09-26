-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- hiddenFromShares is NOT NULL with a DEFAULT, so the still-running old
-- build — which does not write it — inserts rows that get `false` for free,
-- and its reads are unaffected by a column it never selects. Nothing is
-- renamed, dropped, or newly constrained, so this does not reproduce the
-- share_links_per_audience write-path hazard.
--
-- Backfilled to `false` by the DEFAULT: every existing Item was, until now,
-- shown on every share link that had its dial on — `false` (not hidden)
-- is the only value that leaves that behaviour unchanged for rows written
-- before this migration.

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "hiddenFromShares" BOOLEAN NOT NULL DEFAULT false;
