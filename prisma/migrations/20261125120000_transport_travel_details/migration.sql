-- Spec 2026-11-25-travel-row-and-details: seven optional Travel details on a
-- Transport. Additive, nullable, no backfill — one deploy (old code ignores the new columns).
-- AlterTable
ALTER TABLE "Transport" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "serviceNumber" TEXT,
ADD COLUMN     "seat" TEXT,
ADD COLUMN     "terminal" TEXT,
ADD COLUMN     "gate" TEXT,
ADD COLUMN     "coach" TEXT,
ADD COLUMN     "platform" TEXT;
