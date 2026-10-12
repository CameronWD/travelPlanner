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
  // Rollback-safe (ADR 0071 §6): Auth.js's column keeps its name and type,
  // and Better Auth's boolean is a new column.
  expect(schema).toMatch(/^\s+emailVerified\s+DateTime\?$/m);
  expect(schema).toMatch(/^\s+isEmailVerified\s+Boolean\s+@default\(false\)$/m);
  expect(schema).not.toMatch(/emailVerifiedAt/);
});
