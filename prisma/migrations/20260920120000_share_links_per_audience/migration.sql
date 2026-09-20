-- Many scoped share links per trip (ADR 0051).
-- Grandfather: every existing link becomes a full-scope link labelled
-- 'Shared link', keeping its token — holders of an old URL see exactly
-- what they saw before, no more and no less.

ALTER TABLE "ShareLink" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'Shared link';
ALTER TABLE "ShareLink" ALTER COLUMN "label" DROP DEFAULT;

ALTER TABLE "ShareLink" ADD COLUMN "includeAccommodation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShareLink" ADD COLUMN "includeTransport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShareLink" ADD COLUMN "includeDailyPlans" BOOLEAN NOT NULL DEFAULT true;

-- One trip, many links: the unique constraint becomes a plain lookup index.
DROP INDEX "ShareLink_tripId_key";
CREATE INDEX "ShareLink_tripId_idx" ON "ShareLink"("tripId");
