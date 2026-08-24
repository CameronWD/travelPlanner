-- Chapters become opt-in per Trip: off by default for new trips; existing
-- trips that already built chapters keep them on.
ALTER TABLE "Trip" ADD COLUMN "chaptersEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Trip" SET "chaptersEnabled" = true
WHERE "id" IN (SELECT DISTINCT "tripId" FROM "Chapter");
