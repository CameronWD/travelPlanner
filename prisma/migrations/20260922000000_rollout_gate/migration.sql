-- ROLLOUT GATE — read docs/DEPLOY.md §4b before deploying this.
--
-- WRITE-PATH ANALYSIS (§4b requires this for every migration):
--
-- 1. AllowedEmail / AccessRequest / ErrorReport / DeletedBlob are NEW tables.
--    The currently-deployed build never reads or writes them. No hazard.
--
-- 2. Invite.expiresAt / GlobeInvite.expiresAt are NULLABLE additive columns.
--    The old build's INSERTs omit them; NULL is legal. No hazard.
--
-- 3. JournalEntry's unique key changes from (tripId, date) to
--    (tripId, date, authorId). THIS IS A WRITE-PATH CHANGE AND IT DOES OPEN
--    THE §4b WINDOW — it is the exact shape documented at DEPLOY.md:131. The
--    deployed build's saveJournalEntry compiles to
--    INSERT ... ON CONFLICT (tripId, date), which requires the index we drop
--    here. For the length of the Vercel build, journal saves on the OLD build
--    will fail. An empty table does not help: the failure is a missing
--    ON CONFLICT target, not a row collision.
--
--    DEPLOY.md:140 prescribes two deploys for this shape. We are deliberately
--    taking ONE, decided 2026-09-22. Justification: this branch ships BEFORE
--    TEEPEE opens to additional Travellers, so the only people who can be
--    mid-save are the operator and one co-Traveller, and the operator chooses
--    the moment. MITIGATION: deploy at a quiet moment, watch the build to
--    completion, and do not write a Journal entry while it runs.
--
-- 4. AllowedEmail is BACKFILLED from existing Users. Without this, the instant
--    the signIn callback ships nobody can sign in — including the operator —
--    unless ALLOWED_EMAILS was set first. Everyone who already holds an
--    account is by definition already admitted; the allowlist must reflect
--    that at the moment it starts being enforced rather than start empty.
--
-- 5. Invite.expiresAt is backfilled to NOW() + 30 days, NOT createdAt + 30.
--    Backfilling from createdAt would mark every pending Invite older than 30
--    days as already expired at the instant of deploy, silently revoking a
--    live invitation someone is still waiting on. Same reasoning applies to
--    GlobeInvite.expiresAt.
--
-- 6. gen_random_uuid() is used below for the AllowedEmail backfill's id
--    column. It has been built into Postgres core (no extension required)
--    since Postgres 13; no migration in this repo enables `pgcrypto` and none
--    is needed for this call. Not independently confirmed against the live
--    Neon instance's Postgres version — see migration author's report.
--
--    DROP INDEX below targets "JournalEntry_tripId_date_key" — confirmed
--    against prisma/migrations/0_init/migration.sql:453, which is the
--    migration that actually created it, rather than assumed from Prisma's
--    naming convention.

-- CreateTable
CREATE TABLE "AllowedEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AllowedEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AllowedEmail_email_key" ON "AllowedEmail"("email");

CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessRequest_email_key" ON "AccessRequest"("email");
CREATE INDEX "AccessRequest_status_idx" ON "AccessRequest"("status");

CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "route" TEXT,
    "source" TEXT NOT NULL DEFAULT 'server',
    "userId" TEXT,
    "digest" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErrorReport_signature_key" ON "ErrorReport"("signature");
CREATE INDEX "ErrorReport_lastSeen_idx" ON "ErrorReport"("lastSeen");

CREATE TABLE "DeletedBlob" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletedBlob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeletedBlob_storageKey_key" ON "DeletedBlob"("storageKey");
CREATE INDEX "DeletedBlob_deletedAt_idx" ON "DeletedBlob"("deletedAt");

-- AlterTable (additive, nullable — no hazard)
ALTER TABLE "Invite" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "GlobeInvite" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Backfill: every existing account is already admitted.
INSERT INTO "AllowedEmail" ("id", "email", "note", "createdAt")
SELECT gen_random_uuid()::text, LOWER("email"), 'backfilled at rollout-gate migration', NOW()
FROM "User"
WHERE "email" IS NOT NULL
ON CONFLICT ("email") DO NOTHING;

-- Backfill: a fresh 30 days from DEPLOY, never from createdAt.
UPDATE "Invite" SET "expiresAt" = NOW() + INTERVAL '30 days' WHERE "acceptedAt" IS NULL;
UPDATE "GlobeInvite" SET "expiresAt" = NOW() + INTERVAL '30 days' WHERE "acceptedAt" IS NULL;

-- Journal becomes per-Traveller. SEE ANALYSIS NOTE 3 — this is the §4b window.
DROP INDEX "JournalEntry_tripId_date_key";
CREATE UNIQUE INDEX "JournalEntry_tripId_date_authorId_key"
    ON "JournalEntry"("tripId", "date", "authorId");
