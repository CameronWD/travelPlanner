import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const { verifyMcpAccessToken, findUnique, reportError } = vi.hoisted(() => ({
  verifyMcpAccessToken: vi.fn(),
  findUnique: vi.fn(),
  reportError: vi.fn(),
}));

// The real lib/mcp/oauth.ts runs (bearer parsing, the RFC 9728 challenge);
// only the auth instance's token check is stubbed: "Bearer good" acts for
// user-1, "Bearer rate-<n>" for user rate-<n>, anything else is inactive.
vi.mock("@/lib/auth/auth", () => ({
  authServer: { api: { verifyMcpAccessToken } },
  mcpResourceForRequest: () => "http://localhost:3000/api/mcp",
}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));
vi.mock("@/lib/error-sink", () => ({ reportError }));
vi.mock("@/lib/mcp/server", async () => {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { getActingTraveller } = await import("@/lib/mcp/acting-traveller");
  return {
    buildMcpServer: () => {
      const server = new McpServer({ name: "teepee", version: "1.0.0" });
      server.registerTool("whoami", { description: "who", inputSchema: {} }, async () => {
        // Yield first, so a transport that answered before the handler
        // finished would show up as a missing result.
        await new Promise((r) => setTimeout(r, 5));
        return { content: [{ type: "text", text: getActingTraveller()?.id ?? "nobody" }] };
      });
      return server;
    },
  };
});

// Static import, no vi.resetModules(): resetting would give the route and the
// mocked server different acting-traveller instances (separate
// AsyncLocalStorage). The rate-limit test uses its own Traveller instead.
import * as route from "./route";

afterEach(() => vi.clearAllMocks());

function activeFor(token: string) {
  if (token === "good") return { active: true, userId: "user-1", clientId: "c1" };
  if (token.startsWith("rate-")) return { active: true, userId: token, clientId: "c1" };
  return { active: false };
}
verifyMcpAccessToken.mockImplementation(async ({ body }: { body: { token: string } }) => activeFor(body.token));
const userRow = (id: string) => ({ id, name: "Ana", email: `${id}@example.com`, image: null });

function rpc(body: unknown, auth: string | null = "Bearer good"): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (auth) headers.authorization = auth;
  return new Request("http://localhost:3000/api/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

const initialize = {
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

describe("POST /api/mcp", () => {
  it("answers a missing header with the RFC 9728 challenge, before any lookup or body parse", async () => {
    const req = rpc(initialize, null);
    const res = await route.POST(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"',
    );
    expect(verifyMcpAccessToken).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
  });

  it("answers an inactive token with the same challenge, checked against this host's resource", async () => {
    const req = rpc(initialize, "Bearer revoked-or-unknown");
    const res = await route.POST(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    expect(verifyMcpAccessToken).toHaveBeenCalledWith({
      body: { token: "revoked-or-unknown", resource: "http://localhost:3000/api/mcp" },
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
  });

  it("a token whose Traveller is gone is a bare 401, not a 500 (Review Focus 3)", async () => {
    findUnique.mockResolvedValueOnce(null);
    const res = await route.POST(rpc(initialize));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("answers initialize with the teepee server info", async () => {
    findUnique.mockResolvedValue(userRow("user-1"));
    const res = await route.POST(rpc(initialize));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.serverInfo.name).toBe("teepee");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { id: true, name: true, email: true, image: true },
    });
  });

  it("runs tools as the token's Traveller", async () => {
    findUnique.mockResolvedValue(userRow("user-1"));
    const res = await route.POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: {} } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.content[0].text).toBe("user-1");
  });

  it("rate limits one Traveller past 120 requests a minute, across tokens", async () => {
    findUnique.mockImplementation(async () => userRow("rate-a"));
    const ping = (token: string) => route.POST(rpc({ jsonrpc: "2.0", id: 3, method: "ping" }, `Bearer ${token}`));
    for (let i = 0; i < 120; i++) expect((await ping(i % 2 ? "rate-a" : "rate-a-other")).status).toBe(200);
    const res = await ping("rate-a");
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("a throwing token check is a generic 500, reported without the token or its hash", async () => {
    const token = "secret_token_value";
    const hash = createHash("sha256").update(token).digest("base64url");
    verifyMcpAccessToken.mockRejectedValueOnce(new Error(`Invalid invocation: where { token: "${hash}" } for ${token}`));
    const res = await route.POST(rpc(initialize, `Bearer ${token}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toEqual(expect.objectContaining({ route: "/api/mcp", source: "server" }));
    const reported = reportError.mock.calls[0][0] as Error;
    const text = `${reported.message} ${reported.stack} ${JSON.stringify(reportError.mock.calls[0][1])}`;
    expect(text).not.toContain(token);
    expect(text).not.toContain(hash);
  });

  it("a throwing user lookup is a generic 500, reported without the token", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down for Bearer good"));
    const res = await route.POST(rpc(initialize));
    expect(res.status).toBe(500);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(reportError.mock.calls[0][1])).not.toContain("good");
    expect((reportError.mock.calls[0][0] as Error).message).not.toContain("Bearer good");
  });
});

describe("other methods", () => {
  it("GET and DELETE are 405", async () => {
    expect((await route.GET()).status).toBe(405);
    expect((await route.DELETE()).status).toBe(405);
  });
});
