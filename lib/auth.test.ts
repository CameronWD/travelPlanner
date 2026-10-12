import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetterAuthOptions } from "better-auth";

// The wiring of lib/auth.ts onto Better Auth: the one door (lib/sign-in-door.ts,
// tested on its own) is mocked here, and these tests pin WHERE and HOW each
// Better Auth hook asks it.
const { decideSignInMock, acceptPendingInvitesMock, userFindUniqueMock, headersMock, reportErrorMock } = vi.hoisted(() => ({
  reportErrorMock: vi.fn(),
  decideSignInMock: vi.fn(),
  acceptPendingInvitesMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: userFindUniqueMock } } }));
const { withBetterAuthListsMock } = vi.hoisted(() => ({ withBetterAuthListsMock: vi.fn((db: unknown) => db) }));
vi.mock("@/lib/auth-prisma", () => ({ withBetterAuthLists: withBetterAuthListsMock }));
// The real instance initialises eagerly (the MCP OAuth provider seeds its
// resource), so it needs a working database: Better Auth's in-memory one.
vi.mock("@better-auth/prisma-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const { resetAuthMemoryStore } = await import("@/test/helpers/auth-memory-store");
  return { prismaAdapter: () => memoryAdapter(resetAuthMemoryStore({})) };
});
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: acceptPendingInvitesMock }));
vi.mock("@/lib/sign-in-door", () => ({ decideSignIn: decideSignInMock }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123";

import { auth, authServer, MCP_RESOURCE, mcpResourceFor } from "@/lib/auth";

// Widened to the declared option types: betterAuth() infers the literal
// config, whose inline hooks declare fewer parameters than Better Auth passes.
const options: BetterAuthOptions = authServer.options;
const listShimCalls = [...withBetterAuthListsMock.mock.calls];
const validateUserInfo = options.user!.validateUserInfo!;
const sessionCreate = options.databaseHooks!.session!.create!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (path: string) => ({ path }) as any;
const ALLOW = (email: string) => ({ allow: true, email });
const REFUSE = { allow: false, reason: "refused" };

beforeEach(() => {
  decideSignInMock.mockReset();
  acceptPendingInvitesMock.mockReset();
  userFindUniqueMock.mockReset();
  headersMock.mockReset();
  reportErrorMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("Better Auth options", () => {
  it("maps Better Auth's models onto the Prisma client's names", () => {
    expect(options.user?.modelName).toBe("user");
    expect(options.session?.modelName).toBe("authSession");
    expect(options.account?.modelName).toBe("authAccount");
    expect(options.verification?.modelName).toBe("authVerification");
  });

  it("hands Better Auth the Prisma client through the nullable-list shim (lib/auth-prisma.ts)", async () => {
    const { db } = await import("@/lib/db");
    expect(listShimCalls).toEqual([[db]]);
  });

  it("keeps sessions in the database with a 5-minute cookie cache", () => {
    expect(options.session?.cookieCache).toEqual({ enabled: true, maxAge: 300 });
  });

  it("keeps a session 30 days (Auth.js's old lifetime), refreshed at Better Auth's default age", () => {
    expect(options.session?.expiresIn).toBe(60 * 60 * 24 * 30);
    expect(options.session?.updateAge).toBeUndefined();
  });

  it("maps Better Auth's emailVerified onto isEmailVerified, leaving Auth.js's column alone (rollback, ADR 0071 §6)", () => {
    expect(options.user?.fields).toEqual({ emailVerified: "isEmailVerified" });
  });

  it("does NOT encrypt OAuth tokens: the migration copied Google's tokens in plaintext", () => {
    expect(options.account?.encryptOAuthTokens).toBeFalsy();
  });

  it("sends every error (a refused sign-in included) to the Landing, which renders the denied panel", () => {
    expect(options.onAPIError?.errorURL).toBe("/");
  });

  it("serves under /api/auth, keeping Google's callback at /api/auth/callback/google", () => {
    expect(options.basePath).toBe("/api/auth");
  });

  it("binds the MCP resource to this site's /api/mcp", () => {
    expect(MCP_RESOURCE).toMatch(/\/api\/mcp$/);
  });

  it("resolves the base URL per request from the allowed hosts, falling back to siteUrl()", () => {
    expect(options.baseURL).toEqual({ allowedHosts: ["localhost:3000"], fallback: "http://localhost:3000" });
  });

  it("builds the MCP resource for any origin (Task 5 may bind per host)", () => {
    expect(mcpResourceFor("https://teepee-git-beta.vercel.app/")).toBe("https://teepee-git-beta.vercel.app/api/mcp");
    expect(MCP_RESOURCE).toBe("http://localhost:3000/api/mcp");
  });

  it("registers the MCP OAuth provider and its token check, with nextCookies last", () => {
    const ids = (options.plugins ?? []).map((p) => p.id);
    expect(ids).toContain("oauth-provider");
    expect(ids).toContain("mcp-access-token");
    expect(ids.at(-1)).toBe("next-cookies");
  });

  it("issues opaque (revocable) access tokens, so no jwt plugin, and lets Claude register itself", () => {
    const ids = (options.plugins ?? []).map((p) => p.id);
    expect(ids).not.toContain("jwt");
    const provider = (options.plugins ?? []).find((p) => p.id === "oauth-provider") as unknown as {
      options: Record<string, unknown>;
    };
    expect(provider.options).toMatchObject({
      loginPage: "/",
      consentPage: "/connect",
      disableJwtPlugin: true,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      resources: ["http://localhost:3000/api/mcp"],
      clientRegistrationDefaultResources: ["http://localhost:3000/api/mcp"],
    });
  });
});

describe("user.validateUserInfo (the door before any User row or link is written)", () => {
  const googleProfile = { email: "cam@example.com", email_verified: true, name: "Cam", picture: "https://x/p.jpg" };

  it.each(["create-user", "link-account", "sign-in"] as const)(
    "asks the door as google with the RAW provider profile on %s",
    async (action) => {
      decideSignInMock.mockResolvedValue(ALLOW("cam@example.com"));
      await expect(
        validateUserInfo(
          {
            user: { email: "cam@example.com" },
            source: { action, method: "oauth", oauth: { providerId: "google", profile: googleProfile } },
          },
          ctx("/callback/:id"),
        ),
      ).resolves.toBeUndefined();
      expect(decideSignInMock).toHaveBeenCalledWith({
        email: "cam@example.com",
        method: "google",
        pass: "sign-in",
        profile: googleProfile,
      });
    },
  );

  it("refuses with AccessDenied (the code the Landing's denied panel reads) when the door refuses", async () => {
    decideSignInMock.mockResolvedValue({ allow: false, reason: "unverified" });
    await expect(
      validateUserInfo(
        {
          user: { email: "cam@example.com" },
          source: { action: "create-user", method: "oauth", oauth: { providerId: "google", profile: { email_verified: false } } },
        },
        ctx("/callback/:id"),
      ),
    ).resolves.toEqual({ error: "AccessDenied" });
  });

  it("asks the door as magic-link on the click pass for a brand-new link user", async () => {
    decideSignInMock.mockResolvedValue(ALLOW("new@example.com"));
    await expect(
      validateUserInfo(
        { user: { email: "new@example.com" }, source: { action: "create-user", method: "magic-link" } },
        ctx("/magic-link/verify"),
      ),
    ).resolves.toBeUndefined();
    expect(decideSignInMock).toHaveBeenCalledWith({
      email: "new@example.com",
      method: "magic-link",
      pass: "sign-in",
      profile: null,
    });
  });

  it("fails closed for any provisioning method this app does not offer, without asking the door", async () => {
    await expect(
      validateUserInfo(
        { user: { email: "x@example.com" }, source: { action: "create-user", method: "email-password" } },
        ctx("/sign-up/email"),
      ),
    ).resolves.toEqual({ error: "AccessDenied" });
    expect(decideSignInMock).not.toHaveBeenCalled();
  });
});

describe("databaseHooks.session.create", () => {
  const session = { id: "s1", userId: "u1", token: "t", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() };

  it("before: refuses a session (returns false) when the door now refuses the user's email, e.g. a revoked allowlist entry (Review Focus 1)", async () => {
    userFindUniqueMock.mockResolvedValue({ email: "revoked@example.com" });
    decideSignInMock.mockResolvedValue(REFUSE);
    await expect(sessionCreate.before!(session, ctx("/magic-link/verify"))).resolves.toBe(false);
    expect(userFindUniqueMock).toHaveBeenCalledWith({ where: { id: "u1" }, select: { email: true } });
    expect(decideSignInMock).toHaveBeenCalledWith({ email: "revoked@example.com", method: "magic-link", pass: "sign-in" });
  });

  it("before: allows the session when the door admits", async () => {
    userFindUniqueMock.mockResolvedValue({ email: "cam@example.com" });
    decideSignInMock.mockResolvedValue(ALLOW("cam@example.com"));
    await expect(sessionCreate.before!(session, ctx("/callback/:id"))).resolves.toBe(true);
  });

  it("before: refuses when the user row is gone", async () => {
    userFindUniqueMock.mockResolvedValue(null);
    decideSignInMock.mockResolvedValue({ allow: false, reason: "no-email" });
    await expect(sessionCreate.before!(session, ctx("/magic-link/verify"))).resolves.toBe(false);
  });

  it("before: a dev-login session is asked as dev-login (the door lets it through outside production only)", async () => {
    userFindUniqueMock.mockResolvedValue({ email: "seeded@example.com" });
    decideSignInMock.mockResolvedValue(ALLOW("seeded@example.com"));
    await expect(sessionCreate.before!(session, ctx("/dev-login"))).resolves.toBe(true);
    expect(decideSignInMock).toHaveBeenCalledWith({ email: "seeded@example.com", method: "dev-login", pass: "sign-in" });
  });

  it("after: accepts the Traveller's pending Trip Invites (today's events.signIn)", async () => {
    userFindUniqueMock.mockResolvedValue({ email: "cam@example.com" });
    await sessionCreate.after!(session, ctx("/callback/:id"));
    expect(acceptPendingInvitesMock).toHaveBeenCalledWith("u1", "cam@example.com");
  });

  it("after: a failure accepting invites is reported and never fails the sign-in", async () => {
    userFindUniqueMock.mockResolvedValue({ email: "cam@example.com" });
    const err = new Error("db down");
    acceptPendingInvitesMock.mockRejectedValue(err);
    await expect(sessionCreate.after!(session, ctx("/callback/:id"))).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledWith(err, { source: "server", route: "session.create.after" });
  });

  it("after: a failure reading the user is reported too", async () => {
    const err = new Error("lookup failed");
    userFindUniqueMock.mockRejectedValue(err);
    await expect(sessionCreate.after!(session, ctx("/callback/:id"))).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledWith(err, { source: "server", route: "session.create.after" });
    expect(acceptPendingInvitesMock).not.toHaveBeenCalled();
  });
});

describe("auth()", () => {
  it("maps a Better Auth session onto { user: { id, email, name, image } }", async () => {
    const h = new Headers({ cookie: "x=y" });
    headersMock.mockResolvedValue(h);
    const spy = vi.spyOn(authServer.api, "getSession").mockResolvedValue({
      session: { id: "s1" },
      user: { id: "u1", email: "cam@example.com", name: "Cam", image: undefined, emailVerified: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await expect(auth()).resolves.toEqual({ user: { id: "u1", email: "cam@example.com", name: "Cam", image: null } });
    expect(spy).toHaveBeenCalledWith({ headers: h });
  });

  it("returns null when there is no session", async () => {
    headersMock.mockResolvedValue(new Headers());
    vi.spyOn(authServer.api, "getSession").mockResolvedValue(null);
    await expect(auth()).resolves.toBeNull();
  });
});
