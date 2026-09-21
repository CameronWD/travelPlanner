-- AlterTable
ALTER TABLE "CronHeartbeat" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);

-- Grandfather the existing heartbeat: its lastRunAt is a run that, as far as
-- anything here knows, dispatched fine — the row only exists because runs were
-- completing. Without this every deploy of this change would render a false
-- "no Digest has ever been sent" warning on Account until the next successful
-- cron run, up to ~10 hours later. Same shape as the ShareLink label backfill.
UPDATE "CronHeartbeat" SET "lastSuccessAt" = "lastRunAt" WHERE "lastSuccessAt" IS NULL;
