-- AlterTable
ALTER TABLE "Transport" ADD COLUMN     "anchorStopId" TEXT;

-- CreateIndex
CREATE INDEX "Transport_anchorStopId_idx" ON "Transport"("anchorStopId");

-- AddForeignKey
ALTER TABLE "Transport" ADD CONSTRAINT "Transport_anchorStopId_fkey" FOREIGN KEY ("anchorStopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: anchor existing legs to their departure stop where known.
UPDATE "Transport" SET "anchorStopId" = "fromStopId" WHERE "fromStopId" IS NOT NULL;
