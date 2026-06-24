-- Stop: allow rough (date-less) stops + explicit membership + pinning
ALTER TABLE "Stop" ALTER COLUMN "arriveDate" DROP NOT NULL;
ALTER TABLE "Stop" ALTER COLUMN "departDate" DROP NOT NULL;
ALTER TABLE "Stop" ALTER COLUMN "timezone" DROP NOT NULL;
ALTER TABLE "Stop" ADD COLUMN "nights" INTEGER;
ALTER TABLE "Stop" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Stop" ADD COLUMN "chapterId" TEXT;
ALTER TABLE "Stop" ADD COLUMN "chapterSortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Stop_chapterId_idx" ON "Stop"("chapterId");
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Chapter: allow rough (date-less) chapters
ALTER TABLE "Chapter" ALTER COLUMN "startDate" DROP NOT NULL;
ALTER TABLE "Chapter" ALTER COLUMN "endDate" DROP NOT NULL;

-- Trip: allow date-less trips
ALTER TABLE "Trip" ALTER COLUMN "startDate" DROP NOT NULL;
ALTER TABLE "Trip" ALTER COLUMN "endDate" DROP NOT NULL;
