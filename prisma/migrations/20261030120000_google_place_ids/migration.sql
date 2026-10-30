-- Spec 2026-10-30-google-maps, Branch 2 (Places): Google place IDs on every
-- place-bearing row, Item.businessStatus, and the GoogleUsage per-day counter.
-- Additive, nullable, no backfill here — one deploy (DEPLOY §4b write-path
-- note: old code ignores the new columns, so schema and code can ship together).
-- AlterTable
ALTER TABLE "Accommodation" ADD COLUMN     "placeId" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "businessStatus" TEXT,
ADD COLUMN     "placeId" TEXT;

-- AlterTable
ALTER TABLE "Marker" ADD COLUMN     "placeId" TEXT;

-- AlterTable
ALTER TABLE "Stop" ADD COLUMN     "placeId" TEXT;

-- AlterTable
ALTER TABLE "Transport" ADD COLUMN     "arrPlaceId" TEXT,
ADD COLUMN     "depPlaceId" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "homePlaceId" TEXT;

-- CreateTable
CREATE TABLE "GoogleUsage" (
    "day" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GoogleUsage_pkey" PRIMARY KEY ("day","sku")
);

