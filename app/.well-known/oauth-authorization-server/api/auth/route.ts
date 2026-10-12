import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { authServer } from "@/lib/auth";

/**
 * RFC 8414 metadata for the issuer `<host>/api/auth`, at the path-inserted
 * URL RFC 8414 §3.1 tells clients to fetch (ADR 0071).
 */
export const GET = oauthProviderAuthServerMetadata(authServer);
