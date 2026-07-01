-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "sourceItemId" TEXT;

-- CreateIndex
CREATE INDEX "Item_sourceItemId_idx" ON "Item"("sourceItemId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

