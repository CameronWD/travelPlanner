-- AlterTable
ALTER TABLE "Stop" ADD COLUMN     "forkId" TEXT;

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "forkId" TEXT;

-- AlterTable
ALTER TABLE "Transport" ADD COLUMN     "forkId" TEXT;

-- AlterTable
ALTER TABLE "Accommodation" ADD COLUMN     "forkId" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "forkId" TEXT;

-- AlterTable
ALTER TABLE "Cost" ADD COLUMN     "forkId" TEXT;

-- CreateTable
CREATE TABLE "Fork" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fork_tripId_idx" ON "Fork"("tripId");

-- CreateIndex
CREATE INDEX "Stop_forkId_idx" ON "Stop"("forkId");

-- CreateIndex
CREATE INDEX "Chapter_forkId_idx" ON "Chapter"("forkId");

-- CreateIndex
CREATE INDEX "Transport_forkId_idx" ON "Transport"("forkId");

-- CreateIndex
CREATE INDEX "Accommodation_forkId_idx" ON "Accommodation"("forkId");

-- CreateIndex
CREATE INDEX "Item_forkId_idx" ON "Item"("forkId");

-- CreateIndex
CREATE INDEX "Cost_forkId_idx" ON "Cost"("forkId");

-- AddForeignKey
ALTER TABLE "Fork" ADD CONSTRAINT "Fork_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fork" ADD CONSTRAINT "Fork_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_forkId_fkey" FOREIGN KEY ("forkId") REFERENCES "Fork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_forkId_fkey" FOREIGN KEY ("forkId") REFERENCES "Fork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transport" ADD CONSTRAINT "Transport_forkId_fkey" FOREIGN KEY ("forkId") REFERENCES "Fork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_forkId_fkey" FOREIGN KEY ("forkId") REFERENCES "Fork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_forkId_fkey" FOREIGN KEY ("forkId") REFERENCES "Fork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_forkId_fkey" FOREIGN KEY ("forkId") REFERENCES "Fork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

