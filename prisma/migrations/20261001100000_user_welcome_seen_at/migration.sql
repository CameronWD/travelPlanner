-- First-sign-in Welcome (spec 2026-10-01 §G). Additive on both paths, like
-- whatsNewSeenAt (20260921120000): nullable, so the still-running old build
-- — which never writes it — cannot violate anything during the
-- migrate-then-build window, and its reads never select it.
--
-- Deliberately NOT backfilled. NULL means "has not closed the Welcome", and
-- every Traveller who exists before this column is meant to see it once.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "welcomeSeenAt" TIMESTAMP(3);
