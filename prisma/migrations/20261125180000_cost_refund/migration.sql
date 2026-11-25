-- Spec 2026-11-25-refunds: a paid Cost can hold one Refund.
-- Additive, nullable, no backfill — one deploy (old code ignores the new columns).
-- AlterTable
ALTER TABLE "Cost" ADD COLUMN     "refundMinor" INTEGER,
ADD COLUMN     "refundedAt" TIMESTAMP(3);
