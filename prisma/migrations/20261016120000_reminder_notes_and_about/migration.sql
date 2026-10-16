-- Spec 2026-10-16 F8: a Reminder carries optional notes and may be about one
-- Item or one Transport leg as well as one Stop — never several.

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "transportId" TEXT;

-- CreateIndex
CREATE INDEX "Reminder_itemId_idx" ON "Reminder"("itemId");

-- CreateIndex
CREATE INDEX "Reminder_transportId_idx" ON "Reminder"("transportId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "Transport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written (Prisma's schema language has no CHECK): at most one of the
-- three "about" columns is set. Every existing row has at most stopId set, so
-- this validates without a backfill.
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_about_one_thing_check"
  CHECK (num_nonnulls("stopId", "itemId", "transportId") <= 1);
