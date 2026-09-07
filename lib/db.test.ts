import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("@prisma/client", () => ({ PrismaClient: class {} }));

describe("lib/db", () => {
  it("throws a named, actionable error when DATABASE_URL is missing", async () => {
    vi.resetModules();
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(import("@/lib/db")).rejects.toThrow(/DATABASE_URL/);
    } finally {
      process.env.DATABASE_URL = prev;
    }
  });
});
