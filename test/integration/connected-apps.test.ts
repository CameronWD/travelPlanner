import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connectClaude, refreshTokens, type ClaudeConnection } from "./helpers/oauth-flow";

// Connected apps on real Postgres (Review Focus 4): Claude connects through
// the real flow, the Account list shows it, Disconnect runs, and then BOTH of
// Claude's old credentials are dead: the access token gets a 401 from
// /api/mcp and the refresh token is refused at the token endpoint.
//
// Only the Next request boundary is mocked: `requireUser` (the signed-in
// Traveller, as the Account page would see them) and revalidation. The
// action, the auth server and lib/auth/prisma.ts all run for real.
const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/guards", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireUser: requireUserMock,
}));

type DbModule = typeof import("@/lib/db");
type AuthModule = typeof import("@/lib/auth/auth");
type RouteModule = typeof import("@/app/api/mcp/route");
type ActionsModule = typeof import("@/server/actions/connected-apps");

const BASE = "http://localhost:3000";
const RESOURCE = `${BASE}/api/mcp`;
const USER = "ca-a";
const OTHER = "ca-b";
const EMAIL = "ca-a@example.test";
const OTHER_EMAIL = "ca-b@example.test";

function listTools(token: string): Request {
  return new Request(RESOURCE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe.skipIf(process.env.INTEGRATION !== "1")("Connected apps: list and Disconnect (real Postgres)", () => {
  let db: DbModule["db"];
  let authServer: AuthModule["authServer"];
  let POST: RouteModule["POST"];
  let actions: ActionsModule;
  let mine: ClaudeConnection;
  let theirs: ClaudeConnection;
  const prevEnv = { ...process.env };
  const handler = (req: Request) => authServer.handler(req);

  beforeAll(async () => {
    process.env.ALLOW_DEV_LOGIN = "true";
    process.env.AUTH_SECRET ||= "integration-secret-integration-secret-0123";
    for (const k of ["APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL"]) delete process.env[k];
    ({ db } = await import("@/lib/db"));
    ({ authServer } = await import("@/lib/auth/auth"));
    ({ POST } = await import("@/app/api/mcp/route"));
    actions = await import("@/server/actions/connected-apps");

    await db.user.deleteMany({ where: { id: { in: [USER, OTHER] } } });
    await db.user.create({ data: { id: USER, email: EMAIL, name: "Ca A", isEmailVerified: true } });
    await db.user.create({ data: { id: OTHER, email: OTHER_EMAIL, name: "Ca B", isEmailVerified: true } });

    mine = await connectClaude(handler, BASE, { email: EMAIL, resource: RESOURCE });
    theirs = await connectClaude(handler, BASE, { email: OTHER_EMAIL, resource: RESOURCE });
  });

  afterAll(async () => {
    const clientIds = [mine?.clientId, theirs?.clientId].filter((id): id is string => Boolean(id));
    await db.oauthClient.deleteMany({ where: { clientId: { in: clientIds } } });
    await db.authSession.deleteMany({ where: { userId: { in: [USER, OTHER] } } });
    await db.user.deleteMany({ where: { id: { in: [USER, OTHER] } } });
    process.env = prevEnv;
  });

  it("lists only the signed-in Traveller's own connection, with when it was connected and last used", async () => {
    requireUserMock.mockResolvedValue({ id: USER });
    const apps = await actions.listConnectedApps();
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ clientName: "Claude", returnsTo: "claude.ai" });
    expect(apps[0].lastUsedAt).not.toBeNull();
    const consent = await db.oauthConsent.findFirstOrThrow({ where: { userId: USER, clientId: mine.clientId } });
    expect(apps[0].id).toBe(consent.id);
  });

  it("refuses to disconnect another Traveller's app", async () => {
    requireUserMock.mockResolvedValue({ id: USER });
    const theirConsent = await db.oauthConsent.findFirstOrThrow({ where: { userId: OTHER } });
    await expect(actions.disconnectApp(theirConsent.id)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    expect((await POST(listTools(theirs.tokens.access_token))).status).toBe(200);
  });

  it("Disconnect ends access at once: the old access token gets a 401 and the old refresh token is refused", async () => {
    requireUserMock.mockResolvedValue({ id: USER });
    expect((await POST(listTools(mine.tokens.access_token))).status).toBe(200);

    const [app] = await actions.listConnectedApps();
    expect(await actions.disconnectApp(app.id)).toEqual({ success: true });

    const res = await POST(listTools(mine.tokens.access_token));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");

    await expect(
      refreshTokens(handler, BASE, { clientId: mine.clientId, refreshToken: mine.tokens.refresh_token!, resource: RESOURCE }),
    ).rejects.toThrow(/HTTP 400/);

    expect(await actions.listConnectedApps()).toEqual([]);
    expect(await db.oauthAccessToken.count({ where: { userId: USER, clientId: mine.clientId } })).toBe(0);
    expect(await db.oauthRefreshToken.count({ where: { userId: USER, clientId: mine.clientId } })).toBe(0);
  });

  it("leaves the other Traveller's connection working", async () => {
    expect((await POST(listTools(theirs.tokens.access_token))).status).toBe(200);
    const next = await refreshTokens(handler, BASE, {
      clientId: theirs.clientId,
      refreshToken: theirs.tokens.refresh_token!,
      resource: RESOURCE,
    });
    expect((await POST(listTools(next.access_token))).status).toBe(200);
  });
});
