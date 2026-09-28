import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: m.get, set: m.set }) }));

import { rememberLastTrip } from "./last-trip";

const ONE_YEAR = 60 * 60 * 24 * 365;

beforeEach(() => {
  vi.clearAllMocks();
  m.get.mockReturnValue(undefined);
});

describe("rememberLastTrip", () => {
  it("sets the cookie, httpOnly + sameSite lax + a year, secure only in production (Minor 17)", async () => {
    const original = process.env.NODE_ENV;
    // @ts-expect-error — test-only override of a read-only-in-types env var.
    process.env.NODE_ENV = "production";
    try {
      await rememberLastTrip("t1");
    } finally {
      // @ts-expect-error — restoring the test-only override above.
      process.env.NODE_ENV = original;
    }
    expect(m.set).toHaveBeenCalledWith("teepee-last-trip", "t1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: ONE_YEAR,
      secure: true,
    });
  });
  it("is not secure outside production (dev/test over plain http)", async () => {
    const original = process.env.NODE_ENV;
    // @ts-expect-error — test-only override.
    process.env.NODE_ENV = "development";
    try {
      await rememberLastTrip("t1");
    } finally {
      // @ts-expect-error — restoring.
      process.env.NODE_ENV = original;
    }
    expect(m.set).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ secure: false }));
  });
  it("rejects a malformed trip id without touching cookies", async () => {
    await rememberLastTrip("../not-an-id");
    expect(m.set).not.toHaveBeenCalled();
  });
  it("skips the write when the cookie already matches (no-op)", async () => {
    m.get.mockReturnValue({ value: "t1" });
    await rememberLastTrip("t1");
    expect(m.set).not.toHaveBeenCalled();
  });
});
