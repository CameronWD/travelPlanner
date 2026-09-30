-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- showTravellers is NOT NULL with a DEFAULT, so the still-running old build
-- inserts rows that get `false` for free.
--
-- Backfilled to `false` by the DEFAULT (ADR 0051 amendment 2026-09-30): a
-- link already sitting in a group chat must not start showing who is on the
-- trip until someone turns it on for that audience.

-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN "showTravellers" BOOLEAN NOT NULL DEFAULT false;
