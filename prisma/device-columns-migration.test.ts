import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  __dirname,
  "migrations/20260917000000_device_label_and_last_seen/migration.sql",
);
const SCHEMA = join(__dirname, "schema.prisma");

describe("device columns migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const schema = readFileSync(SCHEMA, "utf8");

  it("adds both columns", () => {
    expect(sql).toMatch(/ALTER TABLE "PushSubscription" ADD COLUMN "label" TEXT/);
    expect(sql).toMatch(/ALTER TABLE "PushSubscription" ADD COLUMN "lastSeenAt"/);
  });

  // Existing rows must NOT arrive already stale. A device subscribed
  // yesterday would otherwise be flagged "unseen since" on the first render
  // after deploy, which is exactly the false alarm the threshold exists to
  // avoid.
  it("backfills lastSeenAt from createdAt before making it NOT NULL", () => {
    const backfill = sql.indexOf('SET "lastSeenAt" = "createdAt"');
    const notNull = sql.indexOf('ALTER COLUMN "lastSeenAt" SET NOT NULL');
    expect(backfill).toBeGreaterThan(-1);
    expect(notNull).toBeGreaterThan(-1);
    expect(backfill).toBeLessThan(notNull);
  });

  it("never deletes a subscription row", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"PushSubscription"/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });

  it("is reflected in schema.prisma", () => {
    const model = schema.slice(
      schema.indexOf("model PushSubscription"),
      schema.indexOf("model JournalEntry"),
    );
    expect(model).toMatch(/label\s+String\?/);
    expect(model).toMatch(/lastSeenAt\s+DateTime\s+@default\(now\(\)\)/);
  });
});
