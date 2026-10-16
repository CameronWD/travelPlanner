import { describe, expect, it } from "vitest";
import { REQUEST_PATH_HEADER, signInHref } from "./sign-in-href";

describe("signInHref (spec 2026-10-01 §E)", () => {
  it("names the request header the proxy sets", () => {
    expect(REQUEST_PATH_HEADER).toBe("x-request-path");
  });
  it("sends a signed-out visitor to the Landing carrying the page they asked for", () => {
    expect(signInHref("/trips/kyoto/plan?day=3")).toBe("/?callbackUrl=%2Ftrips%2Fkyoto%2Fplan%3Fday%3D3");
    expect(signInHref("/admin")).toBe("/?callbackUrl=%2Fadmin");
  });
  it("is plain / when there is no path, or the path is the Landing itself", () => {
    expect(signInHref(null)).toBe("/");
    expect(signInHref(undefined)).toBe("/");
    expect(signInHref("")).toBe("/");
    expect(signInHref("/")).toBe("/");
  });
  it("drops anything that is not a same-origin path (never a header the client could have forged)", () => {
    expect(signInHref("https://evil.example/trips")).toBe("/");
    expect(signInHref("//evil.example/trips")).toBe("/");
    expect(signInHref("/\\evil.example")).toBe("/");
    expect(signInHref("trips")).toBe("/");
  });
});
