import { describe, it, expect } from "vitest";
import { renderSignInEmail } from "./sign-in-email";

const URL = "https://teepee.camxanhq.com/api/auth/callback/resend?callbackUrl=%2Ftrips&token=abc&email=cam%40example.com";

describe("renderSignInEmail (spec 2026-10-01 §B4)", () => {
  it("subject names Teepee, not the host", () => {
    expect(renderSignInEmail({ url: URL }).subject).toBe("Sign in to Teepee");
  });
  it("carries the link in both parts — as a button and as raw text in the HTML, and bare in the text part", () => {
    const { html, text } = renderSignInEmail({ url: URL });
    const escaped = URL.replace(/&/g, "&amp;");
    expect(html).toContain(`href="${escaped}"`);
    expect(html).toContain(`>${escaped}<`);
    expect(text).toContain(URL);
  });
  it("says the link works once and expires in 24 hours, and can be ignored", () => {
    const { html, text } = renderSignInEmail({ url: URL });
    for (const part of [html, text]) {
      expect(part).toMatch(/works once/);
      expect(part).toMatch(/24 hours/);
      expect(part).toMatch(/ignore this email/);
    }
  });
  it("escapes HTML in the url and never calls it a magic link", () => {
    const { html, text } = renderSignInEmail({ url: 'https://x.test/?a=1&b="<x>' });
    expect(html).not.toContain('"<x>');
    expect(html).toContain("&quot;&lt;x&gt;");
    expect(`${html}${text}`).not.toMatch(/magic/i);
  });
  it("has no images", () => {
    expect(renderSignInEmail({ url: URL }).html).not.toMatch(/<img/i);
  });
});
