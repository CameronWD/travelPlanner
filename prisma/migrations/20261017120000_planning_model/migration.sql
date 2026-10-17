-- Spec 2026-10-17 R2–R4: Booking state (+ book-by) on Transport,
-- Accommodation and Item; Slot time and Opening hours on Item.

-- AlterTable
ALTER TABLE "Transport" ADD COLUMN     "bookBy" TEXT,
ADD COLUMN     "bookingState" TEXT NOT NULL DEFAULT 'TO_BOOK',
ADD COLUMN     "bookingStateSet" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Accommodation" ADD COLUMN     "bookBy" TEXT,
ADD COLUMN     "bookingState" TEXT NOT NULL DEFAULT 'TO_BOOK',
ADD COLUMN     "bookingStateSet" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "arriveByMinutes" INTEGER,
ADD COLUMN     "bookBy" TEXT,
ADD COLUMN     "bookingState" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "bookingStateSet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "refundable" BOOLEAN,
ADD COLUMN     "slotTime" TEXT;

-- Hand-written backfill. The defaults above already make every existing row
-- right when it has no reference (Transport/Accommodation To book, Item No
-- booking needed). A row WITH a reference is Booked (CONTEXT.md "Booking
-- state"). A whitespace-only reference counts as none (old writes stored "").
-- Day one: a leg already departed, or a stay already checked into (tonight's
-- hotel included), is Booked and held there (bookingStateSet = true), so the
-- past does not read "To book". depAt is stored as UTC without a zone, so
-- it is compared against now() in UTC. checkIn is a Stop-local "YYYY-MM-DD"
-- string, compared as text against the date at UTC+14 (the latest local
-- date anywhere), so a stay checking in today in any timezone counts. Items are unaffected (their
-- default is already No booking needed).
-- Only automatic rows (bookingStateSet = false) are touched, so this is
-- idempotent; test/integration/migration-planning-model.test.ts runs exactly
-- the statements between the markers.
-- planning-model:backfill:begin
UPDATE "Transport" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("reference"), '') IS NOT NULL;
UPDATE "Accommodation" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("confirmation"), '') IS NOT NULL;
UPDATE "Item" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("booking"), '') IS NOT NULL;
UPDATE "Transport" SET "bookingState" = 'BOOKED', "bookingStateSet" = true WHERE "bookingStateSet" = false AND "depAt" < (now() AT TIME ZONE 'UTC');
UPDATE "Accommodation" SET "bookingState" = 'BOOKED', "bookingStateSet" = true WHERE "bookingStateSet" = false AND "checkIn" <= to_char((now() AT TIME ZONE 'UTC') + interval '14 hours', 'YYYY-MM-DD');
-- planning-model:backfill:end
