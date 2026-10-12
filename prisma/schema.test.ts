import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

it("has the Better Auth models and no McpToken", () => {
  for (const m of [
    "AuthSession",
    "AuthAccount",
    "AuthVerification",
    "Jwks",
    "OauthClient",
    "OauthAccessToken",
    "OauthConsent",
  ]) {
    expect(schema).toMatch(new RegExp(`^model ${m} \\{`, "m"));
  }
  expect(schema).not.toMatch(/^model McpToken/m);
  expect(schema).toMatch(/emailVerified\s+Boolean\s+@default\(false\)/);
  expect(schema).toMatch(/emailVerifiedAt\s+DateTime\?/);
});
