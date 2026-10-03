import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isCronAuthorized } from "./cron-auth";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe("isCronAuthorized", () => {
  it("authorizes via the Authorization header", () => {
    process.env.CRON_SECRET = "shh";
    const req = new NextRequest("https://example.com/api/cron/digest", {
      headers: { authorization: "Bearer shh" },
    });
    expect(isCronAuthorized(req)).toBe(true);
  });

  it("authorizes via the query param", () => {
    process.env.CRON_SECRET = "shh";
    const req = new NextRequest("https://example.com/api/cron/digest?secret=shh");
    expect(isCronAuthorized(req)).toBe(true);
  });

  it("fails closed when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    const req = new NextRequest("https://example.com/api/cron/digest", {
      headers: { authorization: "Bearer shh" },
    });
    expect(isCronAuthorized(req)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    process.env.CRON_SECRET = "shh";
    const req = new NextRequest("https://example.com/api/cron/digest", {
      headers: { authorization: "Bearer nope" },
    });
    expect(isCronAuthorized(req)).toBe(false);
  });
});
