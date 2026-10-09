import { describe, expect, it, vi } from "vitest";
import { runMcpToken, type McpTokenScriptDb } from "./mcp-token-run";
import { hashToken } from "../lib/mcp/tokens";

type UserRow = { id: string; email: string };
type TokenRow = {
  id: string;
  userId: string;
  label: string;
  tokenHash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

/** In-memory fake db — only the methods runMcpToken uses. Cast to
 * McpTokenScriptDb at the call site, same pattern as other script tests
 * (e.g. backfill-cover-small-run.test.ts) since a fake delegate is always
 * narrower than the real Prisma one. */
function fakeDb(users: UserRow[], tokens: TokenRow[]) {
  let nextId = 1;
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
        return users.find((u) => u.email === where.email) ?? null;
      }),
    },
    mcpToken: {
      create: vi.fn(async ({ data }: { data: { userId: string; label: string; tokenHash: string } }) => {
        const row: TokenRow = {
          id: `t${nextId++}`,
          userId: data.userId,
          label: data.label,
          tokenHash: data.tokenHash,
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        };
        tokens.push(row);
        return { id: row.id };
      }),
      findMany: vi.fn(async () => {
        return [...tokens]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((t) => ({
            id: t.id,
            label: t.label,
            createdAt: t.createdAt,
            lastUsedAt: t.lastUsedAt,
            revokedAt: t.revokedAt,
            user: { email: users.find((u) => u.id === t.userId)!.email },
          }));
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string; userId?: string; label?: string; revokedAt: null } }) => {
        const row = tokens.find((t) => {
          if (t.revokedAt !== null) return false;
          if (where.id !== undefined && t.id !== where.id) return false;
          if (where.userId !== undefined && t.userId !== where.userId) return false;
          if (where.label !== undefined && t.label !== where.label) return false;
          return true;
        });
        return row ? { id: row.id } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { revokedAt: Date } }) => {
        const row = tokens.find((t) => t.id === where.id);
        if (row) row.revokedAt = data.revokedAt;
        return row;
      }),
    },
  };
  return db as unknown as McpTokenScriptDb;
}

function collectLog() {
  const lines: string[] = [];
  return { log: (s: string) => lines.push(s), lines };
}

describe("runMcpToken", () => {
  it("mints a token for an existing user: creates a row with tokenHash of the printed token, logs it once, returns 0", async () => {
    const users: UserRow[] = [{ id: "u1", email: "a@x" }];
    const tokens: TokenRow[] = [];
    const db = fakeDb(users, tokens);
    const { log, lines } = collectLog();

    const code = await runMcpToken(["--email", "a@x", "--label", "laptop"], { db, log });

    expect(code).toBe(0);
    expect(tokens).toHaveLength(1);
    const printedTokenLine = lines.find((l) => l.startsWith("tp_"));
    expect(printedTokenLine).toBeDefined();
    expect(tokens[0].tokenHash).toBe(hashToken(printedTokenLine!));
    expect(lines.filter((l) => l.startsWith("tp_"))).toHaveLength(1);
  });

  it("unknown email: logs the not-found message, returns 1, creates nothing", async () => {
    const db = fakeDb([], []);
    const { log, lines } = collectLog();

    const code = await runMcpToken(["--email", "nope@x", "--label", "laptop"], { db, log });

    expect(code).toBe(1);
    expect(lines).toContain("No Traveller with that email.");
    expect(db.mcpToken.create).not.toHaveBeenCalled();
  });

  it("refuses a second live token with the same (user, label)", async () => {
    const users: UserRow[] = [{ id: "u1", email: "a@x" }];
    const tokens: TokenRow[] = [
      { id: "t0", userId: "u1", label: "laptop", tokenHash: "x", createdAt: new Date(), lastUsedAt: null, revokedAt: null },
    ];
    const db = fakeDb(users, tokens);
    const { log, lines } = collectLog();

    const code = await runMcpToken(["--email", "a@x", "--label", "laptop"], { db, log });

    expect(code).toBe(1);
    expect(lines).toContain('That Traveller already has a live token labelled "laptop". Revoke it first.');
    expect(db.mcpToken.create).not.toHaveBeenCalled();
  });

  it("--list logs one redacted line per token, never the raw token or its hash", async () => {
    const users: UserRow[] = [{ id: "u1", email: "a@x" }];
    const tokens: TokenRow[] = [
      {
        id: "t1",
        userId: "u1",
        label: "laptop",
        tokenHash: "a".repeat(64),
        createdAt: new Date("2026-10-01T00:00:00Z"),
        lastUsedAt: new Date("2026-10-05T00:00:00Z"),
        revokedAt: null,
      },
      {
        id: "t2",
        userId: "u1",
        label: "phone",
        tokenHash: "b".repeat(64),
        createdAt: new Date("2026-10-02T00:00:00Z"),
        lastUsedAt: null,
        revokedAt: new Date("2026-10-03T00:00:00Z"),
      },
    ];
    const db = fakeDb(users, tokens);
    const { log, lines } = collectLog();

    const code = await runMcpToken(["--list"], { db, log });

    expect(code).toBe(0);
    expect(lines).toContain("t1  a@x  laptop  created 2026-10-01  last used 2026-10-05");
    expect(lines).toContain("t2  a@x  phone  created 2026-10-02  last used never  [revoked]");
    for (const line of lines) {
      expect(line).not.toContain("tp_");
      expect(line).not.toMatch(/[0-9a-f]{64}/);
    }
  });

  it("--revoke <id>: sets revokedAt, returns 0; unknown id returns 1", async () => {
    const users: UserRow[] = [{ id: "u1", email: "a@x" }];
    const tokens: TokenRow[] = [
      { id: "t1", userId: "u1", label: "laptop", tokenHash: "x", createdAt: new Date(), lastUsedAt: null, revokedAt: null },
    ];
    const db = fakeDb(users, tokens);
    const { log } = collectLog();
    const now = new Date("2026-10-09T12:00:00Z");

    const code = await runMcpToken(["--revoke", "t1"], { db, log, now: () => now });

    expect(code).toBe(0);
    expect(tokens[0].revokedAt).toEqual(now);

    const code2 = await runMcpToken(["--revoke", "unknown"], { db, log, now: () => now });
    expect(code2).toBe(1);
  });

  it("no arguments: prints usage, returns 1", async () => {
    const db = fakeDb([], []);
    const { log, lines } = collectLog();

    const code = await runMcpToken([], { db, log });

    expect(code).toBe(1);
    expect(lines.some((l) => l.startsWith("Usage:"))).toBe(true);
  });
});
