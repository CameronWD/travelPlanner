import { afterEach, describe, expect, it, vi } from "vitest";

const { allowedEmailFindUniqueMock, inviteFindFirstMock, globeInviteFindFirstMock } =
  vi.hoisted(() => ({
    allowedEmailFindUniqueMock: vi.fn(),
    inviteFindFirstMock: vi.fn(),
    globeInviteFindFirstMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    allowedEmail: { findUnique: allowedEmailFindUniqueMock },
    invite: { findFirst: inviteFindFirstMock },
    globeInvite: { findFirst: globeInviteFindFirstMock },
  },
}));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
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

describe("signIn callback", () => {
  it("admits a Traveller holding an unexpired pending Trip Invite", async () => {
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
  });

  it("refuses Google sign-in when the email is not verified", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue({ email: "cam@example.com" });

    await expect(
      signInCallback({
        user: { email: "cam@example.com" },
        account: { provider: "google" },
        profile: { email_verified: false },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);
  });

  it("refuses Google sign-in when profile.email_verified is missing entirely", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue({ email: "cam@example.com" });

    await expect(
      signInCallback({
        user: { email: "cam@example.com" },
        account: { provider: "google" },
        profile: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);
  });

  it("lets the dev-login provider through untouched", async () => {
    await expect(
      signInCallback({
        user: { email: "you@example.com" },
        account: { provider: "dev-login" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(true);

    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
    expect(inviteFindFirstMock).not.toHaveBeenCalled();
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

  it("refuses an unlisted, uninvited email", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    inviteFindFirstMock.mockResolvedValue(null);

    await expect(
      signInCallback({
        user: { email: "stranger@example.com" },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);
  });

  it("refuses when the user has no email at all", async () => {
    await expect(
      signInCallback({
        user: { email: null },
        account: { provider: "google" },
        profile: { email_verified: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);

    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
  });
});
