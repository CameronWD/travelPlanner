-- Attachment title (spec 2026-10-02 §C; CONTEXT.md "Attachment"). Additive
-- and nullable, so the still-running old build — which never writes it —
-- cannot violate anything during the migrate-then-build window.

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "title" TEXT;
