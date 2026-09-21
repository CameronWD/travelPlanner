-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- authorName is nullable, so the still-running old build — which does not
-- write it — cannot violate a NOT NULL constraint; and dropping a foreign
-- key removes a restriction rather than adding one, so the old build's
-- `author` relation reads keep working (they join on the column, which remains).

-- AlterTable
ALTER TABLE "FeedbackNote" ADD COLUMN "authorName" TEXT;

-- Backfill from the authors who still exist.
UPDATE "FeedbackNote" AS f
SET "authorName" = u."name"
FROM "User" AS u
WHERE f."authorId" = u."id" AND f."authorName" IS NULL;

-- DropForeignKey
ALTER TABLE "FeedbackNote" DROP CONSTRAINT "FeedbackNote_authorId_fkey";
