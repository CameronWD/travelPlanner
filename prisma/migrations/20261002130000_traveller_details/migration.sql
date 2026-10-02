-- Traveller details (spec 2026-10-02 §E; CONTEXT.md "Traveller details").
-- Additive on every path: a new table nobody reads until the new build, a
-- nullable TripMember column, and a defaulted ShareLink dial that is off
-- on every existing link — so the still-running old build cannot violate
-- anything during the migrate-then-build window.

-- CreateTable
CREATE TABLE "TravellerDetails" (
    "userId" TEXT NOT NULL,
    "mobile" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "bankDetails" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravellerDetails_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "TravellerDetails" ADD CONSTRAINT "TravellerDetails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TripMember" ADD COLUMN "travelNumber" TEXT;

-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN "includeContacts" BOOLEAN NOT NULL DEFAULT false;
