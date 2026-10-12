import { describe, expect, it, vi } from "vitest";

// sign-in-door.ts's default deps import the real lib/allowlist.ts,
// lib/admin-notify.ts and lib/access-requests.ts, all of which import
// lib/db.ts — which throws at import time without DATABASE_URL set. Every
// test below injects its own deps mocks and never exercises the real
// functions, so a trivial db stub is enough to let the import chain resolve
// (same idiom as lib/auth.test.ts).
vi.mock("@/lib/db", () => ({ db: {} }));
const { reportErrorMock } = vi.hoisted(() => ({ reportErrorMock: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

import { decideSignIn, type DoorDeps } from "@/lib/sign-in-door";

function makeDeps(overrides: Partial<DoorDeps> = {}): DoorDeps {
  return {
    isAllowedEmail: vi.fn().mockResolvedValue(false),
    hasPendingTripInvite: vi.fn().mockResolvedValue(false),
    admitByTripInvite: vi.fn().mockResolvedValue({ created: false }),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    recordAccessRequest: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("decideSignIn", () => {
  it("admits a Traveller holding an unexpired pending Trip Invite, and promotes them into AllowedEmail", async () => {
    const deps = makeDeps({
      isAllowedEmail: vi.fn().mockResolvedValue(false),
      hasPendingTripInvite: vi.fn().mockResolvedValue(true),
      admitByTripInvite: vi.fn().mockResolvedValue({ created: true }),
    });

    await expect(
      decideSignIn(
        {
          email: "invited@example.com",
          method: "google",
          pass: "sign-in",
          profile: { email_verified: true },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: true, email: "invited@example.com" });

    expect(deps.admitByTripInvite).toHaveBeenCalledWith("invited@example.com");
    // NEW REQUIREMENT: growth by Invite must be visible, not silent — the
    // first admission notifies admins.
    expect(deps.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(deps.notifyAdmins).toHaveBeenCalledWith(
      expect.stringContaining("invitation"),
      expect.stringContaining("invited@example.com"),
      expect.any(String),
    );
  });

  it("stays admitted on a SECOND sign-in after the Invite has been accepted (the one-shot-ticket lifecycle bug)", async () => {
    const isAllowedEmail = vi.fn();
    const hasPendingTripInvite = vi.fn();
    const admitByTripInvite = vi.fn().mockResolvedValue({ created: true });
    const notifyAdmins = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ isAllowedEmail, hasPendingTripInvite, admitByTripInvite, notifyAdmins });

    isAllowedEmail.mockResolvedValue(false);
    hasPendingTripInvite.mockResolvedValue(true);

    await expect(
      decideSignIn(
        {
          email: "invited@example.com",
          method: "google",
          pass: "sign-in",
          profile: { email_verified: true },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: true, email: "invited@example.com" });
    expect(admitByTripInvite).toHaveBeenCalledTimes(1);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);

    // events.signIn / app layout mark the Invite accepted right after — so
    // hasPendingTripInvite would now say false — but the upsert above
    // landed, so isAllowedEmail says true instead.
    hasPendingTripInvite.mockResolvedValue(false);
    isAllowedEmail.mockResolvedValue(true);

    await expect(
      decideSignIn(
        {
          email: "invited@example.com",
          method: "google",
          pass: "sign-in",
          profile: { email_verified: true },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: true, email: "invited@example.com" });
    // No second promotion needed — isAllowedEmail short-circuits first.
    expect(admitByTripInvite).toHaveBeenCalledTimes(1);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it("does NOT admit on a Globe Invite (hasPendingTripInvite is Trip-only, so false here means refused)", async () => {
    const deps = makeDeps();

    await expect(
      decideSignIn(
        {
          email: "globe-invited@example.com",
          method: "google",
          pass: "sign-in",
          profile: { email_verified: true },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: false, reason: "refused" });

    expect(deps.recordAccessRequest).toHaveBeenCalledWith({
      email: "globe-invited@example.com",
      name: null,
      image: null,
    });
  });

  it("refuses Google sign-in when the email is not verified, and does NOT record an Access request", async () => {
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockResolvedValue(true) });

    await expect(
      decideSignIn(
        {
          email: "cam@example.com",
          method: "google",
          pass: "sign-in",
          profile: { email_verified: false },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: false, reason: "unverified" });

    expect(deps.recordAccessRequest).not.toHaveBeenCalled();
  });

  it("refuses Google sign-in when profile.email_verified is missing entirely, and does NOT record an Access request", async () => {
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockResolvedValue(true) });

    await expect(
      decideSignIn(
        { email: "cam@example.com", method: "google", pass: "sign-in", profile: {} },
        deps,
      ),
    ).resolves.toEqual({ allow: false, reason: "unverified" });

    expect(deps.recordAccessRequest).not.toHaveBeenCalled();
  });

  it("lets dev-login through outside production", async () => {
    const deps = makeDeps();

    await expect(
      decideSignIn(
        { email: "you@example.com", method: "dev-login", pass: "sign-in", nodeEnv: "test" },
        deps,
      ),
    ).resolves.toEqual({ allow: true, email: "you@example.com" });

    expect(deps.isAllowedEmail).not.toHaveBeenCalled();
    expect(deps.hasPendingTripInvite).not.toHaveBeenCalled();
  });

  it("refuses dev-login outright in production, belt-and-braces with the provider registration guard", async () => {
    const deps = makeDeps();

    await expect(
      decideSignIn(
        { email: "you@example.com", method: "dev-login", pass: "sign-in", nodeEnv: "production" },
        deps,
      ),
    ).resolves.toEqual({ allow: false, reason: "dev-login-in-production" });
  });

  it("admits via ALLOWED_EMAILS alone, without a table row or invite (isAllowedEmail owns that, decideSignIn just calls it)", async () => {
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockResolvedValue(true) });

    await expect(
      decideSignIn(
        {
          email: "cam@example.com",
          method: "google",
          pass: "sign-in",
          profile: { email_verified: true },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: true, email: "cam@example.com" });

    expect(deps.hasPendingTripInvite).not.toHaveBeenCalled();
  });

  it("refuses an unlisted, uninvited email, and records an Access request from the verified profile", async () => {
    const deps = makeDeps();

    await expect(
      decideSignIn(
        {
          email: "stranger@example.com",
          method: "google",
          pass: "sign-in",
          profile: {
            email_verified: true,
            name: "Stranger Person",
            picture: "https://example.com/pic.jpg",
          },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: false, reason: "refused" });

    expect(deps.recordAccessRequest).toHaveBeenCalledWith({
      email: "stranger@example.com",
      name: "Stranger Person",
      image: "https://example.com/pic.jpg",
    });
  });

  it("refuses when there is no email at all, without recording an Access request", async () => {
    const deps = makeDeps();

    await expect(
      decideSignIn(
        { email: null, method: "google", pass: "sign-in", profile: { email_verified: true } },
        deps,
      ),
    ).resolves.toEqual({ allow: false, reason: "no-email" });

    expect(deps.isAllowedEmail).not.toHaveBeenCalled();
    expect(deps.recordAccessRequest).not.toHaveBeenCalled();
  });

  it("fails closed: refuses rather than admitting when the allowlist lookup throws", async () => {
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockRejectedValue(new Error("db down")) });

    await expect(
      decideSignIn(
        {
          email: "cam@example.com",
          method: "google",
          pass: "sign-in",
          profile: { email_verified: true },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: false, reason: "refused" });
  });

  it("reports an allowlist lookup failure to the error sink, so an outage is visible rather than a silent flood of refusals", async () => {
    reportErrorMock.mockClear();
    const boom = new Error("db down");
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockRejectedValue(boom) });

    await expect(
      decideSignIn({ email: "cam@example.com", method: "magic-link", pass: "sign-in" }, deps),
    ).resolves.toEqual({ allow: false, reason: "refused" });

    expect(reportErrorMock).toHaveBeenCalledWith(boom, { source: "server", route: "sign-in-door" });
    expect(deps.recordAccessRequest).not.toHaveBeenCalled();
  });

  it("verification is enforced fail-closed by construction: a hypothetical future non-dev-login, non-magic-link method without email_verified: true is refused", async () => {
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockResolvedValue(true) });

    await expect(
      // "google" stands in for "any future OAuth method" here — decideSignIn
      // only special-cases "magic-link" and "dev-login".
      decideSignIn({ email: "cam@example.com", method: "google", pass: "sign-in", profile: {} }, deps),
    ).resolves.toEqual({ allow: false, reason: "unverified" });
  });

  // ── Sign-in link (method "magic-link"), spec 2026-10-01 §B2 ──
  it("admits an allowlisted address for magic-link with no profile (the link is the proof)", async () => {
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockResolvedValue(true) });

    await expect(
      decideSignIn({ email: "cam@example.com", method: "magic-link", pass: "send" }, deps),
    ).resolves.toEqual({ allow: true, email: "cam@example.com" });

    expect(deps.recordAccessRequest).not.toHaveBeenCalled();
  });

  it("refuses an unlisted address on the magic-link SEND pass ⇒ { allow: false, reason: 'refused' }, and records the Access request without a name, avatar or push", async () => {
    const deps = makeDeps();

    await expect(
      decideSignIn({ email: "stranger@example.com", method: "magic-link", pass: "send" }, deps),
    ).resolves.toEqual({ allow: false, reason: "refused" });

    expect(deps.recordAccessRequest).toHaveBeenCalledWith({
      email: "stranger@example.com",
      name: null,
      image: null,
      notify: false,
    });
  });

  it("refuses an unlisted address on the magic-link CLICK pass (a now-revoked address still gets refused)", async () => {
    const deps = makeDeps();

    await expect(
      decideSignIn({ email: "revoked@example.com", method: "magic-link", pass: "sign-in" }, deps),
    ).resolves.toEqual({ allow: false, reason: "refused" });

    expect(deps.recordAccessRequest).toHaveBeenCalledWith({
      email: "revoked@example.com",
      name: null,
      image: null,
      notify: false,
    });
  });

  it("permits the SEND for a pending Trip Invite on the magic-link send pass, without promoting or notifying", async () => {
    const deps = makeDeps({ hasPendingTripInvite: vi.fn().mockResolvedValue(true) });

    await expect(
      decideSignIn({ email: "invited@example.com", method: "magic-link", pass: "send" }, deps),
    ).resolves.toEqual({ allow: true, email: "invited@example.com" });

    expect(deps.admitByTripInvite).not.toHaveBeenCalled();
    expect(deps.notifyAdmins).not.toHaveBeenCalled();
    expect(deps.recordAccessRequest).not.toHaveBeenCalled();
  });

  it("promotes and notifies for a pending Trip Invite on the magic-link CLICK pass", async () => {
    const deps = makeDeps({
      hasPendingTripInvite: vi.fn().mockResolvedValue(true),
      admitByTripInvite: vi.fn().mockResolvedValue({ created: true }),
    });

    await expect(
      decideSignIn({ email: "invited@example.com", method: "magic-link", pass: "sign-in" }, deps),
    ).resolves.toEqual({ allow: true, email: "invited@example.com" });

    expect(deps.admitByTripInvite).toHaveBeenCalledTimes(1);
    expect(deps.notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it("passes the address to the predicates lowercased and trimmed", async () => {
    const isAllowedEmail = vi.fn().mockResolvedValue(true);
    const deps = makeDeps({ isAllowedEmail });

    await expect(
      decideSignIn({ email: "  Cam@Example.COM ", method: "magic-link", pass: "sign-in" }, deps),
    ).resolves.toEqual({ allow: true, email: "cam@example.com" });

    expect(isAllowedEmail).toHaveBeenCalledWith("cam@example.com");
  });

  it("the send pass never admits by invite more than the mail (does not call admitByTripInvite or notifyAdmins)", async () => {
    const deps = makeDeps({ hasPendingTripInvite: vi.fn().mockResolvedValue(true) });

    const result = await decideSignIn(
      { email: "invited@example.com", method: "magic-link", pass: "send" },
      deps,
    );

    expect(result).toEqual({ allow: true, email: "invited@example.com" });
    expect(deps.admitByTripInvite).not.toHaveBeenCalled();
    expect(deps.notifyAdmins).not.toHaveBeenCalled();
  });

  it("admitByTripInvite that created nothing does not notify", async () => {
    const deps = makeDeps({
      hasPendingTripInvite: vi.fn().mockResolvedValue(true),
      admitByTripInvite: vi.fn().mockResolvedValue({ created: false }),
    });

    const result = await decideSignIn(
      { email: "invited@example.com", method: "google", pass: "sign-in", profile: { email_verified: true } },
      deps,
    );

    expect(result).toEqual({ allow: true, email: "invited@example.com" });
    expect(deps.admitByTripInvite).toHaveBeenCalledTimes(1);
    expect(deps.notifyAdmins).not.toHaveBeenCalled();
  });
});
