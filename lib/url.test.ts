import { describe, it, expect } from "vitest";
import { safeWebHref } from "@/lib/url";

describe("safeWebHref", () => {
  it("passes through http/https URLs", () => {
    expect(safeWebHref("https://example.com/path")).toBe(
      "https://example.com/path",
    );
    expect(safeWebHref("http://example.com")).toBe("http://example.com/");
  });

  it("assumes https:// for a scheme-less host so bare domains still link", () => {
    expect(safeWebHref("example.com")).toBe("https://example.com/");
    expect(safeWebHref("www.example.com/booking")).toBe(
      "https://www.example.com/booking",
    );
  });

  it("rejects javascript: and data: schemes (XSS vectors)", () => {
    expect(safeWebHref("javascript:alert(document.cookie)")).toBeNull();
    expect(safeWebHref("JavaScript:alert(1)")).toBeNull();
    expect(safeWebHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeWebHref("vbscript:msgbox(1)")).toBeNull();
    expect(safeWebHref("mailto:someone@example.com")).toBeNull();
  });

  it("returns null for empty / nullish input", () => {
    expect(safeWebHref("")).toBeNull();
    expect(safeWebHref("   ")).toBeNull();
    expect(safeWebHref(null)).toBeNull();
    expect(safeWebHref(undefined)).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(safeWebHref("http://")).toBeNull();
  });
});
