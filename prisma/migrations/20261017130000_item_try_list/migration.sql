-- Spec 2026-10-17 R6: the Try list on an Item (JSON text; null = no list).

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "tryList" TEXT;
