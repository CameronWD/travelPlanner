-- Spec 2026-10-30-google-maps, Branch 3 (Travel times): Stop.localTravelMode and
-- the TravelTime cache of Google Routes results. Additive, nullable, no backfill
-- — one deploy (DEPLOY §4b write-path note: old code ignores the new column and
-- table, so schema and code can ship together).
-- AlterTable
ALTER TABLE "Stop" ADD COLUMN     "localTravelMode" TEXT;

-- CreateTable
CREATE TABLE "TravelTime" (
    "key" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "minutes" INTEGER,
    "distanceM" INTEGER,
    "polyline" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelTime_pkey" PRIMARY KEY ("key")
);
