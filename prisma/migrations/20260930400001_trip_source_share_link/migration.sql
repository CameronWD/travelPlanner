-- Route copy attribution (CONTEXT.md "Route copy"). Deliberately no foreign
-- key: revoking a Share link deletes its row, and the copied Trip must keep
-- the attribution anyway.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "sourceShareLinkId" TEXT;
