-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- whatsAroundEnabled is NOT NULL with a DEFAULT, so the still-running old
-- build — which does not write it — inserts rows that get `false` for free,
-- and its reads are unaffected by a column it never selects. Nothing is
-- renamed, dropped, or newly constrained.
--
-- What's around is opt-in per Trip (spec 2026-11-06 §D): every Trip starts off.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "whatsAroundEnabled" BOOLEAN NOT NULL DEFAULT false;
