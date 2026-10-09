import { describe, expect, it } from "vitest";
import { assertStorageMatchesDatabase, databaseHost, describeTarget } from "./storage-target";

const REMOTE = "postgresql://user:s3cret@ep-cool-1.neon.tech:5432/db?sslmode=require";
const LOCAL = "postgresql://trip:trip@localhost:5432/trip";

describe("databaseHost", () => {
  it("returns host and port without credentials or query", () => {
    expect(databaseHost(REMOTE)).toBe("ep-cool-1.neon.tech:5432");
  });
  it("returns null for missing or unparseable URLs", () => {
    expect(databaseHost(undefined)).toBeNull();
    expect(databaseHost("not a url")).toBeNull();
  });
});

describe("assertStorageMatchesDatabase", () => {
  it("throws for local storage against a remote database, naming the R2 variables", () => {
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "local" })).toThrow(/R2_BUCKET_NAME/);
  });
  it("treats an unset or non-exact driver as local", () => {
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE })).toThrow();
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "R2" })).toThrow();
  });
  it("allows local storage with a local database", () => {
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: LOCAL, STORAGE_DRIVER: "local" })).not.toThrow();
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: "postgresql://a:b@127.0.0.1/x" })).not.toThrow();
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: "postgresql://a:b@[::1]/x" })).not.toThrow();
  });
  it("allows r2 or s3 with a remote database", () => {
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "r2" })).not.toThrow();
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "s3" })).not.toThrow();
  });
  it("throws a clear error when DATABASE_URL is missing or unparseable", () => {
    expect(() => assertStorageMatchesDatabase({ STORAGE_DRIVER: "r2" })).toThrow(/DATABASE_URL/);
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: "nope", STORAGE_DRIVER: "r2" })).toThrow(/DATABASE_URL/);
  });
  it("never puts credentials in the error", () => {
    try {
      assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "local" });
    } catch (e) {
      expect(String(e)).not.toMatch(/s3cret|user:/);
      expect(String(e)).toMatch(/ep-cool-1\.neon\.tech/);
    }
  });
});

describe("describeTarget", () => {
  it("names host, driver and mode without credentials", () => {
    const line = describeTarget({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "r2" }, true);
    expect(line).toBe("Target: database ep-cool-1.neon.tech:5432, storage r2, DRY RUN");
    expect(describeTarget({ DATABASE_URL: LOCAL }, false)).toBe("Target: database localhost:5432, storage local, LIVE");
  });
});
