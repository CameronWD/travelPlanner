import { describe, it, expect } from "vitest";
import { isAccessDenied, isLinkExpired } from "./access-denied";

describe("isAccessDenied", () => {
  it.each([
    ["AccessDenied", true],
    ["failed_to_create_session", true],
    ["unable_to_create_session", true],
    [["Other", "AccessDenied"], true],
    [["Other", "failed_to_create_session"], true],
    ["Configuration", false],
    [["Configuration"], false],
    [undefined, false],
    ["", false],
  ] as const)("%j → %s", (input, expected) => {
    expect(isAccessDenied(input as string | string[] | undefined)).toBe(expected);
  });
});

describe("isLinkExpired", () => {
  it("is true for Better Auth's INVALID_TOKEN (a spent or expired Sign-in link), and the retired Verification code", () => {
    expect(isLinkExpired("INVALID_TOKEN")).toBe(true);
    expect(isLinkExpired(["x", "INVALID_TOKEN"])).toBe(true);
    expect(isLinkExpired("Verification")).toBe(true);
    expect(isLinkExpired(["x", "Verification"])).toBe(true);
    expect(isLinkExpired("AccessDenied")).toBe(false);
    expect(isLinkExpired(undefined)).toBe(false);
  });
});
