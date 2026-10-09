import { afterEach, describe, expect, it, vi } from "vitest";

const { findUnique, update, reportError } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { mcpToken: { findUnique, update } } }));
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
// AsyncLocalStorage). The rate-limit test uses its own token id instead.
import * as route from "./route";
import { hashToken } from "@/lib/mcp/tokens";
afterEach(() => vi.clearAllMocks());

const USER = { id: "u1", name: "Ana", email: "ana@example.com", image: null };
const validRow = { id: "tok1", revokedAt: null, lastUsedAt: new Date(), user: USER };

function rpc(body: unknown, auth: string | null = "Bearer tp_good"): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (auth) headers.authorization = auth;
  return new Request("http://x/api/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

const initialize = {
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

async function snapshot(res: Response) {
  return { status: res.status, headers: [...res.headers.entries()], body: await res.text() };
}

describe("POST /api/mcp", () => {
  it("rejects a missing header with a bare 401, before any lookup or body parse", async () => {
    const req = rpc(initialize, null);
    const res = await route.POST(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(findUnique).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
  });

  it("gives an unknown token and a revoked token byte-identical 401s", async () => {
    findUnique.mockResolvedValueOnce(null);
    const unknownReq = rpc(initialize, "Bearer tp_unknown");
    const unknown = await snapshot(await route.POST(unknownReq));
    findUnique.mockResolvedValueOnce({ ...validRow, revokedAt: new Date() });
    const revokedReq = rpc(initialize, "Bearer tp_revoked");
    const revoked = await snapshot(await route.POST(revokedReq));
    expect(unknown.status).toBe(401);
    expect(revoked).toEqual(unknown);
    expect(unknownReq.bodyUsed).toBe(false);
    expect(revokedReq.bodyUsed).toBe(false);
  });

  it("answers initialize with the teepee server info", async () => {
    findUnique.mockResolvedValue(validRow);
    const res = await route.POST(rpc(initialize));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.serverInfo.name).toBe("teepee");
  });

  it("runs tools as the token's traveller", async () => {
    findUnique.mockResolvedValue(validRow);
    const res = await route.POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: {} } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.content[0].text).toBe("u1");
  });

  it("rate limits one token past 120 requests a minute", async () => {
    findUnique.mockResolvedValue({ ...validRow, id: "tok-rate" });
    const ping = () => route.POST(rpc({ jsonrpc: "2.0", id: 3, method: "ping" }));
    for (let i = 0; i < 120; i++) expect((await ping()).status).toBe(200);
    const res = await ping();
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("a throwing token lookup is a generic 500, reported without the token", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    const res = await route.POST(rpc(initialize, "Bearer tp_secret_token_value"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toEqual(expect.objectContaining({ route: "/api/mcp", source: "server" }));
    expect(JSON.stringify(reportError.mock.calls[0])).not.toContain("tp_secret_token_value");
  });

  it("scrubs the token's hash from a reported lookup error", async () => {
    const hash = hashToken("tp_other_secret");
    findUnique.mockRejectedValueOnce(new Error(`Invalid invocation: where { tokenHash: "${hash}" }`));
    const res = await route.POST(rpc(initialize, "Bearer tp_other_secret"));
    expect(res.status).toBe(500);
    const reported = reportError.mock.calls[0][0] as Error;
    expect(`${reported.message} ${reported.stack}`).not.toContain(hash);
    expect(JSON.stringify(reportError.mock.calls[0][1])).not.toContain("tp_other_secret");
  });
});

describe("other methods", () => {
  it("GET and DELETE are 405", async () => {
    expect((await route.GET()).status).toBe(405);
    expect((await route.DELETE()).status).toBe(405);
  });
});
