-- Reminders become dated notes (ADR 0047): no firing instant, no sent flag, no
-- target reference. Only the COST_DUE marker rows are retired — idempotency for
-- those moves to DigestDispatch.
--
-- This deliberately does NOT open with `DELETE FROM "Reminder"`. That version
-- was safe only because the table was counted empty three weeks before the
-- deploy, and this file runs unattended inside the Vercel production build
-- (vercel.json → `prisma migrate deploy`): a row written between the count and
-- the deploy would be destroyed with nothing to say so. A Traveller's Reminder
-- is a note they wrote by hand; it carries a title worth keeping and a firing
-- instant that converts straight to the date the column now holds. Order is
-- load-bearing — `date` is backfilled from `fireAt`, and the COST_DUE rows are
-- identified by `targetType`, so both columns are dropped only afterwards.
-- docs/DEPLOY.md §5 still asks for the row count before deploying, because a
-- non-zero one means a code path we do not know about is writing them.
-- Deliberately not `to_char("fireAt" AT TIME ZONE 'UTC', ...)`. `fireAt` is a
-- Postgres TIMESTAMP WITHOUT TIME ZONE, so `AT TIME ZONE 'UTC'` converts it to a
-- timestamptz, and `to_char` on a timestamptz renders in the session's
-- `TimeZone` setting, not UTC. Neon's session default happens to be UTC, so the
-- two forms agree here today, but that makes the result depend on session
-- config rather than on the data. The plain `to_char("fireAt", ...)` reads the
-- stored UTC timestamp's fields directly and cannot be shifted by the session
-- timezone, so it is used instead.
ALTER TABLE "Reminder" ADD COLUMN "date" TEXT;
UPDATE "Reminder" SET "date" = to_char("fireAt", 'YYYY-MM-DD');
DELETE FROM "Reminder" WHERE "targetType" = 'COST_DUE';
ALTER TABLE "Reminder" ALTER COLUMN "date" SET NOT NULL;
ALTER TABLE "Reminder" DROP COLUMN "fireAt";
ALTER TABLE "Reminder" DROP COLUMN "sent";
ALTER TABLE "Reminder" DROP COLUMN "targetType";
ALTER TABLE "Reminder" DROP COLUMN "targetId";
CREATE INDEX "Reminder_date_idx" ON "Reminder"("date");

-- The device's own timezone decides its Digest hour and what "today" means.
ALTER TABLE "PushSubscription" ADD COLUMN "timezone" TEXT;

-- Alarms published into the feed for the calendar app to fire.
ALTER TABLE "CalendarFeed" ADD COLUMN "alarmTransport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CalendarFeed" ADD COLUMN "alarmCheckOut" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "DigestPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DigestPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DigestPreference_userId_tripId_key" ON "DigestPreference"("userId", "tripId");
CREATE INDEX "DigestPreference_tripId_idx" ON "DigestPreference"("tripId");
ALTER TABLE "DigestPreference" ADD CONSTRAINT "DigestPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigestPreference" ADD CONSTRAINT "DigestPreference_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DigestDispatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigestDispatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DigestDispatch_userId_tripId_localDate_slot_key" ON "DigestDispatch"("userId", "tripId", "localDate", "slot");
CREATE INDEX "DigestDispatch_tripId_idx" ON "DigestDispatch"("tripId");
ALTER TABLE "DigestDispatch" ADD CONSTRAINT "DigestDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigestDispatch" ADD CONSTRAINT "DigestDispatch_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
