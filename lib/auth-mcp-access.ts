import { createAuthEndpoint } from "better-auth/api";
import { getOAuthProviderApi, type OAuthOptions, type Scope } from "@better-auth/oauth-provider";
import { z } from "zod";
import type { BetterAuthPlugin } from "better-auth";

/** What /api/mcp learns from a Claude access token: who it acts for, or nothing. */
export type McpAccess = { active: true; userId: string; clientId: string } | { active: false };

type AccessTokenRow = {
  userId?: string | null;
  clientId?: string | null;
  expiresAt?: Date | string | null;
  revoked?: Date | string | null;
  resources?: string[] | null;
  confirmation?: unknown;
};

const INACTIVE: McpAccess = { active: false };

/**
 * Checks a Claude access token for /api/mcp (ADR 0071), inside the auth
 * instance so the OAuth provider's own token hashing and client lookup are
 * used (getOAuthProviderApi is its documented seam for companion plugins).
 *
 * lib/auth.ts makes every access token opaque (`disableJwtPlugin`), so each
 * one is a row that Disconnect and /oauth2/revoke can delete. A token is
 * active only when its row exists, is unexpired and unrevoked, names a User,
 * belongs to a client that still exists and is not disabled, is a plain
 * bearer token (no DPoP binding, which this resource never asks for), and is
 * bound to `resource`, the /api/mcp URL on the host the request came to.
 *
 * Deliberately NOT checked: the browser session the Traveller consented
 * from. The provider's own introspection marks a token inactive once that
 * session expires, which would quietly cut Claude off a week after the
 * Traveller last opened the app. A connection lasts until it is disconnected
 * or its refresh token runs out.
 *
 * SERVER_ONLY: reachable through authServer.api, never over HTTP.
 */
export function mcpAccessToken() {
  return {
    id: "mcp-access-token",
    endpoints: {
      verifyMcpAccessToken: createAuthEndpoint(
        "/mcp/access-token",
        {
          method: "POST",
          body: z.object({ token: z.string().min(1), resource: z.string().min(1) }),
          metadata: { SERVER_ONLY: true },
        },
        async (ctx): Promise<McpAccess> => {
          const provider = ctx.context.getPlugin("oauth-provider") as { options: OAuthOptions<Scope[]> } | null;
          if (!provider) throw new Error("mcpAccessToken() needs the mcp() OAuth provider");
          const api = getOAuthProviderApi(ctx, provider.options);

          const row = (await ctx.context.adapter.findOne({
            model: "oauthAccessToken",
            where: [{ field: "token", value: await api.hashToken(ctx.body.token, "access_token") }],
          })) as AccessTokenRow | null;
          if (!row?.userId || !row.clientId) return INACTIVE;
          if (!row.expiresAt || new Date(row.expiresAt) <= new Date()) return INACTIVE;
          if (row.revoked) return INACTIVE;
          if (row.confirmation) return INACTIVE;
          if (!row.resources?.includes(ctx.body.resource)) return INACTIVE;

          const client = await api.getClient(row.clientId);
          if (!client || client.disabled) return INACTIVE;

          return { active: true, userId: row.userId, clientId: row.clientId };
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
