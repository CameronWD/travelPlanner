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
import { hashToken, parseBearer, verifyToken } from "@/lib/mcp/tokens";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}

const internalError = () => Response.json({ error: "Internal server error" }, { status: 500 });

/**
 * A copy of `err` with the bearer token and its hash scrubbed from the
 * message and stack. A failed token lookup can echo its query (the hash) in
 * the error text, and neither may ever reach the error sink (constraints.md).
 */
function redacted(err: unknown, token: string): Error {
  const secrets = [token, hashToken(token)];
  const scrub = (t: string | undefined) => secrets.reduce((acc, s) => acc?.split(s).join("[redacted]"), t);
  const src = err instanceof Error ? err : new Error(String(err));
  const copy = new Error(scrub(src.message));
  copy.name = src.name;
  copy.stack = scrub(src.stack);
  return copy;
}

export async function POST(req: Request): Promise<Response> {
  const token = parseBearer(req.headers.get("authorization"));
  if (!token) return unauthorized();

  let verified: NonNullable<Awaited<ReturnType<typeof verifyToken>>>;
  try {
    const found = await verifyToken(db, token);
    if (!found) return unauthorized();
    if (!limiter.allow(found.tokenId)) {
      // The limiter is a fixed 60s window with no reset time exposed, so 60
      // is the longest a caller can need to wait.
      return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
    }
    verified = found;
  } catch (err) {
    await reportError(redacted(err, token), { route: "/api/mcp", source: "server" });
    return internalError();
  }

  try {
    return await runAsTraveller(verified.user, async () => {
      const server = buildMcpServer();
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      return transport.handleRequest(req);
    });
  } catch (err) {
    await reportError(redacted(err, token), { route: "/api/mcp", source: "server", userId: verified.user.id });
    return internalError();
  }
}

const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
