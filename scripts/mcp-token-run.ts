/**
 * Core of `npm run mcp:token` (spec 2026-10-09). Takes its db and logger as
 * arguments so it is testable without a database; scripts/mcp-token.ts is the
 * thin entry that loads .env.production.local and passes the real client.
 */
import type { PrismaClient } from "@prisma/client";
import { generateToken, hashToken } from "../lib/mcp/tokens";

export type McpTokenScriptDb = {
  user: Pick<PrismaClient["user"], "findUnique">;
  mcpToken: Pick<PrismaClient["mcpToken"], "create" | "findMany" | "findFirst" | "update">;
};

const USAGE = [
  "Usage:",
  "  npm run mcp:token -- --email <email> --label <label>   mint a token (shown once)",
  "  npm run mcp:token -- --list                            list tokens",
  "  npm run mcp:token -- --revoke <id>                     revoke a token",
].join("\n");

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");

export async function runMcpToken(
  argv: string[],
  deps: { db: McpTokenScriptDb; log: (s: string) => void; now?: () => Date },
): Promise<number> {
  const { db, log } = deps;
  const now = deps.now ?? (() => new Date());

  if (argv.includes("--list")) {
    const rows = await db.mcpToken.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true, user: { select: { email: true } } },
    });
    if (rows.length === 0) log("No tokens.");
    for (const r of rows) {
      log(`${r.id}  ${r.user.email}  ${r.label}  created ${day(r.createdAt)}  last used ${day(r.lastUsedAt)}${r.revokedAt ? "  [revoked]" : ""}`);
    }
    return 0;
  }

  const revokeId = arg(argv, "--revoke");
  if (revokeId) {
    const row = await db.mcpToken.findFirst({ where: { id: revokeId, revokedAt: null }, select: { id: true } });
    if (!row) {
      log("No live token with that id.");
      return 1;
    }
    await db.mcpToken.update({ where: { id: row.id }, data: { revokedAt: now() } });
    log(`Revoked ${row.id}.`);
    return 0;
  }

  const email = arg(argv, "--email")?.trim().toLowerCase();
  const label = arg(argv, "--label")?.trim();
  if (!email || !label) {
    log(USAGE);
    return 1;
  }
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    log("No Traveller with that email.");
    return 1;
  }
  const clash = await db.mcpToken.findFirst({ where: { userId: user.id, label, revokedAt: null }, select: { id: true } });
  if (clash) {
    log(`That Traveller already has a live token labelled "${label}". Revoke it first.`);
    return 1;
  }
  const token = generateToken();
  const row = await db.mcpToken.create({ data: { userId: user.id, label, tokenHash: hashToken(token) }, select: { id: true } });
  log(`Minted ${row.id} for ${email} (${label}). Copy it now, it is not shown again:`);
  log(token);
  return 0;
}
