-- Reminders become dated notes (ADR 0047): no firing instant, no sent flag, no
-- target reference. The COST_DUE marker rows they also held are retired —
-- idempotency moves to DigestDispatch. Production held zero Reminder rows when
-- this was written (verified before deploy); the DELETE makes the NOT NULL
-- column addition safe regardless.
DELETE FROM "Reminder";
ALTER TABLE "Reminder" DROP COLUMN "fireAt";
ALTER TABLE "Reminder" DROP COLUMN "sent";
ALTER TABLE "Reminder" DROP COLUMN "targetType";
ALTER TABLE "Reminder" DROP COLUMN "targetId";
ALTER TABLE "Reminder" ADD COLUMN "date" TEXT NOT NULL;
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
