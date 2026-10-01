import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
// See lib/auth-dev-login.test.ts for why NextAuth itself is mocked.
vi.mock("next-auth", () => ({ default: vi.fn(() => ({})) }));

type Provider = { id?: string; options?: Record<string, unknown> & { id?: string }; from?: string };

async function loadProviders(env: Record<string, string | undefined>): Promise<Provider[]> {
  vi.resetModules();
  const prev = { ...process.env };
  for (const k of ["AUTH_RESEND_KEY", "AUTH_RESEND_FROM", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]) delete process.env[k];
  Object.assign(process.env, env);
  try {
    const mod = await import("@/lib/auth");
    // `Provider` here is a deliberately minimal shape for the pre-normalization
    // objects @auth/core's provider factories return (see the file-level note
    // below); it isn't assignable to @auth/core's own Provider union (which
    // requires type/name/sendVerificationRequest etc.), so a type predicate
    // against it doesn't type-check — cast through `unknown` instead.
    return mod.authConfig.providers.filter((p) => typeof p !== "function") as unknown as Provider[];
  } finally {
    process.env = prev;
  }
}
const idOf = (p: Provider) => p.options?.id ?? p.id;

describe("Sign-in link provider registration (spec 2026-10-01 §B1)", () => {
  afterEach(() => vi.resetModules());

  it("registers resend only when BOTH AUTH_RESEND_KEY and AUTH_RESEND_FROM are set", async () => {
    expect((await loadProviders({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: "Teepee <signin@teepee.camxanhq.com>" })).map(idOf)).toContain("resend");
    expect((await loadProviders({ AUTH_RESEND_KEY: "re_x" })).map(idOf)).not.toContain("resend");
    expect((await loadProviders({ AUTH_RESEND_FROM: "Teepee <signin@teepee.camxanhq.com>" })).map(idOf)).not.toContain("resend");
    expect((await loadProviders({})).map(idOf)).not.toContain("resend");
  });

  it("sends from AUTH_RESEND_FROM with our own subject and body, through Resend's HTTP API", async () => {
    const providers = await loadProviders({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: "Teepee <signin@teepee.camxanhq.com>" });
    const resend = providers.find((p) => idOf(p) === "resend")!;
    expect(resend.options?.from).toBe("Teepee <signin@teepee.camxanhq.com>");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const send = resend.options!.sendVerificationRequest as (p: Record<string, unknown>) => Promise<void>;
      await send({
        identifier: "cam@example.com",
        url: "https://teepee.camxanhq.com/api/auth/callback/resend?token=t&email=cam%40example.com",
        provider: { apiKey: "re_x", from: "Teepee <signin@teepee.camxanhq.com>" },
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_x");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("Teepee <signin@teepee.camxanhq.com>");
    expect(body.to).toBe("cam@example.com");
    expect(body.subject).toBe("Sign in to Teepee");
    expect(body.html).toContain("Sign in");
    expect(body.text).toContain("https://teepee.camxanhq.com/api/auth/callback/resend");
  });

  it("throws when Resend refuses, so Auth.js reports EmailSignin instead of claiming a send", async () => {
    const providers = await loadProviders({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: "Teepee <signin@teepee.camxanhq.com>" });
    const resend = providers.find((p) => idOf(p) === "resend")!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '{"message":"domain not verified"}' }));
    try {
      const send = resend.options!.sendVerificationRequest as (p: Record<string, unknown>) => Promise<void>;
      await expect(send({ identifier: "cam@example.com", url: "https://x/cb", provider: { apiKey: "re_x", from: "f" } })).rejects.toThrow(/Resend/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("Google allows linking onto a link-first account by email (spec §B2)", async () => {
    const providers = await loadProviders({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" });
    const google = providers.find((p) => idOf(p) === "google")!;
    expect(google.options?.allowDangerousEmailAccountLinking).toBe(true);
  });
});
