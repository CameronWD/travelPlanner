import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA = readFileSync(join(__dirname, "schema.prisma"), "utf8");
const MIGRATION = join(__dirname, "migrations/20261006120000_add_plan_order_indexes/migration.sql");

function model(name: string): string {
  const start = SCHEMA.indexOf(`model ${name} {`);
  return SCHEMA.slice(start, SCHEMA.indexOf("\n}", start));
}

describe("plan-order indexes (spec 2026-10-06 §V, audit P23)", () => {
  it("is additive: five CREATE INDEX statements and nothing else", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/CREATE INDEX "Stop_tripId_forkId_sortOrder_idx" ON "Stop"\("tripId", "forkId", "sortOrder"\);/);
    expect(sql).toMatch(/CREATE INDEX "Transport_tripId_forkId_sortOrder_idx" ON "Transport"\("tripId", "forkId", "sortOrder"\);/);
    expect(sql).toMatch(/CREATE INDEX "Item_tripId_forkId_sortOrder_idx" ON "Item"\("tripId", "forkId", "sortOrder"\);/);
    expect(sql).toMatch(/CREATE INDEX "Reminder_tripId_date_idx" ON "Reminder"\("tripId", "date"\);/);
    expect(sql).toMatch(/CREATE INDEX "AccessRequest_resolvedAt_idx" ON "AccessRequest"\("resolvedAt"\);/);
    expect(sql).not.toMatch(/DROP|ALTER TABLE/i);
  });
  it("is reflected in schema.prisma", () => {
    for (const m of ["Stop", "Transport", "Item"]) expect(model(m)).toContain("@@index([tripId, forkId, sortOrder])");
    expect(model("Reminder")).toContain("@@index([tripId, date])");
    expect(model("AccessRequest")).toContain("@@index([resolvedAt])");
  });
});
