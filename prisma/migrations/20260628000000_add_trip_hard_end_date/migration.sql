-- Optional, traveller-set ceiling date. Nullable, no default (existing trips have none).
ALTER TABLE "Trip" ADD COLUMN "hardEndDate" TEXT;
