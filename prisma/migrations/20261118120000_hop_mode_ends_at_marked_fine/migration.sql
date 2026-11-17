-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "endAddress" TEXT,
ADD COLUMN     "endLat" DOUBLE PRECISION,
ADD COLUMN     "endLng" DOUBLE PRECISION,
ADD COLUMN     "endPlaceId" TEXT;

-- CreateTable
CREATE TABLE "HopMode" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fromItemId" TEXT NOT NULL,
    "toItemId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "setById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HopMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlagDismissal" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "markedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlagDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HopMode_tripId_idx" ON "HopMode"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "HopMode_fromItemId_toItemId_key" ON "HopMode"("fromItemId", "toItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FlagDismissal_tripId_flagId_key" ON "FlagDismissal"("tripId", "flagId");

-- AddForeignKey
ALTER TABLE "HopMode" ADD CONSTRAINT "HopMode_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HopMode" ADD CONSTRAINT "HopMode_fromItemId_fkey" FOREIGN KEY ("fromItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HopMode" ADD CONSTRAINT "HopMode_toItemId_fkey" FOREIGN KEY ("toItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HopMode" ADD CONSTRAINT "HopMode_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlagDismissal" ADD CONSTRAINT "FlagDismissal_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlagDismissal" ADD CONSTRAINT "FlagDismissal_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

