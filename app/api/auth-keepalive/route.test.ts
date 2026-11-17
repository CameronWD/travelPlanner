import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetAuthMemoryStore } from "@/test/helpers/auth-memory-store";

// The REAL Better Auth instance from lib/auth/auth.ts on its in-memory
// adapter (as in lib/auth/dev-login.test.ts), so getSession's refresh rule and
// the cookie cache run for real. next/headers is faked with Next's own cookie
// classes, so the Set-Cookie lines below are serialised exactly as Next would.
const { store, current } = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, unknown>[]>,
  current: { req: new Headers(), res: new Headers() },
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
vi.mock("@/lib/auth/prisma", () => ({ withBetterAuthLists: (db: unknown) => db }));
vi.mock("@/lib/auth/sign-in-door", () => ({
  decideSignIn: vi.fn(async ({ email }: { email: string }) => ({ allow: true, email })),
}));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("next/headers", async () => {
  const { ResponseCookies } = await import("next/dist/compiled/@edge-runtime/cookies");
  return {
    headers: vi.fn(async () => current.req),
    cookies: vi.fn(async () => {
      const write = new ResponseCookies(current.res);
      return { set: write.set.bind(write) };
    }),
  };
});

const BASE = "http://localhost:3000";
const DAY = 24 * 60 * 60;

async function load() {
  vi.resetModules();
  const prev = { ...process.env };
  for (const k of ["AUTH_RESEND_KEY", "AUTH_RESEND_FROM", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "APP_URL", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) delete process.env[k];
  Object.assign(process.env, { AUTH_SECRET: "test-secret-test-secret-test-secret-0123", ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" });
  try {
    const { authServer } = await import("@/lib/auth/auth");
    const { POST } = await import("./route");
    return { authServer, POST };
  } finally {
    process.env = prev;
  }
}

type Loaded = Awaited<ReturnType<typeof load>>;

async function signIn({ authServer }: Loaded): Promise<string> {
  const res = await authServer.handler(
    new Request(`${BASE}/api/auth/dev-login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email: "seeded@example.com" }),
    }),
  );
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function keepalive({ POST }: Loaded, cookie?: string) {
  current.req = new Headers(cookie ? { cookie } : {});
  current.res = new Headers();
  const res = await POST(new NextRequest(`${BASE}/api/auth-keepalive`, { method: "POST", headers: current.req }));
  const sessionCookie = current.res.getSetCookie().find((c) => c.startsWith("better-auth.session_token="));
  const maxAge = Number(sessionCookie?.match(/Max-Age=(\d+)/i)?.[1]);
  return { res, sessionCookie, maxAge };
}

async function resolvedUserId({ authServer }: Loaded, sessionCookie: string) {
  const session = await authServer.api.getSession({
    headers: new Headers({ cookie: sessionCookie.split(";")[0] }),
    query: { disableCookieCache: true },
  });
  return session?.user.id;
}

const row = () => store.authSession[0] as { expiresAt: Date; updatedAt: Date };
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY * 1000);

beforeEach(() => {
  resetAuthMemoryStore(store);
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
afterEach(() => vi.resetModules());

describe("POST /api/auth-keepalive", () => {
  it("answers 401 when signed out, and sets no cookie", async () => {
    const { res, sessionCookie } = await keepalive(await load());
    expect(res.status).toBe(401);
    expect(sessionCookie).toBeUndefined();
  });

  it("renews a session 100 days from expiry to 120 days, row and cookie, past a fresh cookie cache", async () => {
    const mod = await load();
    const cookie = await signIn(mod);
    expect(cookie).toMatch(/better-auth\.session_data=/);
    row().expiresAt = daysFromNow(100);
    row().updatedAt = daysFromNow(-20);

    const { res, sessionCookie, maxAge } = await keepalive(mod, cookie);
    expect(res.status).toBe(204);
    expect(row().expiresAt.getTime()).toBeGreaterThan(daysFromNow(110).getTime());
    expect(maxAge).toBeGreaterThan(110 * DAY);
    expect(await resolvedUserId(mod, sessionCookie!)).toBe("u1");
  });

  it("re-issues the cookie to the row's expiry when the row was already renewed today (a page load's write was lost)", async () => {
    const mod = await load();
    const cookie = await signIn(mod);
    const renewedAnHourAgo = new Date(daysFromNow(120).getTime() - 60 * 60 * 1000);
    row().expiresAt = renewedAnHourAgo;
    row().updatedAt = new Date(Date.now() - 60 * 60 * 1000);

    const { res, sessionCookie, maxAge } = await keepalive(mod, cookie);
    expect(res.status).toBe(204);
    expect(sessionCookie).toMatch(/; Path=\/(;|$)/);
    expect(sessionCookie).toMatch(/; HttpOnly(;|$)/);
    expect(sessionCookie).toMatch(/; SameSite=lax(;|$)/);
    expect(row().expiresAt).toEqual(renewedAnHourAgo);
    expect(maxAge).toBeGreaterThan(110 * DAY);
    expect(Math.abs(maxAge - (renewedAnHourAgo.getTime() - Date.now()) / 1000)).toBeLessThan(5);
  });

  it("re-issues a cookie Better Auth still accepts (the signed value survives the round trip)", async () => {
    const mod = await load();
    const cookie = await signIn(mod);

    const { sessionCookie } = await keepalive(mod, cookie);
    expect(await resolvedUserId(mod, sessionCookie!)).toBe("u1");
  });
});
