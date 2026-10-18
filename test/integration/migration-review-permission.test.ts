import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// Spec 2026-10-17 R12 against the real Postgres: the column exists, every
// account defaults to OFF, and the migration's grant (run here narrowed to this
// test's accounts) makes exactly Cam and Xanni UNLIMITED, matching the email
// case- and space-insensitively (User.email is never normalised).
const MIGRATION = "prisma/migrations/20261019120000_review_permission/migration.sql";
const GRANTED = ["cammark.williams@gmail.com", "xanni99.m@hotmail.com"];
const created: string[] = [];
const ids: Record<string, string> = {};

function grantStatements(narrowTo: string[]): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const begin = sql.indexOf("-- review-permission-grant:begin");
  const end = sql.indexOf("-- review-permission-grant:end");
  if (begin < 0 || end < begin) throw new Error("markers missing");
  const inList = narrowTo.map((id) => `'${id}'`).join(", ");
  return sql
    .slice(begin, end)
    .split(";")
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter(Boolean)
    .map((s) => `${s} AND "id" IN (${inList})`);
}

/** Use the account if the sandbox already has it (unique email), else create it and remember to remove it. */
async function account(email: string, key: string) {
  const existing = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (existing) {
    ids[key] = existing.id;
    return;
  }
  const id = `it-rp-${key}`;
  await db.user.create({ data: { id, email, name: key, isEmailVerified: true } });
  created.push(id);
  ids[key] = id;
}

describe.skipIf(process.env.INTEGRATION !== "1")("User.reviewPermission migration (R12, real Postgres)", () => {
  beforeAll(async () => {
    // A rerun after a failed run starts clean (only this file's ids start "it-rp-").
    await db.user.deleteMany({ where: { id: { startsWith: "it-rp-" } } });
    await account("cammark.williams@gmail.com", "cam");
    // Cam's work address, mixed-case with padding: proves normalising the
    // match does NOT grant an address that isn't in the list (fix round 1).
    await account("  Cameron.Williams@HismileTeeth.com ", "camWork");
    await account("xanni99.m@hotmail.com", "xanni");
    // Xanni's own address, mixed-case with padding: proves normalising the
    // match DOES grant an address that IS in the list, spelled differently
    // (fix round 1).
    await account("  Xanni99.M@Hotmail.com ", "xanniPadded");
    await account("it-rp-friend@example.test", "friend");
    await db.user.updateMany({ where: { id: { in: Object.values(ids) } }, data: { reviewPermission: "OFF" } });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: created } } });
  });

  it("adds User.reviewPermission as non-null text defaulting to OFF", async () => {
    const cols = await db.$queryRaw<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'reviewPermission'`;
    expect(cols).toEqual([{ data_type: "text", is_nullable: "NO", column_default: "'OFF'::text" }]);
  });

  it("an account created without it is OFF", async () => {
    await db.$executeRaw`INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('it-rp-raw', 'it-rp-raw@example.test', now())`;
    created.push("it-rp-raw");
    expect(await db.user.findUniqueOrThrow({ where: { id: "it-rp-raw" }, select: { reviewPermission: true } })).toEqual({ reviewPermission: "OFF" });
  });

  it("grants UNLIMITED to Cam's and Xanni's accounts only, and is idempotent", async () => {
    const narrow = Object.values(ids);
    for (let i = 0; i < 2; i++) for (const s of grantStatements(narrow)) await db.$executeRawUnsafe(s);
    const rows = await db.user.findMany({ where: { id: { in: narrow } }, select: { id: true, reviewPermission: true } });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.reviewPermission]));
    expect(byId[ids.cam]).toBe("UNLIMITED");
    // Cam's work address is NOT granted (global-constraints.md: ONLY
    // cammark.williams@gmail.com and xanni99.m@hotmail.com).
    expect(byId[ids.camWork]).toBe("OFF");
    expect(byId[ids.xanni]).toBe("UNLIMITED");
    expect(byId[ids.xanniPadded]).toBe("UNLIMITED");
    expect(byId[ids.friend]).toBe("OFF");
    expect(GRANTED).toHaveLength(2);
  });
});
