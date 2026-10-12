-- Surprise (CONTEXT.md, spec 2026-10-12-tc-12): a Stop or Item one Traveller
-- plans that the named Travellers may not see inside. Additive and nullable;
-- a rolled-back build ignores the columns.
ALTER TABLE "Stop" ADD COLUMN "surprisePlannerId" TEXT;
ALTER TABLE "Stop" ADD COLUMN "surpriseForIds" TEXT;
ALTER TABLE "Stop" ADD COLUMN "surpriseRevealedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "surprisePlannerId" TEXT;
ALTER TABLE "Item" ADD COLUMN "surpriseForIds" TEXT;
ALTER TABLE "Item" ADD COLUMN "surpriseRevealedAt" TIMESTAMP(3);
ALTER TABLE "Activity" ADD COLUMN "surpriseOfType" TEXT;
ALTER TABLE "Activity" ADD COLUMN "surpriseOfId" TEXT;
CREATE INDEX "Activity_tripId_surpriseOfId_idx" ON "Activity"("tripId", "surpriseOfId");
