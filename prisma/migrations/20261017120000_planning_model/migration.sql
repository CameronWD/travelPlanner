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
-- Only automatic rows (bookingStateSet = false) are touched, so this is
-- idempotent; test/integration/migration-planning-model.test.ts runs exactly
-- the statements between the markers.
-- planning-model:backfill:begin
UPDATE "Transport" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("reference"), '') IS NOT NULL;
UPDATE "Accommodation" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("confirmation"), '') IS NOT NULL;
UPDATE "Item" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("booking"), '') IS NOT NULL;
-- planning-model:backfill:end
