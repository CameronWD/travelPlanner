-- Recently deleted (ADR 0067, CONTEXT.md): a deleted Trip is stamped, not
-- destroyed, and purged 30 days later. Additive and nullable: the running
-- build never writes it and reads every Trip as live, which is exactly the
-- state every row is in until the new build's deleteTrip runs.
ALTER TABLE "Trip" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Trip_deletedAt_idx" ON "Trip"("deletedAt");
