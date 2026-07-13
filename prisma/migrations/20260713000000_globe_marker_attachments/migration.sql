-- AlterTable
ALTER TABLE "Attachment" ALTER COLUMN "tripId" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN     "globeId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_globeId_idx" ON "Attachment"("globeId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_globeId_fkey" FOREIGN KEY ("globeId") REFERENCES "Globe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
