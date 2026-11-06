-- Spec 2026-11-06-google-extras, Branch 5 (closed venues): when an Item's
-- businessStatus was last read from Google. Additive, nullable, no backfill.
ALTER TABLE "Item" ADD COLUMN "statusCheckedAt" TIMESTAMP(3);
