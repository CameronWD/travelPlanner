-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- forksEnabled is NOT NULL with a DEFAULT, so the still-running old build —
-- which does not write it — inserts rows that get `false` for free, and its
-- reads are unaffected by a column it never selects. Nothing is renamed,
-- dropped, or newly constrained, so this does not reproduce the
-- share_links_per_audience write-path hazard.
--
-- Backfilled to `true` for every Trip that already has a Fork, so nobody's
-- existing what-if variants disappear on deploy; every other Trip starts with
-- plan variants off (opt-in, spec 2026-09-26 B3).

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "forksEnabled" BOOLEAN NOT NULL DEFAULT false;
-- A Trip that already has a Fork keeps seeing it (spec B3).
UPDATE "Trip" SET "forksEnabled" = true WHERE "id" IN (SELECT DISTINCT "tripId" FROM "Fork");
