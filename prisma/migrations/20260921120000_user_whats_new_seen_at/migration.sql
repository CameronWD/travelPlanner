-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- whatsNewSeenAt is nullable, so the still-running old build — which does not
-- write it — cannot violate a NOT NULL constraint during the
-- migrate-then-build window, and its reads are unaffected by a column it
-- never selects. Nothing is renamed, dropped, or newly constrained, so this
-- does not reproduce the share_links_per_audience write-path hazard.
--
-- Deliberately NOT backfilled. NULL is meaningful here rather than missing:
-- it means "this Traveller has never dismissed What's new", which the app
-- reads as caught up as of User.createdAt (lib/release-notes.ts). Backfilling
-- to now() would say almost the same thing for today's two Travellers and the
-- wrong thing for every account created afterwards.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "whatsNewSeenAt" TIMESTAMP(3);
