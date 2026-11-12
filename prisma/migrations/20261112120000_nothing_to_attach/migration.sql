-- Spec 2026-11-12-booking-confirmations: a Booked Transport, Accommodation or
-- Item with no attachment is nudged to attach its Booking confirmation unless
-- the Traveller says there is nothing to attach. Additive, no backfill: every
-- existing row stays false.
ALTER TABLE "Transport" ADD COLUMN "nothingToAttach" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Accommodation" ADD COLUMN "nothingToAttach" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Item" ADD COLUMN "nothingToAttach" BOOLEAN NOT NULL DEFAULT false;
