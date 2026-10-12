import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthMemoryStore } from "@/test/helpers/auth-memory-store";

// The Sign-in link end to end through the REAL Better Auth instance in
// lib/auth.ts (Better Auth's in-memory adapter in place of Prisma): send the
// link, then click it, with the one door mocked per pass. Pins Review Focus 1
// (a revoked Traveller gets no session) and 2 (a refused new address gets no
// User row) against the real hook wiring.
const { store, decideSignInMock, sendMailMock } = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, unknown>[]>,
  decideSignInMock: vi.fn(),
  sendMailMock: vi.fn(),
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
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMail: sendMailMock }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const BASE = "http://localhost:3000";

async function load() {
  vi.resetModules();
  const prev = { ...process.env };
  for (const k of ["ALLOW_DEV_LOGIN", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "APP_URL", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) delete process.env[k];
  Object.assign(process.env, {
    AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
    AUTH_RESEND_KEY: "re_x",
    AUTH_RESEND_FROM: "Teepee <signin@example.com>",
  });
  try {
    return await import("@/lib/auth");
  } finally {
    process.env = prev;
  }
}

/** Sends a link to `email` (the door admits the send pass) and returns the URL mailed. */
async function sendLink(
  authServer: Awaited<ReturnType<typeof load>>["authServer"],
  email: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await authServer.handler(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, callbackURL: "/trips", errorCallbackURL: "/", ...extra }),
    }),
  );
  expect(res.status).toBe(200);
  const text: string = sendMailMock.mock.calls.at(-1)![0].text;
  return text.match(/https?:\/\/\S+magic-link\/verify\S+/)![0];
}

/** The click pass: the door refuses it. */
const refuseOnClick = () =>
  decideSignInMock.mockImplementation(async ({ email, pass }: { email: string; pass: string }) =>
    pass === "send" ? { allow: true, email } : { allow: false, reason: "refused" },
  );

beforeEach(() => {
  resetAuthMemoryStore(store);
  decideSignInMock.mockReset();
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({ sent: true });
});

describe("GET /api/auth/magic-link/verify", () => {
  it("a refused brand-new address: no User row, and back to the Landing with ?error=AccessDenied (Review Focus 2)", async () => {
    refuseOnClick();
    const { authServer } = await load();
    const url = await sendLink(authServer, "stranger@example.com");

    const res = await authServer.handler(new Request(url));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!, BASE);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("error")).toBe("AccessDenied");
    expect(store.user).toHaveLength(0);
    expect(store.authSession).toHaveLength(0);
    expect(decideSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "stranger@example.com", method: "magic-link", pass: "sign-in" }),
    );
  });

  it("a revoked returning Traveller: no session, and ?error=failed_to_create_session (Review Focus 1)", async () => {
    store.user.push({
      id: "u1",
      email: "revoked@example.com",
      name: "Revoked",
      image: null,
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    refuseOnClick();
    const { authServer } = await load();
    const url = await sendLink(authServer, "revoked@example.com");

    const res = await authServer.handler(new Request(url));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!, BASE);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("error")).toBe("failed_to_create_session");
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/session_token=/);
    expect(store.authSession).toHaveLength(0);
    expect(store.user).toHaveLength(1);
  });

  it("an admitted address signs in and lands on the callback", async () => {
    decideSignInMock.mockImplementation(async ({ email }: { email: string }) => ({ allow: true, email }));
    const { authServer } = await load();
    const url = await sendLink(authServer, "cam@example.com");

    const res = await authServer.handler(new Request(url));
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!, BASE).pathname).toBe("/trips");
    expect(res.headers.get("set-cookie") ?? "").toMatch(/session_token=/);
    expect(store.user).toHaveLength(1);
    expect(store.authSession).toHaveLength(1);
    // Better Auth's emailVerified lands in isEmailVerified; Auth.js's column is untouched.
    expect(store.user[0]).toMatchObject({ isEmailVerified: true });
    expect(store.user[0]).not.toHaveProperty("emailVerified");
  });

  it("a door that throws on the click pass: no User row, and ?error=validation_failed (app/landing/access-denied.ts)", async () => {
    decideSignInMock.mockImplementation(async ({ email, pass }: { email: string; pass: string }) => {
      if (pass === "send") return { allow: true, email };
      throw new Error("door broke");
    });
    const { authServer } = await load();
    const url = await sendLink(authServer, "new@example.com");
    const res = await authServer.handler(new Request(url));
    const location = new URL(res.headers.get("location")!, BASE);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("error")).toBe("validation_failed");
    expect(store.user).toHaveLength(0);
  });

  it("stores only a hash of the link's token, and the link still works", async () => {
    decideSignInMock.mockImplementation(async ({ email }: { email: string }) => ({ allow: true, email }));
    const { authServer } = await load();
    const url = await sendLink(authServer, "cam@example.com");
    const token = new URL(url).searchParams.get("token")!;
    expect(token).toBeTruthy();
    expect(store.authVerification).toHaveLength(1);
    expect(JSON.stringify(store.authVerification[0])).not.toContain(token);

    const res = await authServer.handler(new Request(url));
    expect(new URL(res.headers.get("location")!, BASE).pathname).toBe("/trips");
    expect(store.authSession).toHaveLength(1);
  });

  it("ignores a name sent with the request: whoever types the address does not name the account", async () => {
    decideSignInMock.mockImplementation(async ({ email }: { email: string }) => ({ allow: true, email }));
    const { authServer } = await load();
    const url = await sendLink(authServer, "cam@example.com", { name: "Mallory" });
    await authServer.handler(new Request(url));
    expect(store.user).toHaveLength(1);
    expect(store.user[0].name).toBe("");
  });
});
