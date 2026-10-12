import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NULLABLE_LIST_FIELDS, rewriteArgs, rewriteResult } from "@/lib/auth-prisma";

describe("Better Auth's nullable list columns on Prisma", () => {
  it("writes null as an empty list, which Prisma accepts (the resource seed on boot)", () => {
    expect(
      rewriteArgs("OauthResource", { data: { identifier: "https://x/api/mcp", allowedScopes: null, customClaims: null } }),
    ).toEqual({ data: { identifier: "https://x/api/mcp", allowedScopes: [], customClaims: null } });
  });

  it("rewrites updates, upserts and createMany data too", () => {
    expect(rewriteArgs("OauthAccessToken", { where: { id: "a" }, data: { scopes: null } })).toEqual({
      where: { id: "a" },
      data: { scopes: [] },
    });
    expect(rewriteArgs("OauthConsent", { create: { resources: null }, update: { resources: null } })).toEqual({
      create: { resources: [] },
      update: { resources: [] },
    });
    expect(rewriteArgs("OauthClient", { data: [{ scopes: null }, { scopes: ["openid"] }] })).toEqual({
      data: [{ scopes: [] }, { scopes: ["openid"] }],
    });
  });

  it("reads an empty list back as null, so an unset client scope list or resource policy keeps meaning 'inherit'", () => {
    expect(rewriteResult("OauthClient", { id: "c", scopes: [], redirectUris: ["https://x/cb"] })).toEqual({
      id: "c",
      scopes: null,
      redirectUris: ["https://x/cb"],
    });
    expect(rewriteResult("OauthResource", [{ allowedScopes: [] }, { allowedScopes: ["mcp"] }])).toEqual([
      { allowedScopes: null },
      { allowedScopes: ["mcp"] },
    ]);
    expect(rewriteResult("OauthResource", null)).toBeNull();
    expect(rewriteResult("OauthResource", 3)).toBe(3);
  });

  it("leaves required lists and other models alone", () => {
    expect(rewriteResult("OauthClient", { clientCredentialsScopes: [] })).toEqual({ clientCredentialsScopes: [] });
    expect(rewriteArgs("User", { data: { name: null } })).toEqual({ data: { name: null } });
    expect(rewriteResult("AuthSession", { x: [] })).toEqual({ x: [] });
  });

  it("names exactly the optional String[] columns prisma/schema.prisma declares on Better Auth's models", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const found: Record<string, string[]> = {};
    let model = "";
    for (const line of schema.split("\n")) {
      const m = line.match(/^model (\w+)/);
      if (m) model = m[1];
      const f = line.match(/^\s+(\w+)\s+String\[\](.*)$/);
      // A list with a default is a required list ([] is meaningful there).
      if (f && model.startsWith("Oauth") && !f[2].includes("@default")) (found[model] ??= []).push(f[1]);
    }
    expect(found).toEqual(NULLABLE_LIST_FIELDS);
  });
});
