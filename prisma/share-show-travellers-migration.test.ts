import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA = readFileSync(join(__dirname, "schema.prisma"), "utf8");
const SHOW = readFileSync(
  join(__dirname, "migrations/20260930400000_share_link_show_travellers/migration.sql"),
  "utf8",
);
const SOURCE = readFileSync(
  join(__dirname, "migrations/20260930400001_trip_source_share_link/migration.sql"),
  "utf8",
);

function model(name: string): string {
  const start = SCHEMA.indexOf(`model ${name} {`);
  return SCHEMA.slice(start, SCHEMA.indexOf("\n}", start));
}

describe("showTravellers migration (ADR 0051 amendment 2026-09-30)", () => {
  it("adds the column NOT NULL DEFAULT false, so every existing link stays off", () => {
    expect(SHOW).toMatch(/ALTER TABLE "ShareLink" ADD COLUMN "showTravellers" BOOLEAN NOT NULL DEFAULT false/);
    expect(SHOW).not.toMatch(/DEFAULT true/i);
    expect(SHOW).not.toMatch(/UPDATE\s+"ShareLink"/i);
  });
  it("is reflected in schema.prisma with @default(false)", () => {
    expect(model("ShareLink")).toMatch(/showTravellers\s+Boolean\s+@default\(false\)/);
  });
});

describe("sourceShareLinkId migration (CONTEXT.md Route copy)", () => {
  it("adds a nullable text column with no foreign key, so attribution survives a revoke", () => {
    expect(SOURCE).toMatch(/ALTER TABLE "Trip" ADD COLUMN "sourceShareLinkId" TEXT;/);
    expect(SOURCE).not.toMatch(/FOREIGN KEY|REFERENCES/i);
  });
  it("is a plain String? on Trip, not a relation", () => {
    const trip = model("Trip");
    expect(trip).toMatch(/sourceShareLinkId\s+String\?/);
    expect(trip).not.toMatch(/sourceShareLink\s+ShareLink/);
  });
});
