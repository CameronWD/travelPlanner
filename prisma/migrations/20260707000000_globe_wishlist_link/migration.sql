-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "sourceMarkerId" TEXT;

-- AlterTable
ALTER TABLE "Stop" ADD COLUMN     "countryCode" TEXT;

-- CreateIndex
CREATE INDEX "Item_sourceMarkerId_idx" ON "Item"("sourceMarkerId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_sourceMarkerId_fkey" FOREIGN KEY ("sourceMarkerId") REFERENCES "Marker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
