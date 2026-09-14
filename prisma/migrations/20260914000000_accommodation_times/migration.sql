-- Optional check-in/check-out times: a timed check-in/out sits in the day's
-- Timeline at its time like a timed Item; untimed ones keep a fixed reading
-- order (CONTEXT.md "Accommodation"). Nullable, no backfill needed.
ALTER TABLE "Accommodation" ADD COLUMN "checkInTime" TEXT;
ALTER TABLE "Accommodation" ADD COLUMN "checkOutTime" TEXT;
