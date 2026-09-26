-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- settlement is NOT NULL but carries a DEFAULT, so the still-running old
-- build — which does not write it — has every insert filled in as 'BEFORE'
-- during the migrate-then-build window, and its reads are unaffected by a
-- column it never selects. Nothing is renamed, dropped, or newly constrained
-- on an existing column, so this does not reproduce the
-- share_links_per_audience write-path hazard.
--
-- Existing rows take the default. 'BEFORE' ("Before you go") is the domain's
-- default Settlement (CONTEXT.md "Settlement") and is how the app already
-- treated every Cost — Upcoming payments listed them all — so backfilling it
-- changes no total and no list.

-- AlterTable
ALTER TABLE "Cost" ADD COLUMN "settlement" TEXT NOT NULL DEFAULT 'BEFORE';
