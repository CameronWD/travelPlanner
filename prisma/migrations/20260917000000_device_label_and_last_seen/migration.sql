-- A Device gains a name and an age (ADR 0048).
--
-- `label` is a coarse, fixed string captured once when the Device is enabled
-- (lib/device-label.ts) so a Traveller can tell their phone from their laptop.
-- Nullable forever: an unrecognised user agent gets no label rather than a
-- guess, and every row that exists before this migration has none.
--
-- `lastSeenAt` is the load-bearing one. It is stamped by the Device's OWN
-- browser on visit, so a Device that loses notification permission stops
-- answering and its row visibly goes quiet — the only signal available, since
-- a push service reports success for a subscription whose web app is gone.
--
-- Order is load-bearing: the column is added nullable, backfilled from
-- `createdAt`, and only then made NOT NULL. Defaulting straight to now() would
-- claim every existing Device had just checked in, and backfilling to the
-- epoch would flag every one of them as stale on the first render after
-- deploy. `createdAt` is the last moment we actually know the Device was real.
ALTER TABLE "PushSubscription" ADD COLUMN "label" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
UPDATE "PushSubscription" SET "lastSeenAt" = "createdAt" WHERE "lastSeenAt" IS NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "lastSeenAt" SET NOT NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "lastSeenAt" SET DEFAULT CURRENT_TIMESTAMP;
