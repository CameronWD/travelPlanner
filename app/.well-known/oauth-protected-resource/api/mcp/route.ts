import { protectedResourceMetadata } from "@/lib/mcp/oauth";

/**
 * RFC 9728 metadata for /api/mcp, at the path-aware URL that /api/mcp's
 * 401 challenge points Claude to (ADR 0071).
 */
export const GET = (req: Request) => protectedResourceMetadata(req);
