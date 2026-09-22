import { describe, it, expect } from "vitest";
import { rendersInline } from "./attachment-display";

describe("rendersInline", () => {
  it("is true for images, which the browser renders in place", () => {
    expect(rendersInline("image/jpeg")).toBe(true);
    expect(rendersInline("image/png")).toBe(true);
    expect(rendersInline("image/heic")).toBe(true);
  });

  it("is true for PDFs", () => {
    expect(rendersInline("application/pdf")).toBe(true);
  });

  it("is false for types the browser downloads instead of showing", () => {
    expect(rendersInline("application/msword")).toBe(false);
    expect(rendersInline("text/calendar")).toBe(false);
    expect(rendersInline("application/zip")).toBe(false);
    expect(rendersInline("application/octet-stream")).toBe(false);
  });

  it("is false for an empty or unknown mime", () => {
    expect(rendersInline("")).toBe(false);
  });
});
