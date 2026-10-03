-- Shopping list (spec 2026-10-02 §G, CONTEXT.md "Shopping list"): a Packing item
-- may carry a buy state. Nullable and unread by the running build.
ALTER TABLE "ChecklistItem" ADD COLUMN "buy" TEXT;
