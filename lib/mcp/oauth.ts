import "server-only";
import { createResourceServerChallenge, metadataResponse } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { authServer, mcpResourceForRequest } from "@/lib/auth";

/**
 * /api/mcp as an OAuth protected resource (ADR 0071, RFC 9728). Claude
 * finds the authorisation server from the protected-resource metadata, and
 * its access tokens are checked in process by lib/auth-mcp-access.ts.
 *
 * Everything is per host: production, beta and a preview each bind tokens
 * to their own /api/mcp (lib/auth.ts MCP_RESOURCES), and a request is held
 * to the resource of the host it came to.
 */

/** The protected resource a request to /api/mcp (or its metadata) is for. */
export const resourceFor = (req: Request): string => mcpResourceForRequest(req.url);

/** The authorisation server (Better Auth's issuer) on the resource's host. */
export const issuerFor = (resource: string): string => `${new URL(resource).origin}/api/auth`;

/** The token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer +(\S+)\s*$/i.exec(header ?? "");
  return match ? match[1] : null;
}

/** The Traveller id an access token acts for on `resource`, or null when it is not an active token for it. */
export async function verifyMcpAccessToken(token: string, resource: string): Promise<string | null> {
  const access = await authServer.api.verifyMcpAccessToken({ body: { token, resource } });
  return access.active ? access.userId : null;
}

/**
 * The 401 that starts Claude's sign-in: a JSON-RPC error with the RFC 9728
 * `WWW-Authenticate` challenge pointing at this host's protected-resource
 * metadata (built by the OAuth provider's own helper).
 */
export function mcpChallenge(resource: string, message = "missing authorization header"): Response {
  const challenge = createResourceServerChallenge(new APIError("UNAUTHORIZED", { message }), resource);
  const headers = new Headers(challenge?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), { status: 401, headers });
}

/** RFC 9728 protected-resource metadata for the host `req` came to. */
export function protectedResourceMetadata(req: Request): Response {
  const resource = resourceFor(req);
  return metadataResponse({
    resource,
    authorization_servers: [issuerFor(resource)],
    bearer_methods_supported: ["header"],
  });
}
