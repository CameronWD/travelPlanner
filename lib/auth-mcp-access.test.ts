import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REDIRECT_URI,
  authorize,
  connectClaude,
  consent,
  devLoginCookie,
  exchangeCode,
  pkcePair,
  refreshTokens,
  registerPublicClient,
  registerRequest,
  revokeToken,
} from "@/test/integration/helpers/oauth-flow";
import { oauthContinuation, signedOAuthQuery } from "@/lib/oauth-continuation";

// Claude's OAuth connection end to end through the REAL Better Auth instance
// in lib/auth.ts, with only the Prisma adapter swapped for Better Auth's
// in-memory one. test/integration/mcp.test.ts runs the same flow on Postgres.
const { store, sendMailMock } = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, unknown>[]>,
  sendMailMock: vi.fn(async () => ({ sent: true })),
}));

vi.mock("@better-auth/prisma-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const { resetAuthMemoryStore } = await import("@/test/helpers/auth-memory-store");
  resetAuthMemoryStore(store);
  return { prismaAdapter: () => memoryAdapter(store) };
});
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store.user.find((u) => u.id === where.id) ?? null),
    },
  },
}));
vi.mock("@/lib/auth-prisma", () => ({ withBetterAuthLists: (db: unknown) => db }));
vi.mock("@/lib/sign-in-door", () => ({ decideSignIn: vi.fn(async ({ email }: { email: string }) => ({ allow: true, email })) }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMail: sendMailMock }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const BASE = "http://localhost:3000";
const RESOURCE = `${BASE}/api/mcp`;
const EMAIL = "ana@example.com";

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  const prev = { ...process.env };
  for (const k of ["APP_URL", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "AUTH_GOOGLE_ID", "AUTH_RESEND_KEY"]) delete process.env[k];
  Object.assign(process.env, { AUTH_SECRET: "test-secret-test-secret-test-secret-0123", ALLOW_DEV_LOGIN: "true", ...env });
  try {
    const mod = await import("@/lib/auth");
    // After the import: the adapter mock empties the store when it first loads.
    store.user.push({ id: "u1", email: EMAIL, name: "Ana", image: null, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    return mod;
  } finally {
    process.env = prev;
  }
}

beforeEach(async () => {
  const { resetAuthMemoryStore } = await import("@/test/helpers/auth-memory-store");
  resetAuthMemoryStore(store);
});
afterEach(() => vi.resetModules());

describe("Claude's OAuth connection (in-memory adapter)", () => {
  it("registers, consents and gets an opaque access token and a refresh token that /api/mcp accepts", async () => {
    const { authServer } = await load();
    const { tokens } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    expect(tokens.token_type.toLowerCase()).toBe("bearer");
    expect(tokens.access_token.split(".")).toHaveLength(1); // opaque, not a JWT
    expect(tokens.refresh_token).toBeTruthy();

    const access = await authServer.api.verifyMcpAccessToken({ body: { token: tokens.access_token, resource: RESOURCE } });
    expect(access).toMatchObject({ active: true, userId: "u1" });
  });

  it("an authorise without a session sends the Traveller to the Landing with a signed query", async () => {
    const { authServer } = await load();
    const clientId = await registerPublicClient(authServer.handler, BASE);
    const { challenge } = pkcePair();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: RESOURCE,
    });
    const res = await authServer.handler(new Request(`${BASE}/api/auth/oauth2/authorize?${params}`));
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!, BASE);
    expect(to.pathname).toBe("/");
    expect(to.searchParams.get("client_id")).toBe(clientId);
    expect(to.searchParams.get("sig")).toBeTruthy();
  });

  it("an authorise with a session goes to /connect, and Cancel returns access_denied to Claude", async () => {
    const { authServer } = await load();
    const cookie = await devLoginCookie(authServer.handler, BASE, EMAIL);
    const clientId = await registerPublicClient(authServer.handler, BASE);
    const { challenge } = pkcePair();
    const { location, consentQuery } = await authorize(authServer.handler, BASE, { cookie, clientId, resource: RESOURCE, challenge });
    expect(new URL(location, BASE).pathname).toBe("/connect");
    const back = await consent(authServer.handler, BASE, { cookie, consentQuery, accept: false });
    expect(back.origin + back.pathname).toBe(REDIRECT_URI);
    expect(back.searchParams.get("error")).toBe("access_denied");
  });

  it("a token bound to another host's resource is refused", async () => {
    const { authServer } = await load();
    const { tokens } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    expect(
      await authServer.api.verifyMcpAccessToken({ body: { token: tokens.access_token, resource: "https://other.example/api/mcp" } }),
    ).toEqual({ active: false });
  });

  it("on beta, the token is bound to beta's /api/mcp and production's refuses it", async () => {
    const BETA = "https://teepee-git-beta.vercel.app";
    const { authServer, MCP_RESOURCES, mcpResourceForRequest } = await load({ VERCEL_BRANCH_URL: "teepee-git-beta.vercel.app" });
    expect(MCP_RESOURCES).toEqual([RESOURCE, `${BETA}/api/mcp`]);
    expect(mcpResourceForRequest(`${BETA}/api/mcp`)).toBe(`${BETA}/api/mcp`);
    expect(mcpResourceForRequest("https://evil.example/api/mcp")).toBe(RESOURCE);

    const { tokens } = await connectClaude(authServer.handler, BETA, { email: EMAIL, resource: `${BETA}/api/mcp` });
    const check = (resource: string) => authServer.api.verifyMcpAccessToken({ body: { token: tokens.access_token, resource } });
    expect(await check(`${BETA}/api/mcp`)).toMatchObject({ active: true, userId: "u1" });
    expect(await check(RESOURCE)).toEqual({ active: false });
  });

  it("an unknown token is refused", async () => {
    const { authServer } = await load();
    expect(await authServer.api.verifyMcpAccessToken({ body: { token: "not-a-token", resource: RESOURCE } })).toEqual({ active: false });
  });

  it("the refresh grant issues a new access token that works", async () => {
    const { authServer } = await load();
    const { clientId, tokens } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    const next = await refreshTokens(authServer.handler, BASE, { clientId, refreshToken: tokens.refresh_token!, resource: RESOURCE });
    expect(next.access_token).not.toBe(tokens.access_token);
    expect(await authServer.api.verifyMcpAccessToken({ body: { token: next.access_token, resource: RESOURCE } })).toMatchObject({
      active: true,
      userId: "u1",
    });
  });

  it("a revoked access token stops working at once", async () => {
    const { authServer } = await load();
    const { clientId, tokens } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    const res = await revokeToken(authServer.handler, BASE, { clientId, token: tokens.access_token, hint: "access_token" });
    expect(res.status).toBe(200);
    expect(await authServer.api.verifyMcpAccessToken({ body: { token: tokens.access_token, resource: RESOURCE } })).toEqual({
      active: false,
    });
  });

  it("an expired token, or one from a disabled client, is refused", async () => {
    const { authServer } = await load();
    const { tokens } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    const check = () => authServer.api.verifyMcpAccessToken({ body: { token: tokens.access_token, resource: RESOURCE } });
    const row = store.oauthAccessToken[0];
    const expiresAt = row.expiresAt;
    row.expiresAt = new Date(Date.now() - 1000);
    expect(await check()).toEqual({ active: false });
    row.expiresAt = expiresAt;
    expect(await check()).toMatchObject({ active: true });
    store.oauthClient[0].disabled = true;
    expect(await check()).toEqual({ active: false });
  });

  it("keeps working after the browser session it was consented from has gone", async () => {
    const { authServer } = await load();
    const { tokens } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    for (const s of store.authSession) s.expiresAt = new Date(Date.now() - 1000);
    expect(await authServer.api.verifyMcpAccessToken({ body: { token: tokens.access_token, resource: RESOURCE } })).toMatchObject({
      active: true,
    });
  });

  it("the token check is not reachable over HTTP", async () => {
    const { authServer } = await load();
    const res = await authServer.handler(
      new Request(`${BASE}/api/auth/mcp/access-token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "x", resource: RESOURCE }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("Disconnect (Connected apps, Review Focus 4)", () => {
  /** A second Traveller connecting the SAME client, so isolation is about the user, not the client. */
  async function connectSecondUser(authServer: Awaited<ReturnType<typeof load>>["authServer"], clientId: string) {
    store.user.push({ id: "u2", email: "bo@example.com", name: "Bo", image: null, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    const cookie = await devLoginCookie(authServer.handler, BASE, "bo@example.com");
    const { verifier, challenge } = pkcePair();
    const { consentQuery } = await authorize(authServer.handler, BASE, { cookie, clientId, resource: RESOURCE, challenge });
    const back = await consent(authServer.handler, BASE, { cookie, consentQuery, accept: true });
    return exchangeCode(authServer.handler, BASE, { clientId, code: back.searchParams.get("code")!, verifier, resource: RESOURCE });
  }

  it("ends the app's access at once: access tokens, refresh tokens and the consent all go", async () => {
    const { authServer } = await load();
    const { clientId, tokens } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    // A refreshed pair too, so more than one access token is outstanding.
    const next = await refreshTokens(authServer.handler, BASE, { clientId, refreshToken: tokens.refresh_token!, resource: RESOURCE });

    const result = await authServer.api.disconnectMcpClient({ body: { userId: "u1", clientId } });
    expect(result).toEqual({ disconnected: true });

    for (const t of [tokens.access_token, next.access_token]) {
      expect(await authServer.api.verifyMcpAccessToken({ body: { token: t, resource: RESOURCE } })).toEqual({ active: false });
    }
    // Claude's offline_access refresh token survives sign-out, so it must not survive this.
    await expect(
      refreshTokens(authServer.handler, BASE, { clientId, refreshToken: next.refresh_token!, resource: RESOURCE }),
    ).rejects.toThrow(/HTTP 400/);
    expect(store.oauthAccessToken.filter((t) => t.userId === "u1")).toEqual([]);
    expect(store.oauthRefreshToken.filter((t) => t.userId === "u1")).toEqual([]);
    expect(store.oauthConsent.filter((c) => c.userId === "u1")).toEqual([]);
  });

  it("leaves another Traveller's connection to the same app alone", async () => {
    const { authServer } = await load();
    const { clientId } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    const bo = await connectSecondUser(authServer, clientId);

    await authServer.api.disconnectMcpClient({ body: { userId: "u1", clientId } });

    expect(await authServer.api.verifyMcpAccessToken({ body: { token: bo.access_token, resource: RESOURCE } })).toMatchObject({
      active: true,
      userId: "u2",
    });
    expect(store.oauthConsent.filter((c) => c.userId === "u2")).toHaveLength(1);
    const again = await refreshTokens(authServer.handler, BASE, { clientId, refreshToken: bo.refresh_token!, resource: RESOURCE });
    expect(again.access_token).toBeTruthy();
  });

  it("the app has to ask again: the next authorise goes back to the consent page", async () => {
    const { authServer } = await load();
    const { clientId, cookie } = await connectClaude(authServer.handler, BASE, { email: EMAIL, resource: RESOURCE });
    await authServer.api.disconnectMcpClient({ body: { userId: "u1", clientId } });
    const { location } = await authorize(authServer.handler, BASE, { cookie, clientId, resource: RESOURCE, challenge: pkcePair().challenge });
    expect(new URL(location, BASE).pathname).toBe("/connect");
  });

  it("is not reachable over HTTP", async () => {
    const { authServer } = await load();
    const res = await authServer.handler(
      new Request(`${BASE}/api/auth/mcp/disconnect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", clientId: "x" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("the Landing's continuation (Review Focus 5)", () => {
  /** An authorise with no session: the Landing URL the provider sends the Traveller to. */
  async function landingFromAuthorize(authServer: Awaited<ReturnType<typeof load>>["authServer"]) {
    const clientId = await registerPublicClient(authServer.handler, BASE);
    const { challenge } = pkcePair();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "st-9",
      resource: RESOURCE,
    });
    const res = await authServer.handler(new Request(`${BASE}/api/auth/oauth2/authorize?${params}`));
    const landing = new URL(res.headers.get("location")!, BASE).searchParams;
    const continuation = await oauthContinuation(landing, (await authServer.$context).secret);
    expect(continuation?.verified).toBe(true);
    return { landing, path: continuation!.path };
  }

  const followToConsent = async (authServer: Awaited<ReturnType<typeof load>>["authServer"], path: string, cookie: string) => {
    const res = await authServer.handler(new Request(new URL(path, BASE), { headers: { cookie } }));
    expect(res.status).toBe(302);
    return new URL(res.headers.get("location")!, BASE);
  };

  it("after dev login, the continuation reaches /connect for the same client and state", async () => {
    const { authServer } = await load();
    const { landing, path } = await landingFromAuthorize(authServer);
    const cookie = await devLoginCookie(authServer.handler, BASE, EMAIL);
    const consentPage = await followToConsent(authServer, path, cookie);
    expect(consentPage.pathname).toBe("/connect");
    expect(consentPage.searchParams.get("client_id")).toBe(landing.get("client_id"));
    expect(consentPage.searchParams.get("state")).toBe("st-9");
  });

  it("a Sign-in link sent from the Landing returns into the flow and on to /connect", async () => {
    const { authServer } = await load({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: "Teepee <signin@example.com>" });
    const { landing, path } = await landingFromAuthorize(authServer);
    const sent = await authServer.handler(
      new Request(`${BASE}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        // oauth_query: the auth client adds it to every POST from the Landing.
        body: JSON.stringify({ email: EMAIL, callbackURL: path, errorCallbackURL: "/", oauth_query: signedOAuthQuery(landing) }),
      }),
    );
    expect(sent.status).toBe(200);
    const mailed = (sendMailMock.mock.calls.at(-1) as unknown as [{ text: string }])[0].text.match(/https?:\/\/\S+magic-link\/verify\S+/)![0];
    const clicked = await authServer.handler(new Request(mailed));
    expect(clicked.status).toBe(302);
    const back = new URL(clicked.headers.get("location")!, BASE);
    const want = new URL(path, BASE);
    expect(back.pathname).toBe(want.pathname);
    expect([...back.searchParams]).toEqual([...want.searchParams]);
    const cookie = clicked.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect((await followToConsent(authServer, path, cookie)).pathname).toBe("/connect");
  });
});

describe("redirect URIs are held to the allowlist (lib/mcp/redirect-allowlist.ts)", () => {
  it("registration with a redirect URI off the allowlist is refused, and no client is stored", async () => {
    const { authServer } = await load();
    const res = await authServer.handler(registerRequest(BASE, { redirectUris: ["https://attacker.example/cb"] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_redirect_uri" });
    expect(store.oauthClient).toHaveLength(0);
  });

  it("registration is refused when any one of its redirect URIs is off the list", async () => {
    const { authServer } = await load();
    const res = await authServer.handler(
      registerRequest(BASE, { redirectUris: [REDIRECT_URI, "https://notclaude.ai/cb"] }),
    );
    expect(res.status).toBe(400);
  });

  it("registration with Claude Code's loopback callback is accepted", async () => {
    const { authServer } = await load();
    const res = await authServer.handler(registerRequest(BASE, { name: "Claude Code", redirectUris: ["http://localhost:53712/callback"], applicationType: "native" }));
    expect(res.status).toBeLessThan(300);
  });

  it("authorise refuses a stored client whose redirect URI is off the list (registered before the list, or by hand)", async () => {
    const { authServer } = await load();
    const cookie = await devLoginCookie(authServer.handler, BASE, EMAIL);
    const clientId = await registerPublicClient(authServer.handler, BASE);
    store.oauthClient[0].redirectUris = ["https://attacker.example/cb"];
    const { challenge } = pkcePair();
    await expect(
      authorize(authServer.handler, BASE, { cookie, clientId, resource: RESOURCE, challenge, redirectUri: "https://attacker.example/cb" }),
    ).resolves.toMatchObject({ location: expect.stringContaining("error=invalid_redirect") });
  });

  it("authorise still requires the redirect URI to be one the client registered", async () => {
    const { authServer } = await load();
    const cookie = await devLoginCookie(authServer.handler, BASE, EMAIL);
    const clientId = await registerPublicClient(authServer.handler, BASE);
    const { challenge } = pkcePair();
    const { location } = await authorize(authServer.handler, BASE, {
      cookie, clientId, resource: RESOURCE, challenge, redirectUri: "https://claude.ai/some/other/path",
    });
    expect(location).toContain("error=invalid_redirect");
    expect(location).not.toContain("claude.ai");
  });
});
