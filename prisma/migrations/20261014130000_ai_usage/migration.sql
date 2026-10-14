-- Booking import spend log (spec 2026-10-14-booking-import, "Spend").
--
-- WRITE-PATH ANALYSIS (DEPLOY.md §4b): AiUsage is a NEW table. The deployed
-- build never reads or writes it. No hazard; one deploy.

CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicroUsd" INTEGER,
    "proposalCount" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");
CREATE INDEX "AiUsage_tripId_idx" ON "AiUsage"("tripId");
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
