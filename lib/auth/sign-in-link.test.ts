import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { decideSignInMock, sendMailMock } = vi.hoisted(() => ({
  decideSignInMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
// The real instance initialises eagerly (the MCP OAuth provider seeds its
// resource), so it needs a working database: Better Auth's in-memory one.
vi.mock("@better-auth/prisma-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  const { resetAuthMemoryStore } = await import("@/test/helpers/auth-memory-store");
  return { prismaAdapter: () => memoryAdapter(resetAuthMemoryStore({})) };
});
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
vi.mock("@/lib/auth/prisma", () => ({ withBetterAuthLists: (db: unknown) => db }));
vi.mock("@/lib/auth/sign-in-door", () => ({ decideSignIn: decideSignInMock }));
vi.mock("@/lib/mail", () => ({ sendMail: sendMailMock }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const FROM = "Teepee <signin@teepee.camxanhq.com>";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  const prev = { ...process.env };
  for (const k of ["AUTH_RESEND_KEY", "AUTH_RESEND_FROM", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLOW_DEV_LOGIN"]) delete process.env[k];
  Object.assign(process.env, { AUTH_SECRET: "test-secret-test-secret-test-secret-0123", ...env });
  try {
    return await import("@/lib/auth/auth");
  } finally {
    process.env = prev;
  }
}

type SendMagicLink = (data: { email: string; url: string; token: string }) => Promise<void>;

function magicLinkPlugin(mod: Awaited<ReturnType<typeof load>>) {
  return (mod.authServer.options.plugins ?? []).find((p) => p.id === "magic-link") as
    | { id: string; options: { sendMagicLink: SendMagicLink; expiresIn?: number } }
    | undefined;
}

describe("Sign-in link registration (spec 2026-10-01 §B1)", () => {
  afterEach(() => vi.resetModules());

  it("registers magic-link only when BOTH AUTH_RESEND_KEY and AUTH_RESEND_FROM are set", async () => {
    expect(magicLinkPlugin(await load({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: FROM }))).toBeDefined();
    expect(magicLinkPlugin(await load({ AUTH_RESEND_KEY: "re_x" }))).toBeUndefined();
    expect(magicLinkPlugin(await load({ AUTH_RESEND_FROM: FROM }))).toBeUndefined();
    expect(magicLinkPlugin(await load({}))).toBeUndefined();
  });
});

describe("sendMagicLink", () => {
  beforeEach(() => {
    decideSignInMock.mockReset();
    sendMailMock.mockReset();
  });

  const url = "https://teepee.camxanhq.com/api/auth/magic-link/verify?token=t&callbackURL=%2Ftrips";

  it("asks the one door on the SEND pass, then sends our own mail from AUTH_RESEND_FROM through lib/mail", async () => {
    decideSignInMock.mockResolvedValue({ allow: true, email: "cam@example.com" });
    sendMailMock.mockResolvedValue({ sent: true });
    const plugin = magicLinkPlugin(await load({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: FROM }))!;

    await plugin.options.sendMagicLink({ email: "cam@example.com", url, token: "t" });

    expect(decideSignInMock).toHaveBeenCalledWith({ email: "cam@example.com", method: "magic-link", pass: "send" });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const [message, env] = sendMailMock.mock.calls[0];
    expect(message.to).toBe("cam@example.com");
    expect(message.subject).toBe("Sign in to Teepee");
    expect(message.text).toContain(url);
    expect(env).toEqual({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: FROM });
  });

  it("is not an oracle: a refused address gets no mail and no error (the endpoint answers as for an accepted one)", async () => {
    decideSignInMock.mockResolvedValue({ allow: false, reason: "refused" });
    const plugin = magicLinkPlugin(await load({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: FROM }))!;

    await expect(plugin.options.sendMagicLink({ email: "stranger@example.com", url, token: "t" })).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("throws when Resend refuses, so the endpoint reports the failed send instead of claiming one", async () => {
    decideSignInMock.mockResolvedValue({ allow: true, email: "cam@example.com" });
    sendMailMock.mockResolvedValue({ sent: false, error: "Resend 403: domain not verified" });
    const plugin = magicLinkPlugin(await load({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: FROM }))!;

    await expect(plugin.options.sendMagicLink({ email: "cam@example.com", url, token: "t" })).rejects.toThrow(/Resend/);
  });
});

describe("Google registration", () => {
  afterEach(() => vi.resetModules());

  it("registers google only when BOTH AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set", async () => {
    expect((await load({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" })).authServer.options.socialProviders?.google).toMatchObject({
      clientId: "id",
      clientSecret: "s",
    });
    expect((await load({ AUTH_GOOGLE_ID: "id" })).authServer.options.socialProviders?.google).toBeUndefined();
    expect((await load({ AUTH_GOOGLE_SECRET: "s" })).authServer.options.socialProviders?.google).toBeUndefined();
  });

  it("links Google onto a link-first account by email (spec §B2); verification is enforced by the door", async () => {
    const { authServer } = await load({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" });
    expect(authServer.options.account?.accountLinking).toMatchObject({ enabled: true, trustedProviders: ["google"] });
  });
});
