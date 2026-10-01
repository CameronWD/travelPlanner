import { describe, it, expect } from "vitest";
import { isAccessDenied, isLinkExpired } from "./access-denied";

describe("isAccessDenied", () => {
  it.each([
    ["AccessDenied", true],
    [["Other", "AccessDenied"], true],
    ["Configuration", false],
    [["Configuration"], false],
    [undefined, false],
    ["", false],
  ] as const)("%j → %s", (input, expected) => {
    expect(isAccessDenied(input as string | string[] | undefined)).toBe(expected);
  });
});

describe("isLinkExpired", () => {
  it("is true only for Auth.js's Verification error (a spent or expired Sign-in link)", () => {
    expect(isLinkExpired("Verification")).toBe(true);
    expect(isLinkExpired(["x", "Verification"])).toBe(true);
    expect(isLinkExpired("AccessDenied")).toBe(false);
    expect(isLinkExpired(undefined)).toBe(false);
  });
});
