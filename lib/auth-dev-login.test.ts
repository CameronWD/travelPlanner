import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthMemoryStore } from "@/test/helpers/auth-memory-store";

// The dev-login door end to end through the REAL Better Auth instance in
// lib/auth.ts: only the Prisma adapter is swapped for Better Auth's own
// in-memory adapter, so the plugin endpoint, the session hooks (which must
// recognise a dev-login session and not run the allowlist on it) and the
// session cookie are all exercised for real.
const { store, decideSignInMock, acceptPendingInvitesMock } = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, unknown>[]>,
  decideSignInMock: vi.fn(),
  acceptPendingInvitesMock: vi.fn(),
}));

vi.mock("@better-auth/prisma-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const { resetAuthMemoryStore } = await import("@/test/helpers/auth-memory-store");
  resetAuthMemoryStore(store);
  return { prismaAdapter: () => memoryAdapter(store) };
});
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => store.user.find((u) => u.id === where.id) ?? null),
    },
  },
}));
vi.mock("@/lib/auth-prisma", () => ({ withBetterAuthLists: (db: unknown) => db }));
vi.mock("@/lib/sign-in-door", () => ({ decideSignIn: decideSignInMock }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: acceptPendingInvitesMock }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const BASE = "http://localhost:3000";

const resetStore = () => resetAuthMemoryStore(store);

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  const prev = { ...process.env };
  for (const k of ["ALLOW_DEV_LOGIN", "AUTH_RESEND_KEY", "AUTH_RESEND_FROM", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "APP_URL", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) delete process.env[k];
  Object.assign(process.env, { AUTH_SECRET: "test-secret-test-secret-test-secret-0123", ...env });
  try {
    return await import("@/lib/auth");
  } finally {
    process.env = prev;
  }
}

const pluginIds = (mod: Awaited<ReturnType<typeof load>>) => (mod.authServer.options.plugins ?? []).map((p) => p.id);

function devLoginRequest(email: string, base = BASE, origin = base) {
  return new Request(`${base}/api/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email }),
  });
}

describe("dev login guard", () => {
  afterEach(() => vi.resetModules());

  it("registers dev-login outside production when enabled", async () => {
    expect(pluginIds(await load({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" }))).toContain("dev-login");
  });

  it("NEVER registers dev-login in a production build, even when enabled", async () => {
    expect(pluginIds(await load({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "production" }))).not.toContain("dev-login");
  });

  it("does not register dev-login unless ALLOW_DEV_LOGIN is exactly \"true\"", async () => {
    expect(pluginIds(await load({ NODE_ENV: "test" }))).not.toContain("dev-login");
    expect(pluginIds(await load({ ALLOW_DEV_LOGIN: "1", NODE_ENV: "test" }))).not.toContain("dev-login");
  });
});

describe("POST /api/auth/dev-login", () => {
  beforeEach(() => {
    resetStore();
    decideSignInMock.mockReset();
    acceptPendingInvitesMock.mockReset();
    decideSignInMock.mockImplementation(async ({ email }: { email: string }) => ({ allow: true, email }));
    store.user.push({
      id: "u1",
      email: "seeded@example.com",
      name: "Seeded",
      image: null,
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("signs a seeded Traveller in by email (any case), and the cookie it sets is a live session", async () => {
    const { authServer } = await load({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" });
    const res = await authServer.handler(devLoginRequest("  Seeded@Example.COM "));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/better-auth\.session_token=/);

    const cookie = setCookie
      .split(/,(?=\s*[\w.-]+=)/)
      .map((c) => c.split(";")[0].trim())
      .join("; ");
    const session = await authServer.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user).toMatchObject({ id: "u1", email: "seeded@example.com" });
  });

  it("runs the one door as dev-login (never the allowlist) and accepts pending invites after", async () => {
    const { authServer } = await load({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" });
    await authServer.handler(devLoginRequest("seeded@example.com"));
    expect(decideSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "seeded@example.com", method: "dev-login", pass: "sign-in" }),
    );
    expect(acceptPendingInvitesMock).toHaveBeenCalledWith("u1", "seeded@example.com");
  });

  it("refuses an address with no User row, without creating one", async () => {
    const { authServer } = await load({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" });
    const res = await authServer.handler(devLoginRequest("nobody@example.com"));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/session_token=/);
    expect(store.user).toHaveLength(1);
    expect(store.authSession).toHaveLength(0);
  });

  it("sets no cookie when the session hook refuses", async () => {
    decideSignInMock.mockResolvedValue({ allow: false, reason: "dev-login-in-production" });
    const { authServer } = await load({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" });
    const res = await authServer.handler(devLoginRequest("seeded@example.com"));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/session_token=/);
    expect(store.authSession).toHaveLength(0);
  });

  it("refuses with FORBIDDEN in production even when the plugin is registered (belt-and-braces)", async () => {
    const { authServer } = await load({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" });
    const prev = process.env.NODE_ENV;
    // @ts-expect-error -- NODE_ENV is typed readonly; the endpoint reads it per request.
    process.env.NODE_ENV = "production";
    try {
      const res = await authServer.handler(devLoginRequest("seeded@example.com"));
      expect(res.status).toBe(403);
      expect(res.headers.get("set-cookie") ?? "").not.toMatch(/session_token=/);
    } finally {
      // @ts-expect-error -- see above.
      process.env.NODE_ENV = prev;
    }
    expect(store.authSession).toHaveLength(0);
    expect(decideSignInMock).not.toHaveBeenCalled();
  });
});

describe("hosts (beta and Vercel previews)", () => {
  // Better Auth skips its origin check when NODE_ENV is "test" (fixed when it
  // first loads), so these ask the instance's own trusted-origin predicate,
  // which is exactly what that check consults.
  const trusts = async (mod: Awaited<ReturnType<typeof load>>, origin: string) =>
    (await mod.authServer.$context).isTrustedOrigin(origin);

  it("trusts the deployment's own VERCEL_URL host when that env is set", async () => {
    const mod = await load({ NODE_ENV: "test", VERCEL_URL: "teepee-abc123.vercel.app" });
    expect(await trusts(mod, "https://teepee-abc123.vercel.app")).toBe(true);
  });

  it("trusts VERCEL_BRANCH_URL (beta) and the production host from siteUrl()", async () => {
    const mod = await load({
      NODE_ENV: "test",
      VERCEL_BRANCH_URL: "teepee-git-beta.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "teepee.camxanhq.com",
    });
    expect(await trusts(mod, "https://teepee-git-beta.vercel.app")).toBe(true);
    expect(await trusts(mod, "https://teepee.camxanhq.com")).toBe(true);
  });

  it("does not trust a cross-site origin, or a preview host that is not this deployment", async () => {
    const mod = await load({ NODE_ENV: "test", VERCEL_URL: "teepee-abc123.vercel.app" });
    expect(await trusts(mod, "https://evil.example")).toBe(false);
    expect(await trusts(mod, "https://someone-else.vercel.app")).toBe(false);
  });
});
