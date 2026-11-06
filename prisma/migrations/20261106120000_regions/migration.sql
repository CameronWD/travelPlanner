-- Spec 2026-11-06-google-extras, Branch 2 (Public holidays): the Region (English
-- name of Google's administrative_area_level_1) on a Stop and the Home base, and
-- the country and Region of each Transport end. Additive, nullable, no backfill
-- — one deploy (old code ignores the new columns, so schema and code can ship together).
-- AlterTable
ALTER TABLE "Stop" ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "homeRegion" TEXT;

-- AlterTable
ALTER TABLE "Transport" ADD COLUMN     "depCountryCode" TEXT,
ADD COLUMN     "arrCountryCode" TEXT,
ADD COLUMN     "depRegion" TEXT,
ADD COLUMN     "arrRegion" TEXT;
