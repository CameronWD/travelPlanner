/**
 * Claude connection tokens (spec 2026-10-09, ADR 0070 amendment). A token is
 * shown once at mint time; only its SHA-256 hash is stored. High-entropy
 * random tokens make a plain (unsalted) hash sufficient.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const TOKEN_PREFIX = "tp_";
const TOUCH_EVERY_MS = 60 * 60 * 1000;

// lib/mcp/acting-traveller.ts owns ActingUser now. Not imported from there:
// acting-traveller-imports.test.ts allowlists that module's importers, and
// this file is deleted in Task 5 anyway.
type ActingUser = { id: string; name: string | null; email: string; image: string | null };
// @ts-expect-error McpToken is gone (ADR 0071); this file is deleted in Task 5.
export type TokenDb = { mcpToken: Pick<PrismaClient["mcpToken"], "findUnique" | "update"> };

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseBearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

export async function verifyToken(
  db: TokenDb,
  token: string,
  now: Date = new Date(),
): Promise<{ user: ActingUser; tokenId: string } | null> {
  const row = await db.mcpToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  if (!row || row.revokedAt) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  }
  return { user: row.user, tokenId: row.id };
}
