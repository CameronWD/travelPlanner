-- Small cover copy (spec 2026-10-06 §H): a ~480px WebP beside the 2048px
-- cover, served to frames under 600 CSS px. Nullable and unread by the
-- running build; existing covers fall back to the large copy.
ALTER TABLE "Trip" ADD COLUMN "coverSmallKey" TEXT;
