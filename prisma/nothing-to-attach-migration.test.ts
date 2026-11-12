import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA = readFileSync(join(__dirname, "schema.prisma"), "utf8");
const SQL = readFileSync(join(__dirname, "migrations/20261112120000_nothing_to_attach/migration.sql"), "utf8");

function model(name: string): string {
  const start = SCHEMA.indexOf(`model ${name} {`);
  return SCHEMA.slice(start, SCHEMA.indexOf("\n}", start));
}

describe("nothingToAttach migration (spec 2026-11-12 booking confirmations)", () => {
  it.each(["Transport", "Accommodation", "Item"])("adds the column NOT NULL DEFAULT false to %s", (table) => {
    expect(SQL).toMatch(new RegExp(`ALTER TABLE "${table}" ADD COLUMN "nothingToAttach" BOOLEAN NOT NULL DEFAULT false`));
  });
  it("is reflected in schema.prisma with @default(false) on all three models", () => {
    for (const name of ["Transport", "Accommodation", "Item"]) {
      expect(model(name)).toMatch(/nothingToAttach\s+Boolean\s+@default\(false\)/);
    }
    expect(SCHEMA.match(/nothingToAttach\s+Boolean\s+@default\(false\)/g)).toHaveLength(3);
  });
});
