-- Additive and nullable (docs/DEPLOY.md §4b): the still-running old build
-- never writes roughMonth, so it cannot violate a constraint during the
-- migrate-then-build window, and its reads never select it.
-- CONTEXT.md "Rough month": a wish ("Sometime in April"), never a date.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "roughMonth" TEXT;
