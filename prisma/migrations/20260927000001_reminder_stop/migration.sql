-- Additive on both paths (docs/DEPLOY.md §4b): nullable column, no backfill —
-- NULL means "about the Trip as a whole", which every existing Reminder is.
ALTER TABLE "Reminder" ADD COLUMN "stopId" TEXT;
CREATE INDEX "Reminder_stopId_idx" ON "Reminder"("stopId");
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
