import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first so entities are not double-broken", () => {
    expect(escapeHtml("a & b < c")).toBe("a &amp; b &lt; c");
  });

  it("neutralises a script tag in a user-supplied title", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("neutralises an attribute-breakout payload", () => {
    expect(escapeHtml(`" onerror="alert(1)`)).toBe(
      "&quot; onerror=&quot;alert(1)",
    );
  });

  it("leaves safe text untouched", () => {
    expect(escapeHtml("Tokyo Tower")).toBe("Tokyo Tower");
  });

  it("returns an empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });
});
