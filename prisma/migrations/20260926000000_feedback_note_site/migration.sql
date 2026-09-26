-- Additive on the read path AND the write path (docs/DEPLOY.md §4b): "site" is
-- nullable, so the still-running old build — which does not write it — cannot
-- violate a constraint during the migrate-then-build window, and its reads are
-- unaffected by a column it never selects.
--
-- Deliberately NOT backfilled: NULL means "written before sites were
-- recorded", which every reader treats as main (lib/feedback-site.ts siteOf).

-- AlterTable
ALTER TABLE "FeedbackNote" ADD COLUMN "site" TEXT;
