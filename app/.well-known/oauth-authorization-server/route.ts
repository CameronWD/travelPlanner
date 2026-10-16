import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { authServer } from "@/lib/auth/auth";

/**
 * RFC 8414 metadata for the authorisation server, at the root. Better Auth
 * serves it under /api/auth only, so a client that falls back to the bare
 * root path still finds it here (ADR 0071). The issuer is this host's.
 */
export const GET = oauthProviderAuthServerMetadata(authServer);
