import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COUNTRY_CODE_TIMEZONES } from "@/lib/tz";

/**
 * `20261014120000_trip_home_timezone` adds a `homeTimezone` column to `Trip`
 * and backfills it from `homeCountryCode` using the same guess table a Stop
 * gets (lib/tz.ts COUNTRY_TO_TZ). It runs unattended on deploy
 * (`prisma migrate deploy`); the column must exist before the backfill runs,
 * and only Trips with a Home base are touched.
 */
const FILE = readFileSync(
  path.join(
    __dirname,
    "migrations",
    "20261014120000_trip_home_timezone",
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

describe("trip_home_timezone migration", () => {
  it("adds a nullable column before backfilling it", () => {
    expect(at(`ALTER TABLE "Trip" ADD COLUMN "homeTimezone" TEXT;`)).toBeLessThan(at(`UPDATE "Trip"`));
  });
  it("maps every two-letter code in the guess table", () => {
    for (const [code, zone] of COUNTRY_CODE_TIMEZONES) at(`WHEN '${code}' THEN '${zone}'`);
  });
  it("only touches Trips with a Home base", () => {
    at(`WHERE "homeName" IS NOT NULL AND "homeCountryCode" IS NOT NULL`);
  });
});
