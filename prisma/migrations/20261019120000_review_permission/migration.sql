-- Spec 2026-10-17 R12: per-account Review permission, OFF by default.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reviewPermission" TEXT NOT NULL DEFAULT 'OFF';

-- "Unlimited (Cam and Xanni for now)". Only Cam's personal account,
-- cammark.williams@gmail.com (prisma/real/persist.ts REAL_USER), and Xanni's,
-- xanni99.m@hotmail.com (prisma/real/persist.ts REAL_PARTNER_EMAIL), are
-- granted. Cam's work address (cameron.williams@hismileteeth.com) stays Off —
-- Cam's ruling, 2026-10-18: his personal account, not his work one.
-- User.email is never normalised, so the match trims and lowercases. An address
-- with no account updates nothing. Data only, and idempotent.
-- review-permission-grant:begin
UPDATE "User" SET "reviewPermission" = 'UNLIMITED'
WHERE lower(btrim("email")) IN ('cammark.williams@gmail.com', 'xanni99.m@hotmail.com');
-- review-permission-grant:end
