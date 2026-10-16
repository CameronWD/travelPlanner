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
 * lib/auth/auth.ts makes every access token opaque (`disableJwtPlugin`), so each
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
      /**
       * Disconnect (CONTEXT.md **Connected apps**, Review Focus 4): ends one
       * app's access for one Traveller at once, so the app has to ask again.
       *
       * The provider's own /oauth2/delete-consent only deletes the consent
       * row: every token it issued would keep working, and Claude's
       * offline_access refresh token would keep minting new ones. Its
       * /oauth2/revoke needs the raw token, which only the client holds (we
       * store hashes). So this does what the provider itself does when it
       * kills a refresh family (invalidateRefreshFamily) and when it revokes
       * an access token: it DELETES the rows, through the same adapter.
       * Deleting rather than marking `revoked` also closes the provider's
       * refresh-rotation replay window, which answers a revoked-but-recent
       * refresh token with the tokens it already issued.
       *
       * Order: refresh tokens first, so the old refresh token cannot mint a
       * new access token after the access tokens are gone (a refresh already
       * in flight at that instant can still land one: see the Task 6
       * report); the consent last, so a failure part way leaves the app
       * listed and Disconnect can be pressed again.
       *
       * Scoped to (userId, clientId): another Traveller connected to the
       * same client keeps their connection. SERVER_ONLY: the caller has
       * already checked who is asking (server/actions/connected-apps.ts).
       */
      disconnectMcpClient: createAuthEndpoint(
        "/mcp/disconnect",
        {
          method: "POST",
          body: z.object({ userId: z.string().min(1), clientId: z.string().min(1) }),
          metadata: { SERVER_ONLY: true },
        },
        async (ctx): Promise<{ disconnected: true }> => {
          const where = [
            { field: "clientId", value: ctx.body.clientId },
            { field: "userId", value: ctx.body.userId },
          ];
          await ctx.context.adapter.deleteMany({ model: "oauthRefreshToken", where });
          await ctx.context.adapter.deleteMany({ model: "oauthAccessToken", where });
          await ctx.context.adapter.deleteMany({ model: "oauthConsent", where });
          return { disconnected: true };
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
