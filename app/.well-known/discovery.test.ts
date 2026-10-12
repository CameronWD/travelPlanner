import { afterEach, describe, expect, it, vi } from "vitest";

// OAuth discovery for Claude (ADR 0071) through the REAL Better Auth
// instance, with only the Prisma adapter swapped for the in-memory one:
// /api/mcp's 401 points at the protected-resource metadata, which names the
// authorisation server, whose RFC 8414 metadata must carry the same issuer.
const { store } = vi.hoisted(() => ({ store: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("@better-auth/prisma-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const { resetAuthMemoryStore } = await import("@/test/helpers/auth-memory-store");
  resetAuthMemoryStore(store);
  return { prismaAdapter: () => memoryAdapter(store) };
});
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth-prisma", () => ({ withBetterAuthLists: (db: unknown) => db }));
vi.mock("@/lib/sign-in-door", () => ({ decideSignIn: vi.fn() }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const PROD = "http://localhost:3000";
const BETA = "https://teepee-git-beta.vercel.app";

async function load() {
  vi.resetModules();
  const prev = { ...process.env };
  for (const k of ["APP_URL", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) delete process.env[k];
  Object.assign(process.env, { AUTH_SECRET: "test-secret-test-secret-test-secret-0123", VERCEL_BRANCH_URL: "teepee-git-beta.vercel.app" });
  try {
    return {
      prmRoot: await import("./oauth-protected-resource/route"),
      prmPath: await import("./oauth-protected-resource/api/mcp/route"),
      asRoot: await import("./oauth-authorization-server/route"),
      asPath: await import("./oauth-authorization-server/api/auth/route"),
      oauth: await import("@/lib/mcp/oauth"),
    };
  } finally {
    process.env = prev;
  }
}
afterEach(() => vi.resetModules());

const json = async (res: Response) => {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  return res.json();
};

describe("protected-resource metadata (RFC 9728)", () => {
  it.each([PROD, BETA])("names %s's own /api/mcp and its /api/auth issuer, at the root and path-aware URLs", async (origin) => {
    const { prmRoot, prmPath } = await load();
    for (const route of [prmRoot, prmPath]) {
      const body = await json(await route.GET(new Request(`${origin}/.well-known/oauth-protected-resource/api/mcp`)));
      expect(body).toEqual({
        resource: `${origin}/api/mcp`,
        authorization_servers: [`${origin}/api/auth`],
        bearer_methods_supported: ["header"],
      });
    }
  });

  it("an unknown host gets production's resource", async () => {
    const { prmPath } = await load();
    const body = await json(await prmPath.GET(new Request("https://evil.example/.well-known/oauth-protected-resource/api/mcp")));
    expect(body.resource).toBe(`${PROD}/api/mcp`);
  });
});

describe("authorisation-server metadata (RFC 8414)", () => {
  it.each([PROD, BETA])("on %s, carries the issuer the resource metadata names, with DCR and PKCE", async (origin) => {
    const { asRoot, asPath } = await load();
    for (const route of [asRoot, asPath]) {
      const body = await json(await route.GET(new Request(`${origin}/.well-known/oauth-authorization-server/api/auth`)));
      expect(body.issuer).toBe(`${origin}/api/auth`);
      expect(body.authorization_endpoint).toBe(`${origin}/api/auth/oauth2/authorize`);
      expect(body.token_endpoint).toBe(`${origin}/api/auth/oauth2/token`);
      expect(body.registration_endpoint).toBe(`${origin}/api/auth/oauth2/register`);
      expect(body.revocation_endpoint).toBe(`${origin}/api/auth/oauth2/revoke`);
      expect(body.code_challenge_methods_supported).toEqual(["S256"]);
      expect(body.token_endpoint_auth_methods_supported).toContain("none");
      expect(body.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
    }
  });
});

describe("the 401 challenge", () => {
  it("points at this host's path-aware protected-resource metadata", async () => {
    const { oauth } = await load();
    const res = oauth.mcpChallenge(`${BETA}/api/mcp`);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe(
      `Bearer resource_metadata="${BETA}/.well-known/oauth-protected-resource/api/mcp"`,
    );
    expect(await res.json()).toEqual({ jsonrpc: "2.0", error: { code: -32000, message: "missing authorization header" }, id: null });
  });
});
