import { protectedResourceMetadata } from "@/lib/mcp/oauth";

/** RFC 9728 metadata for /api/mcp, at the root some clients probe (ADR 0071). */
export const GET = (req: Request) => protectedResourceMetadata(req);
