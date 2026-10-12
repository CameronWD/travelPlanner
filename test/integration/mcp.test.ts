import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  authorize,
  connectClaude,
  devLoginCookie,
  pkcePair,
  refreshTokens,
  registerPublicClient,
  registerRequest,
  revokeToken,
  type ClaudeConnection,
} from "./helpers/oauth-flow";

// Mock ONLY the Next boundary that has no meaning outside a real request
// (revalidatePath/revalidateTag) — everything else, including @/lib/guards
// and the whole Better Auth OAuth provider, runs for real: Claude's access
// token comes from the real flow (dev login, registration, authorise,
// consent, token) against this database, through lib/auth-prisma.ts.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

type DbModule = typeof import("@/lib/db");
type AuthModule = typeof import("@/lib/auth");
type RouteModule = typeof import("@/app/api/mcp/route");

const BASE = "http://localhost:3000";
const RESOURCE = `${BASE}/api/mcp`;
const TRIP_ID = "it-trip-mcp";
const USER_A = "mcp-a";
const USER_B = "mcp-b";
const EMAIL_A = "mcp-a@example.test";
const EMAIL_B = "mcp-b@example.test";

function rpc(token: string, body: unknown): Request {
  return new Request(RESOURCE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function toolCall(id: number, name: string, args: Record<string, unknown>) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

describe.skipIf(process.env.INTEGRATION !== "1")("/api/mcp end to end over OAuth (real Postgres)", () => {
  let db: DbModule["db"];
  let authServer: AuthModule["authServer"];
  let POST: RouteModule["POST"];
  let NOT_FOUND_TEXT: string;
  let a: ClaudeConnection;
  let b: ClaudeConnection;
  const prevEnv = { ...process.env };
  const handler = (req: Request) => authServer.handler(req);

  beforeAll(async () => {
    // lib/auth.ts reads these at import time; the route imports it (guards).
    process.env.ALLOW_DEV_LOGIN = "true";
    process.env.AUTH_SECRET ||= "integration-secret-integration-secret-0123";
    for (const k of ["APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL"]) delete process.env[k];
    ({ db } = await import("@/lib/db"));
    ({ authServer } = await import("@/lib/auth"));
    ({ POST } = await import("@/app/api/mcp/route"));
    ({ NOT_FOUND_TEXT } = await import("@/lib/mcp/run-tool"));

    await db.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    await db.user.create({ data: { id: USER_A, email: EMAIL_A, name: "Mcp A", emailVerified: true } });
    await db.user.create({ data: { id: USER_B, email: EMAIL_B, name: "Mcp B", emailVerified: true } });

    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID,
        name: "MCP integration trip",
        homeCurrency: "AUD",
        createdById: USER_A,
        members: { create: { userId: USER_A, role: "owner" } }, // mcp-b is deliberately NOT a member
      },
    });

    a = await connectClaude(handler, BASE, { email: EMAIL_A, resource: RESOURCE });
    b = await connectClaude(handler, BASE, { email: EMAIL_B, resource: RESOURCE });
  });

  afterAll(async () => {
    const clientIds = [a?.clientId, b?.clientId].filter((id): id is string => Boolean(id));
    // Tokens, consents and client-resource links cascade from the client.
    await db.oauthClient.deleteMany({ where: { clientId: { in: clientIds } } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.authSession.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await db.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    process.env = prevEnv;
  });

  it("the flow stored the tokens and consent through lib/auth-prisma.ts (scopes and resources as lists)", async () => {
    const token = await db.oauthAccessToken.findFirst({ where: { clientId: a.clientId } });
    expect(token?.userId).toBe(USER_A);
    expect(token?.resources).toEqual([RESOURCE]);
    expect(token?.scopes).toEqual(expect.arrayContaining(["offline_access"]));
    const consent = await db.oauthConsent.findFirst({ where: { clientId: a.clientId, userId: USER_A } });
    expect(consent?.scopes.length).toBeGreaterThan(0);
    expect(a.tokens.refresh_token).toBeTruthy();
  });

  it("mcp-a's add_stop creates a rough Stop and an Activity row marked via Claude", async () => {
    const res = await POST(rpc(a.tokens.access_token, toolCall(1, "add_stop", { tripId: TRIP_ID, name: "Lisbon", countryCode: "pt", nights: 3 })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.isError).toBeFalsy();

    const stop = await db.stop.findFirst({ where: { tripId: TRIP_ID, name: "Lisbon" } });
    expect(stop).not.toBeNull();
    expect(stop?.nights).toBe(3);
    expect(stop?.countryCode).toBe("pt");

    const activity = await db.activity.findFirst({ where: { tripId: TRIP_ID, entityType: "STOP", entityId: stop!.id } });
    expect(activity?.actorId).toBe(USER_A);
    expect(activity?.source).toBe("CLAUDE");
  });

  it("mcp-b's get_trip_plan on a trip they aren't on returns the same not-found tool error as a made-up id", async () => {
    const res = await POST(rpc(b.tokens.access_token, toolCall(2, "get_trip_plan", { tripId: TRIP_ID })));
    expect(res.status).toBe(200); // the transport answers 200; the tool result itself is the error
    const json = await res.json();
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toBe(NOT_FOUND_TEXT);
  });

  it("the refresh grant gives an access token that works", async () => {
    const next = await refreshTokens(handler, BASE, { clientId: a.clientId, refreshToken: a.tokens.refresh_token!, resource: RESOURCE });
    const res = await POST(rpc(next.access_token, toolCall(3, "get_trip_plan", { tripId: TRIP_ID })));
    expect(res.status).toBe(200);
    expect((await res.json()).result.isError).toBeFalsy();
    a = { ...a, tokens: next };
  });

  it("a revoked access token gets the 401 challenge on its next call", async () => {
    const before = await POST(rpc(a.tokens.access_token, toolCall(4, "get_trip_plan", { tripId: TRIP_ID })));
    expect(before.status).toBe(200);
    const revoked = await revokeToken(handler, BASE, { clientId: a.clientId, token: a.tokens.access_token, hint: "access_token" });
    expect(revoked.status).toBe(200);
    const res = await POST(rpc(a.tokens.access_token, toolCall(5, "get_trip_plan", { tripId: TRIP_ID })));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  it("a token whose Traveller has been deleted gets a 401, not a 500", async () => {
    const ghostId = "mcp-ghost";
    const ghostEmail = "mcp-ghost@example.test";
    await db.user.deleteMany({ where: { id: ghostId } });
    await db.user.create({ data: { id: ghostId, email: ghostEmail, name: "Ghost", emailVerified: true } });
    const ghost = await connectClaude(handler, BASE, { email: ghostEmail, resource: RESOURCE });
    try {
      // Deleting the User cascades to their tokens, so the check refuses it.
      await db.user.delete({ where: { id: ghostId } });
      const res = await POST(rpc(ghost.tokens.access_token, toolCall(6, "get_trip_plan", { tripId: TRIP_ID })));
      expect(res.status).toBe(401);
    } finally {
      await db.oauthClient.deleteMany({ where: { clientId: ghost.clientId } });
      await db.user.deleteMany({ where: { id: ghostId } });
    }
  });

  it("a registration with a redirect URI off the allowlist is refused and stores no client", async () => {
    const before = await db.oauthClient.count();
    const res = await handler(registerRequest(BASE, { name: "Claude", redirectUris: ["https://attacker.example/cb"] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_redirect_uri" });
    expect(await db.oauthClient.count()).toBe(before);
  });

  it("authorise refuses a stored client whose redirect URI is off the allowlist", async () => {
    const cookie = await devLoginCookie(handler, BASE, EMAIL_A);
    const clientId = await registerPublicClient(handler, BASE);
    try {
      await db.oauthClient.update({ where: { clientId }, data: { redirectUris: ["https://attacker.example/cb"] } });
      const { location } = await authorize(handler, BASE, {
        cookie,
        clientId,
        resource: RESOURCE,
        challenge: pkcePair().challenge,
        redirectUri: "https://attacker.example/cb",
      });
      expect(location).toContain("error=invalid_redirect");
      expect(location).not.toContain("attacker.example");
    } finally {
      await db.oauthClient.deleteMany({ where: { clientId } });
    }
  });
});

