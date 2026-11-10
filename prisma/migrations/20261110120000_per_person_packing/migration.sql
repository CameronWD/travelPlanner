-- Spec 2026-11-10-per-person-packing: a Packing item is one Traveller's bag
-- (ownerId) or Shared (NULL); packedById records who ticked it; the Trip's
-- packing lists are Open or Private. Additive, no backfill: existing rows stay
-- ownerId NULL (Shared).
ALTER TABLE "ChecklistItem" ADD COLUMN "ownerId" TEXT,
ADD COLUMN "packedById" TEXT;

ALTER TABLE "Trip" ADD COLUMN "packingListsOpen" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "ChecklistItem_tripId_kind_ownerId_idx" ON "ChecklistItem"("tripId", "kind", "ownerId");

ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_packedById_fkey" FOREIGN KEY ("packedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
