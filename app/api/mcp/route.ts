/**
 * Claude connection endpoint (spec 2026-10-09, ADR 0070 amendment).
 * Stateless Streamable HTTP: each POST builds a fresh MCP server and runs it
 * inside runAsTraveller, so requireUser() resolves to the token's Traveller
 * and every tool goes through the app's own guards.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { db } from "@/lib/db";
import { reportError } from "@/lib/error-sink";
import { runAsTraveller } from "@/lib/mcp/acting-traveller";
import { buildMcpServer } from "@/lib/mcp/server";
import { parseBearer, verifyToken } from "@/lib/mcp/tokens";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}

export async function POST(req: Request): Promise<Response> {
  const token = parseBearer(req.headers.get("authorization"));
  if (!token) return unauthorized();
  const verified = await verifyToken(db, token);
  if (!verified) return unauthorized();
  if (!limiter.allow(verified.tokenId)) return Response.json({ error: "Too many requests" }, { status: 429 });

  try {
    return await runAsTraveller(verified.user, async () => {
      const server = buildMcpServer();
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      return transport.handleRequest(req);
    });
  } catch (err) {
    await reportError(err, { route: "/api/mcp", source: "server", userId: verified.user.id });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
