-- Rename the two Cost amounts to match the domain language (ADR 0037).
-- "estimated" implied a guess, but the field is required and holds the real
-- price for anything already booked.
ALTER TABLE "Cost" RENAME COLUMN "estimatedMinor" TO "costMinor";
ALTER TABLE "Cost" RENAME COLUMN "actualMinor" TO "paidMinor";

-- Backfill: rows marked paid with no amount recorded were displaying as
-- "Paid £0 · £X under estimate". Assume they were paid at their cost amount.
UPDATE "Cost"
SET "paidMinor" = "costMinor"
WHERE "paidAt" IS NOT NULL
  AND "paidMinor" IS NULL;
