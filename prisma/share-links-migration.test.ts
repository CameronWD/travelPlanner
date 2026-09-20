import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `20260920120000_share_links_per_audience` turns the single share link into
 * many labelled, scoped links per trip. It runs unattended on deploy
 * (`prisma migrate deploy`), and its one hard promise is grandfathering:
 * every existing link keeps its token and comes out as a full-scope link
 * labelled 'Shared link', so nobody holding an old URL sees content change.
 */
const FILE = readFileSync(
  path.join(
    __dirname,
    "migrations",
    "20260920120000_share_links_per_audience",
    "migration.sql",
  ),
  "utf8",
);

// Statements only — never match against comments.
const SQL = FILE.replace(/^\s*--.*$/gm, "");

function at(needle: string): number {
  const index = SQL.indexOf(needle);
  expect(index, `migration.sql is missing: ${needle}`).toBeGreaterThan(-1);
  return index;
}

describe("share_links_per_audience migration", () => {
  it("backfills label as 'Shared link' before dropping the default", () => {
    const add = at(
      `ALTER TABLE "ShareLink" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'Shared link'`,
    );
    const drop = at(`ALTER TABLE "ShareLink" ALTER COLUMN "label" DROP DEFAULT`);
    expect(add).toBeLessThan(drop);
  });

  it("adds the three dials defaulting on, so existing links keep full scope", () => {
    at(`ADD COLUMN "includeAccommodation" BOOLEAN NOT NULL DEFAULT true`);
    at(`ADD COLUMN "includeTransport" BOOLEAN NOT NULL DEFAULT true`);
    at(`ADD COLUMN "includeDailyPlans" BOOLEAN NOT NULL DEFAULT true`);
  });

  it("swaps the tripId unique for a plain index", () => {
    at(`DROP INDEX "ShareLink_tripId_key"`);
    at(`CREATE INDEX "ShareLink_tripId_idx" ON "ShareLink"("tripId")`);
  });

  it("never destroys rows or the token column", () => {
    expect(SQL).not.toMatch(/DELETE\s+FROM/i);
    expect(SQL).not.toMatch(/TRUNCATE/i);
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
  });
});
