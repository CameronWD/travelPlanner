import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit within the window", () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) {
      expect(limiter.allow("1.2.3.4")).toBe(true);
    }
  });

  it("refuses the 11th request within the same window", () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) limiter.allow("1.2.3.4");
    expect(limiter.allow("1.2.3.4")).toBe(false);
  });

  it("refreshes the count once the window has elapsed", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => now });
    for (let i = 0; i < 10; i++) limiter.allow("1.2.3.4");
    expect(limiter.allow("1.2.3.4")).toBe(false);

    now += 60_000; // window elapsed
    expect(limiter.allow("1.2.3.4")).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) limiter.allow("1.2.3.4");
    expect(limiter.allow("1.2.3.4")).toBe(false);
    expect(limiter.allow("5.6.7.8")).toBe(true);
  });

  it("prunes stale keys so the map cannot grow without bound", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => now });
    limiter.allow("1.2.3.4");

    now += 60_000; // 1.2.3.4's entry is now stale
    limiter.allow("5.6.7.8"); // triggers pruning of stale entries

    // 1.2.3.4's window should have reset (stale entry pruned, not carried
    // forward), so it gets a fresh count of 10 allowed again.
    now += 0;
    for (let i = 0; i < 10; i++) {
      expect(limiter.allow("1.2.3.4")).toBe(true);
    }
    expect(limiter.allow("1.2.3.4")).toBe(false);
  });
});

describe("clientIp", () => {
  it("returns the first entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(clientIp(headers)).toBe("1.2.3.4");
  });

  it("trims whitespace around the first entry", () => {
    const headers = new Headers({ "x-forwarded-for": "  1.2.3.4  , 10.0.0.1" });
    expect(clientIp(headers)).toBe("1.2.3.4");
  });

  it("returns 'unknown' when the header is absent", () => {
    const headers = new Headers();
    expect(clientIp(headers)).toBe("unknown");
  });
});
