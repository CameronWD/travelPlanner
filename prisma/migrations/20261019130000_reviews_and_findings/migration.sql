-- Spec 2026-10-17 R8, R10: a Review (one saved run) and its Findings.
--
-- WRITE-PATH ANALYSIS (DEPLOY.md §4b): Review and Finding are NEW tables.
-- The deployed build never reads or writes them. No hazard; one deploy.

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "startedById" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summary" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "aiUsageId" TEXT,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "date" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "suggestedFix" TEXT,
    "source" TEXT,
    "origin" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "stateById" TEXT,
    "stateAt" TIMESTAMP(3),
    "undoPayload" TEXT,
    "previousId" TEXT,
    "firstFoundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_tripId_startedAt_idx" ON "Review"("tripId", "startedAt");

-- CreateIndex
CREATE INDEX "Review_tripId_status_idx" ON "Review"("tripId", "status");

-- CreateIndex
CREATE INDEX "Review_startedById_startedAt_idx" ON "Review"("startedById", "startedAt");

-- CreateIndex
CREATE INDEX "Finding_reviewId_idx" ON "Finding"("reviewId");

-- CreateIndex
CREATE INDEX "Finding_tripId_state_idx" ON "Finding"("tripId", "state");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_stateById_fkey" FOREIGN KEY ("stateById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
