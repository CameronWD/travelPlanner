import { afterEach, describe, expect, it, vi } from "vitest";

const {
  allowedEmailFindUniqueMock,
  allowedEmailUpsertMock,
  inviteFindFirstMock,
  globeInviteFindFirstMock,
  recordAccessRequestMock,
  notifyAdminsMock,
} = vi.hoisted(() => ({
  allowedEmailFindUniqueMock: vi.fn(),
  allowedEmailUpsertMock: vi.fn(),
  inviteFindFirstMock: vi.fn(),
  globeInviteFindFirstMock: vi.fn(),
  recordAccessRequestMock: vi.fn(),
  notifyAdminsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    allowedEmail: { findUnique: allowedEmailFindUniqueMock, upsert: allowedEmailUpsertMock },
    invite: { findFirst: inviteFindFirstMock },
    globeInvite: { findFirst: globeInviteFindFirstMock },
  },
}));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
vi.mock("@/lib/access-requests", () => ({ recordAccessRequest: recordAccessRequestMock }));
vi.mock("@/lib/admin-notify", () => ({ notifyAdmins: notifyAdminsMock }));
// See lib/auth-dev-login.test.ts: NextAuth's core package reaches into
// "next/server" as soon as it's invoked, which vitest's jsdom environment
// can't resolve outside a real Next build. Mock the default export so
// `NextAuth(authConfig)` in lib/auth.ts is a no-op; the test only exercises
// the independently-built `authConfig.callbacks.signIn`.
vi.mock("next-auth", () => ({ default: vi.fn(() => ({})) }));

import { authConfig } from "@/lib/auth";

const signInCallback = authConfig.callbacks!.signIn!;

const ORIGINAL_ALLOWED_EMAILS = process.env.ALLOWED_EMAILS;

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_ALLOWED_EMAILS === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = ORIGINAL_ALLOWED_EMAILS;
});

describe("authConfig.pages", () => {
  // Fix round 1: AccessDenied (thrown when signIn returns false) has no
  // `kind: "signIn"`, so Auth.js resolves its redirect against
  // `pages.error`, not `pages.signIn`. Without `error` also pointed at
  // /signin, a refused Traveller lands on Auth.js's unbranded 403 instead of
  // the explanatory card — pin the coupling so it can't regress silently.
  it("routes BOTH signIn and error to /signin", () => {
    expect(authConfig.pages).toEqual({ signIn: "/signin", error: "/signin" });
  });
});

