import { describe, expect, it } from "vitest";
import { formatMB } from "./format-bytes";

describe("formatMB", () => {
  it("formats 0 bytes as 0 MB", () => {
    expect(formatMB(0)).toBe("0 MB");
  });
  it("formats 123 MB", () => {
    expect(formatMB(123 * 1024 * 1024)).toBe("123 MB");
  });
  it("formats 500 MB", () => {
    expect(formatMB(500 * 1024 * 1024)).toBe("500 MB");
  });
});
