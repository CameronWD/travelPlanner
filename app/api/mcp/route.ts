/**
 * Claude connection endpoint (spec 2026-10-09, ADR 0070 amendment, ADR 0071).
 * Stateless Streamable HTTP: each POST builds a fresh MCP server and runs it
 * inside runAsTraveller, so requireUser() resolves to the access token's
 * Traveller and every tool goes through the app's own guards. The tool list
 * follows the caller: review_trip is listed only when their Review
 * permission isn't Off (spec 2026-10-17 R12).
 *
 * Auth is OAuth: an opaque access token from Claude's own sign-in
 * (lib/auth/auth.ts mcp()), bound to this host's /api/mcp and checked in process
 * (lib/mcp/oauth.ts, lib/auth/mcp-access.ts). Without an active one the
 * answer is the RFC 9728 challenge that starts that sign-in.
 */
import { createHash } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { db } from "@/lib/db";
import { reportError } from "@/lib/error-sink";
import { runAsTraveller, type ActingUser } from "@/lib/mcp/acting-traveller";
import { bearerToken, mcpChallenge, resourceFor, verifyMcpAccessToken } from "@/lib/mcp/oauth";
import { buildMcpServer } from "@/lib/mcp/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { reviewPermissionOf } from "@/lib/review-permission-reads";

export const runtime = "nodejs";

/**
 * A Review started from Claude (review_trip) runs its model call in this
 * route's after() (lib/review/run.ts), and after() runs within the route's
 * max duration (Next 16 docs, functions/after "Duration"). Matches the
 * Reviews page's ceiling (Vercel Hobby's 300 s; the job aborts its own call
 * at 270 s). It must be a literal: segment config is read statically.
 * Ordinary calls are unaffected, only the cap rises.
 */
export const maxDuration = 300;

/** Per Traveller, across all their tokens. */
const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

/** A token that checked out for a Traveller who no longer exists: signing in again cannot help. */
function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}

const internalError = () => Response.json({ error: "Internal server error" }, { status: 500 });

/**
 * A copy of `err` with the bearer token and its stored hash scrubbed from the
 * message and stack. A failed token lookup can echo its query (the hash) in
 * the error text, and neither may ever reach the error sink (constraints.md).
 */
function redacted(err: unknown, token: string): Error {
  const secrets = [token, createHash("sha256").update(token).digest("base64url")];
  const scrub = (t: string | undefined) => secrets.reduce((acc, s) => acc?.split(s).join("[redacted]"), t);
  const src = err instanceof Error ? err : new Error(String(err));
  const copy = new Error(scrub(src.message));
  copy.name = src.name;
  copy.stack = scrub(src.stack);
  return copy;
}

export async function POST(req: Request): Promise<Response> {
  const resource = resourceFor(req);
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return mcpChallenge(resource);

  let user: ActingUser | null;
  try {
    const userId = await verifyMcpAccessToken(token, resource);
    if (!userId) return mcpChallenge(resource, "invalid access token");
    user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, image: true } });
  } catch (err) {
    await reportError(redacted(err, token), { route: "/api/mcp", source: "server" });
    return internalError();
  }
  if (!user) return unauthorized();
  if (!limiter.allow(user.id)) {
    // The limiter is a fixed 60s window with no reset time exposed, so 60
    // is the longest a caller can need to wait.
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const traveller = user;
  try {
    return await runAsTraveller(traveller, async () => {
      // Read fresh per request, so an Admin's change applies on Claude's next
      // call. It shapes the tool list (R12, lib/mcp/server.ts listsReviewTrip)
      // and never rides along on the acting Traveller. Unknown or missing is Off.
      const server = buildMcpServer({ reviewPermission: await reviewPermissionOf(traveller.id) });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      return transport.handleRequest(req);
    });
  } catch (err) {
    await reportError(redacted(err, token), { route: "/api/mcp", source: "server", userId: traveller.id });
    return internalError();
  }
}

const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