describe("signIn callback", () => {
  it("admits a Traveller holding an unexpired pending Trip Invite, and promotes them into AllowedEmail", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    inviteFindFirstMock.mockResolvedValue({ id: "inv1" });

    await expect(
      signInCallback({
        user: { email: "invited@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(true);

    // CRITICAL (fix round 1): admission by Invite must write a durable
    // AllowedEmail row, not just admit this one sign-in — see
    // admitByTripInvite's doc comment in lib/allowlist.ts for why.
    expect(allowedEmailUpsertMock).toHaveBeenCalledWith({
      where: { email: "invited@example.com" },
      update: {},
      create: { email: "invited@example.com", note: "admitted by Trip Invite" },
    });

    // NEW REQUIREMENT: growth by Invite must be visible, not silent — the
    // first admission notifies admins.
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.stringContaining("invitation"),
      expect.stringContaining("invited@example.com"),
      expect.any(String),
    );
  });

  it("stays admitted on a SECOND sign-in after the Invite has been accepted (the one-shot-ticket lifecycle bug)", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    inviteFindFirstMock.mockResolvedValue({ id: "inv1" });

    // First sign-in: admitted via the pending Invite.
    await expect(
      signInCallback({
        user: { email: "invited@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(true);
    expect(allowedEmailUpsertMock).toHaveBeenCalledTimes(1);
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1);

    // events.signIn / app/(app)/layout.tsx mark the Invite accepted right
    // after — so hasPendingTripInvite would now say false — but the upsert
    // above landed, so isAllowedEmail says true instead.
    inviteFindFirstMock.mockResolvedValue(null);
    allowedEmailFindUniqueMock.mockResolvedValue({ email: "invited@example.com" });

    await expect(
      signInCallback({
        user: { email: "invited@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(true);
    // No second promotion needed — isAllowedEmail short-circuits first.
    expect(allowedEmailUpsertMock).toHaveBeenCalledTimes(1);
    // And no re-notification either — still just the one, from admission.
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT admit on a Globe Invite", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    inviteFindFirstMock.mockResolvedValue(null);
    globeInviteFindFirstMock.mockResolvedValue({ id: "gi1" });

    await expect(
      signInCallback({
        user: { email: "globe-invited@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);

    // hasPendingTripInvite is Trip-only — it must never consult GlobeInvite.
    expect(globeInviteFindFirstMock).not.toHaveBeenCalled();

    // Task 14: the refusal records (or bumps) an Access request, from
    // Google's verified profile.
    expect(recordAccessRequestMock).toHaveBeenCalledWith({
      email: "globe-invited@example.com",
      name: null,
      image: null,
    });
  });

  it("refuses Google sign-in when the email is not verified, and does NOT record an Access request", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue({ email: "cam@example.com" });

    await expect(
      signInCallback({
        user: { email: "cam@example.com" },
        account: { provider: "google" },
        profile: { email_verified: false },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);

    // An Access request must only ever come from a VERIFIED profile —
    // recording one for an unverified email would let anyone squat on an
    // address they don't control.
    expect(recordAccessRequestMock).not.toHaveBeenCalled();
  });

  it("refuses Google sign-in when profile.email_verified is missing entirely, and does NOT record an Access request", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue({ email: "cam@example.com" });

    await expect(
      signInCallback({
        user: { email: "cam@example.com" },
        account: { provider: "google" },
        profile: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);

    expect(recordAccessRequestMock).not.toHaveBeenCalled();
  });

  it("lets the dev-login provider through outside production", async () => {
    const prevEnv = process.env.NODE_ENV;
    // @ts-expect-error -- NODE_ENV is typed readonly; tests still need to set it.
    process.env.NODE_ENV = "test";
    try {
      await expect(
        signInCallback({
          user: { email: "you@example.com" },
          account: { provider: "dev-login" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).resolves.toBe(true);
    } finally {
      // @ts-expect-error -- see above.
      process.env.NODE_ENV = prevEnv;
    }

    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
    expect(inviteFindFirstMock).not.toHaveBeenCalled();
  });

  it("MINOR fix: refuses the dev-login provider outright in production, belt-and-braces with lib/auth.ts:36's registration guard", async () => {
    const prevEnv = process.env.NODE_ENV;
    // @ts-expect-error -- see above.
    process.env.NODE_ENV = "production";
    try {
      await expect(
        signInCallback({
          user: { email: "you@example.com" },
          account: { provider: "dev-login" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).resolves.toBe(false);
    } finally {
      // @ts-expect-error -- see above.
      process.env.NODE_ENV = prevEnv;
    }
  });

  it("admits via ALLOWED_EMAILS alone, without a table row or invite", async () => {
    process.env.ALLOWED_EMAILS = "cam@example.com";
    inviteFindFirstMock.mockResolvedValue(null);

    await expect(
      signInCallback({
        user: { email: "cam@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(true);

    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
  });

  it("refuses an unlisted, uninvited email, and records an Access request from the verified profile", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    inviteFindFirstMock.mockResolvedValue(null);

    await expect(
      signInCallback({
        user: { email: "stranger@example.com" },
        account: { provider: "google" },
        profile: {
          email_verified: true,
          name: "Stranger Person",
          picture: "https://example.com/pic.jpg",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);

    expect(recordAccessRequestMock).toHaveBeenCalledWith({
      email: "stranger@example.com",
      name: "Stranger Person",
      image: "https://example.com/pic.jpg",
    });
  });

  it("refuses when the user has no email at all, without recording an Access request", async () => {
    await expect(
      signInCallback({
        user: { email: null },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);

    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
    expect(recordAccessRequestMock).not.toHaveBeenCalled();
  });

  it("fails closed: rejects rather than admitting when the allowlist lookup throws", async () => {
    allowedEmailFindUniqueMock.mockRejectedValue(new Error("db down"));

    await expect(
      signInCallback({
        user: { email: "cam@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).rejects.toThrow("db down");
  });

  it("verification is enforced fail-closed by construction: a hypothetical future non-dev-login provider without email_verified: true is refused", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue({ email: "cam@example.com" });

    await expect(
      signInCallback({
        user: { email: "cam@example.com" },
        account: { provider: "some-future-oauth-provider" },
        profile: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);
  });
});
