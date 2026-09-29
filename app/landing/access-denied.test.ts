import { describe, it, expect } from "vitest";
import { isAccessDenied } from "./access-denied";

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
