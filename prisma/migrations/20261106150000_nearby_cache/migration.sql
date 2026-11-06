-- Spec 2026-11-06-google-extras, Branch 4 (What's around): the per-day cache of
-- Places Nearby Search results, keyed by UTC day, kind and a ~100 m grid cell.
-- Additive new table, no backfill.
-- CreateTable
CREATE TABLE "NearbyCache" (
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NearbyCache_pkey" PRIMARY KEY ("key")
);
