-- Spec 2026-11-26-paid-currency: a Cost's paid amount (and its Refund) can be in the Trip's Home currency.
-- Additive, nullable, no backfill: null = the Cost's own currency, which is every existing Cost.
-- AlterTable
ALTER TABLE "Cost" ADD COLUMN "paidCurrency" TEXT;
