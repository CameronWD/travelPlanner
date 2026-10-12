import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// Real Postgres (npm run test:integration). Proving the migration's
// INSERT...SELECT actually copies a pre-existing Account row into AuthAccount
// would require running `prisma migrate deploy` against a database that had
// the Account row BEFORE migrating — CI doesn't have that (it migrates a
// fresh database). So instead this test is honest about what it can prove
// here-and-now: (1) the migration SQL on disk contains the INSERT...SELECT
// with the column names the real "Account"/"AuthAccount" tables use, and (2)
// a minimal AuthAccount row round-trips through the real database, proving
// the AuthAccount table shape the migration created is usable.
const USER = "it-better-auth-migration-user";

describe.skipIf(process.env.INTEGRATION !== "1")("Better Auth migration (ADR 0071)", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: USER },
      update: {},
      create: { id: USER, email: "better-auth-migration@example.test", name: "Migration IT" },
    });
  });

  afterAll(async () => {
    await db.authAccount.deleteMany({ where: { userId: USER } });
    await db.user.deleteMany({ where: { id: USER } });
  });

  it("the migration's SQL copies Google Account rows into AuthAccount by the real column names", () => {
    const sql = readFileSync(
      "prisma/migrations/20261012120000_better_auth/migration.sql",
      "utf8",
    );
    expect(sql).toMatch(
      /INSERT INTO "AuthAccount" \("id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "scope", "createdAt", "updatedAt"\)/,
    );
    expect(sql).toMatch(
      /SELECT "id", "providerAccountId", "provider", "userId", "access_token", "refresh_token", "id_token", "scope", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP/,
    );
    expect(sql).toMatch(/FROM "Account" WHERE "provider" = 'google'/);
  });

  it("marks Users with a Google link verified, after the copy, so a link sign-in does not strip that link", () => {
    const sql = readFileSync(
      "prisma/migrations/20261012120000_better_auth/migration.sql",
      "utf8",
    );
    const update =
      `UPDATE "User" SET "isEmailVerified" = true WHERE "id" IN (SELECT "userId" FROM "AuthAccount" WHERE "providerId" = 'google');`;
    expect(sql).toContain(update);
    expect(sql.indexOf(update)).toBeGreaterThan(sql.indexOf('INSERT INTO "AuthAccount"'));
  });

  it("leaves Auth.js's emailVerified exactly as it was, so a rolled-back build still reads User rows (ADR 0071 §6)", async () => {
    const sql = readFileSync(
      "prisma/migrations/20261012120000_better_auth/migration.sql",
      "utf8",
    );
    expect(sql).not.toMatch(/RENAME COLUMN "emailVerified"/);
    expect(sql).not.toMatch(/(DROP|ALTER) COLUMN "emailVerified"/);
    expect(sql).toContain(`ALTER TABLE "User" ADD COLUMN "isEmailVerified" BOOLEAN NOT NULL DEFAULT false;`);
    expect(sql).toContain(`UPDATE "User" SET "isEmailVerified" = true WHERE "emailVerified" IS NOT NULL;`);

    const cols = await db.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'User' AND column_name IN ('emailVerified', 'isEmailVerified', 'emailVerifiedAt')
      ORDER BY column_name`;
    expect(cols).toEqual([
      { column_name: "emailVerified", data_type: "timestamp without time zone" },
      { column_name: "isEmailVerified", data_type: "boolean" },
    ]);
  });

  it("db.authAccount.create round-trips a minimal row against the real Postgres table", async () => {
    const created = await db.authAccount.create({
      data: {
        id: "it-better-auth-migration-account",
        accountId: "google-sub-123",
        providerId: "google",
        userId: USER,
      },
    });
    expect(created.providerId).toBe("google");
    expect(created.accountId).toBe("google-sub-123");

    const found = await db.authAccount.findFirst({ where: { userId: USER } });
    expect(found?.providerId).toBe("google");
    expect(found?.accountId).toBe("google-sub-123");
  });
});
