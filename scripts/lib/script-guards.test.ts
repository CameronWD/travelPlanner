import { describe, expect, it } from "vitest";
import { dbTargetLine, sweepPreflight } from "./script-guards";

const REMOTE = "postgresql://u:secretpw@ep-x.neon.tech:5432/db?sslmode=require";
const LOCAL = "postgresql://u:pw@localhost:5432/db";

describe("sweepPreflight", () => {
  it("refuses local storage against a remote database, dry run included", () => {
    for (const execute of [false, true]) {
      const r = sweepPreflight({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "local" }, execute);
      expect(r.ok).toBe(false);
      expect(r.lines.join("\n")).toMatch(/Refusing to run/);
      expect(r.lines[0]).toMatch(/^Target: database ep-x\.neon\.tech:5432/);
    }
  });
  it("refuses an unset driver against a remote database on a dry run (storage guard)", () => {
    const r = sweepPreflight({ DATABASE_URL: REMOTE }, false);
    expect(r.ok).toBe(false);
  });
  it("still refuses --execute with an unset driver against a local database (existing rule)", () => {
    const r = sweepPreflight({ DATABASE_URL: LOCAL }, true);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(/STORAGE_DRIVER is not set/);
  });
  it("passes r2 against a remote database", () => {
    const r = sweepPreflight({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "r2" }, true);
    expect(r).toMatchObject({ ok: true, driverLabel: "r2" });
  });
  it("never prints credentials", () => {
    const r = sweepPreflight({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "local" }, false);
    expect(r.lines.join("\n")).not.toMatch(/secretpw|sslmode/);
  });
});

describe("dbTargetLine", () => {
  it("names the host and mode, never credentials", () => {
    expect(dbTargetLine({ DATABASE_URL: REMOTE }, true)).toBe("Target: database ep-x.neon.tech:5432, DRY RUN");
    expect(dbTargetLine({ DATABASE_URL: LOCAL }, false)).toBe("Target: database localhost:5432, LIVE");
    expect(dbTargetLine({}, false)).toBe("Target: database unknown, LIVE");
  });
});

import { readFileSync } from "node:fs";

describe("operator scripts import load-env first", () => {
  for (const f of ["scripts/backfill-geocode.ts", "scripts/sweep-orphaned-costs.ts", "scripts/sweep-deleted-blobs.ts"]) {
    it(f, () => {
      const firstImport = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith("import "));
      expect(firstImport).toBe('import "./load-env";');
    });
  }
});
