-- Derived country on Items so Day ideas can country-match wishlist ideas to
-- the current Stop (CONTEXT.md "Day ideas", ADR 0044). Nullable; backfilled
-- lazily by scripts/backfill-geocode.ts for located rows.
ALTER TABLE "Item" ADD COLUMN "countryCode" TEXT;
