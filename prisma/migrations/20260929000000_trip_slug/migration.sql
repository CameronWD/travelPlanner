-- Trip URL slugs (ADR 0064).
--
-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- "slug" is nullable, so the still-running old build — whose trip INSERT does
-- not write it — cannot violate a NOT NULL constraint during the migrate-then-
-- build window. TripSlug is a new table the old build never touches. Nothing
-- is renamed, dropped, or newly constrained on an existing column. A Trip the
-- old build creates in that window has a NULL slug; links fall back to its id
-- (lib/trip-path.ts) until it is next renamed. Tightening to NOT NULL is a
-- separate, later migration.
--
-- Backfill: one slug per existing Trip, oldest first, with the same shape as
-- lib/trip-slug.ts (accents via translate(), so a character NFD does not
-- decompose — ø, ß — may differ from what a rename would derive; a backfilled
-- slug only has to be valid and unique). A PL/pgSQL loop, not a window
-- function, so a clash with a natural "-2" name can never abort the migration.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "slug" TEXT;

-- CreateTable
CREATE TABLE "TripSlug" (
    "slug" TEXT NOT NULL,
    "tripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripSlug_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "TripSlug_tripId_idx" ON "TripSlug"("tripId");

-- AddForeignKey
ALTER TABLE "TripSlug" ADD CONSTRAINT "TripSlug_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN SELECT "id", "name" FROM "Trip" ORDER BY "createdAt", "id" LOOP
    base := lower(translate(r."name",
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿÑñÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuYyyNnCc'));
    base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
    base := trim(both '-' from base);
    base := trim(trailing '-' from left(base, 60));
    IF base = '' THEN base := 'trip'; END IF;
    candidate := base;
    n := 1;
    WHILE candidate = 'new' OR EXISTS (SELECT 1 FROM "TripSlug" WHERE "slug" = candidate) LOOP
      n := n + 1;
      candidate := trim(trailing '-' from left(base, 60 - length(n::text) - 1)) || '-' || n::text;
    END LOOP;
    INSERT INTO "TripSlug" ("slug", "tripId") VALUES (candidate, r."id");
    UPDATE "Trip" SET "slug" = candidate WHERE "id" = r."id";
  END LOOP;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");
