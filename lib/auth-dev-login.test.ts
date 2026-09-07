import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
// NextAuth's core package reaches into "next/server" as soon as it's invoked,
// which vitest's jsdom environment can't resolve outside a real Next build.
// Mock the default export so `NextAuth(authConfig)` in lib/auth.ts is a no-op;
// the test only inspects the independently-built `authConfig.providers`.
vi.mock("next-auth", () => ({ default: vi.fn(() => ({})) }));

async function loadProviders(env: Record<string, string | undefined>) {
  vi.resetModules();
  const prev = { ...process.env };
  Object.assign(process.env, env);
  try {
    const mod = await import("@/lib/auth");
    // The installed @auth/core Credentials() factory hardcodes id: "credentials"
    // on the object it returns and stashes our override under `.options.id`;
    // NextAuth() normally reconciles that at runtime, but NextAuth() itself is
    // mocked above (see note), so read the pre-normalization id from `.options`.
    return mod.authConfig.providers.map((p) =>
      typeof p === "function" ? "fn" : ((p as { options?: { id?: string }; id?: string }).options?.id ?? (p as { id?: string }).id),
    );
  } finally {
    process.env = prev;
  }
}

describe("dev login guard", () => {
  afterEach(() => vi.resetModules());

  it("registers dev-login outside production when enabled", async () => {
    const ids = await loadProviders({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" });
    expect(ids).toContain("dev-login");
  });

  it("NEVER registers dev-login in a production build, even when enabled", async () => {
    const ids = await loadProviders({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "production" });
    expect(ids).not.toContain("dev-login");
  });
});
