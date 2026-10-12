import { describe, expect, it } from "vitest";
import { isAllowedRedirectUri, redirectHosts } from "./redirect-allowlist";

const NO_ENV = {};

describe("isAllowedRedirectUri", () => {
  it.each([
    "https://claude.ai/api/mcp/auth_callback",
    "https://www.claude.ai/cb",
    "https://claude.com/cb",
    "https://app.claude.com/cb",
    "https://anthropic.com/cb",
    "https://console.anthropic.com/oauth/cb",
    "https://CLAUDE.AI/cb",
  ])("accepts %s", (uri) => {
    expect(isAllowedRedirectUri(uri, NO_ENV)).toBe(true);
  });

  it.each([
    "http://localhost/callback",
    "http://localhost:53712/callback",
    "http://127.0.0.1:8080/cb",
    "http://[::1]:9000/cb",
  ])("accepts loopback with any port: %s", (uri) => {
    expect(isAllowedRedirectUri(uri, NO_ENV)).toBe(true);
  });

  it.each([
    "https://attacker.example/cb",
    "https://notclaude.ai/cb",
    "https://claude.ai.attacker.example/cb",
    "https://evilanthropic.com/cb",
    "http://claude.ai/cb",
    "http://attacker.example/cb",
    "https://user:pass@claude.ai/cb",
    "https://claude.ai/cb#frag",
    "javascript:alert(1)",
    "claudeapp://cb",
    "not a url",
  ])("refuses %s", (uri) => {
    expect(isAllowedRedirectUri(uri, NO_ENV)).toBe(false);
  });

  it("takes extra hosts (and their subdomains) from MCP_REDIRECT_HOSTS", () => {
    const env = { MCP_REDIRECT_HOSTS: " example.org , .Partner.test ,," };
    expect(redirectHosts(env)).toEqual(["claude.ai", "claude.com", "anthropic.com", "example.org", "partner.test"]);
    expect(isAllowedRedirectUri("https://example.org/cb", env)).toBe(true);
    expect(isAllowedRedirectUri("https://a.partner.test/cb", env)).toBe(true);
    expect(isAllowedRedirectUri("https://notexample.org/cb", env)).toBe(false);
    expect(isAllowedRedirectUri("http://example.org/cb", env)).toBe(false);
    expect(isAllowedRedirectUri("https://example.org/cb", NO_ENV)).toBe(false);
  });
});
