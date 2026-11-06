-- Spec 2026-11-06-google-extras, Branch 2 (Public holidays): the HolidayFeed cache
-- of Google's public holiday iCal feeds. Additive new table, no backfill.
-- CreateTable
CREATE TABLE "HolidayFeed" (
    "countryCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "holidays" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayFeed_pkey" PRIMARY KEY ("countryCode")
);
