import { describe, expect, it } from "vitest";
import { renderApprovalEmail } from "./approval-email";

describe("renderApprovalEmail", () => {
  const out = renderApprovalEmail({ email: "friend@example.com", signInUrl: "https://teepee.test/" });

  it("has the agreed subject, line, button, raw link and footer", () => {
    expect(out.subject).toBe("You're in: sign in to Teepee");
    expect(out.text).toContain(
      "Your request to use Teepee was approved. Sign in with Google, or ask for a sign-in link, using this address: friend@example.com",
    );
    expect(out.text).toContain("https://teepee.test/");
    expect(out.text).toContain("If you didn't ask for access to Teepee, you can ignore this email.");
    expect(out.html).toContain('href="https://teepee.test/"');
    expect(out.html).toContain(">Sign in<");
    expect(out.html).toContain("friend@example.com");
  });

  it("escapes the address and the url in the html", () => {
    const evil = renderApprovalEmail({ email: "a<b>@example.com", signInUrl: 'https://teepee.test/?x="y"' });
    expect(evil.html).not.toContain("a<b>@example.com");
    expect(evil.html).toContain("a&lt;b&gt;@example.com");
    expect(evil.html).toContain("&quot;y&quot;");
  });
});
