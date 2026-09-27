-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- DayTitle is a brand-new table with no existing rows and nothing else reads
-- or writes it yet, so the still-running old build cannot violate a
-- constraint it never touches and its own reads/writes are unaffected.
-- Nothing existing is renamed, dropped, or newly constrained.
--
-- No backfill — there is nothing to backfill into a table nobody wrote to
-- before this deploy. Every Stop simply has zero DayTitle rows until a
-- Traveller sets one (CONTEXT.md "Day title").

-- CreateTable
CREATE TABLE "DayTitle" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DayTitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayTitle_stopId_dayIndex_key" ON "DayTitle"("stopId", "dayIndex");

-- AddForeignKey
ALTER TABLE "DayTitle" ADD CONSTRAINT "DayTitle_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
