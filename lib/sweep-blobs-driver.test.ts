import { describe, expect, it } from "vitest";
import { resolveSweepDriver } from "@/lib/sweep-blobs-driver";

/**
 * C1 (final fix wave): `sweep:blobs --execute` used to destroy the retention
 * ledger and delete nothing. The script loaded no `.env*` file and every
 * documented invocation supplied `DATABASE_URL` only, so `getStorage()`
 * defaulted to the local-disk driver, whose `delete` is a silent no-op on a
 * path that isn't there. These tests pin the refusal that replaces the guess.
 */
describe("resolveSweepDriver", () => {
  it("refuses --execute when STORAGE_DRIVER is not set", () => {
    const result = resolveSweepDriver(true, undefined);

    expect(result).toHaveProperty("error");
    expect("error" in result && result.error).toContain("STORAGE_DRIVER is not set");
    expect("error" in result && result.error).toContain("silent no-op");
  });

  it("refuses --execute when STORAGE_DRIVER is set to whitespace", () => {
    const result = resolveSweepDriver(true, "   ");

    expect(result).toHaveProperty("error");
  });

  it("accepts an explicit local driver for --execute — that is a choice, not a default", () => {
    const result = resolveSweepDriver(true, "local");

    expect(result).toEqual({ driver: "local", label: "local" });
  });

  it("accepts an explicit r2 driver for --execute", () => {
    const result = resolveSweepDriver(true, "r2");

    expect(result).toEqual({ driver: "r2", label: "r2" });
  });

  it("trims surrounding whitespace off an explicit driver", () => {
    expect(resolveSweepDriver(true, " r2 ")).toEqual({ driver: "r2", label: "r2" });
  });

  it("never refuses a dry run — it reports the default it would have used", () => {
    const result = resolveSweepDriver(false, undefined);

    expect(result).toEqual({
      driver: "local",
      label: "local (default — STORAGE_DRIVER is not set)",
    });
  });

  it("reports an explicitly-set driver on a dry run too, so the dry run predicts the real one", () => {
    expect(resolveSweepDriver(false, "r2")).toEqual({ driver: "r2", label: "r2" });
  });
});
