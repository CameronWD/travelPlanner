-- Feedback notes: remarks about the app itself (ADR 0040). Inert product data —
-- no feature reads it; it exists to be exported to docs/feedback/inbox.md.
CREATE TABLE "FeedbackNote" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "pageLabel" TEXT NOT NULL,
    "tripId" TEXT,
    "tripName" TEXT,
    "viewport" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "authoredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedbackNote_clientKey_key" ON "FeedbackNote"("clientKey");
CREATE INDEX "FeedbackNote_status_authoredAt_idx" ON "FeedbackNote"("status", "authoredAt");
CREATE INDEX "FeedbackNote_authorId_idx" ON "FeedbackNote"("authorId");

ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
