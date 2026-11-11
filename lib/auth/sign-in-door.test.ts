import { describe, expect, it, vi } from "vitest";

// sign-in-door.ts's default deps import the real lib/allowlist.ts,
// lib/admin-notify.ts and lib/access-requests.ts, all of which import
// lib/db.ts — which throws at import time without DATABASE_URL set. Every
// test below injects its own deps mocks and never exercises the real
// functions, so a trivial db stub is enough to let the import chain resolve
// (same idiom as lib/auth/auth.test.ts).
vi.mock("@/lib/db", () => ({ db: {} }));
const { reportErrorMock } = vi.hoisted(() => ({ reportErrorMock: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

import { decideSignIn, type DoorDeps } from "@/lib/auth/sign-in-door";

function makeDeps(overrides: Partial<DoorDeps> = {}): DoorDeps {
  return {
    isAllowedEmail: vi.fn().mockResolvedValue(false),
    recordAccessRequest: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("decideSignIn", () => {
  it("refuses a Google sign-in for an address whose only claim is a pending Trip Invite, and records an Access request", async () => {
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockResolvedValue(false) });

    await expect(
      decideSignIn(
        {
          email: "invited@example.com",
          method: "google",
          pass: "sign-in",
          profile: { email_verified: true, name: "Invited Person", picture: "https://example.com/i.jpg" },
        },
        deps,
      ),
    ).resolves.toEqual({ allow: false, reason: "refused" });

    expect(deps.recordAccessRequest).toHaveBeenCalledWith({
      email: "invited@example.com",
      name: "Invited Person",
      image: "https://example.com/i.jpg",
    });
  });

  it("an address admitted earlier by Invite (an AllowedEmail row) still signs in", async () => {
    const deps = makeDeps({ isAllowedEmail: vi.fn().mockResolvedValue(true) });

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

    expect(deps.recordAccessRequest).not.toHaveBeenCalled();
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

  it("magic-link send pass for an invited-but-unadmitted address is refused like a stranger", async () => {
    const deps = makeDeps();

    await expect(
      decideSignIn({ email: "invited@example.com", method: "magic-link", pass: "send" }, deps),
    ).resolves.toEqual({ allow: false, reason: "refused" });

    expect(deps.recordAccessRequest).toHaveBeenCalledWith({
      email: "invited@example.com",
      name: null,
      image: null,
      notify: false,
    });
  });

  it("passes the address to the predicates lowercased and trimmed", async () => {
    const isAllowedEmail = vi.fn().mockResolvedValue(true);
    const deps = makeDeps({ isAllowedEmail });

    await expect(
      decideSignIn({ email: "  Cam@Example.COM ", method: "magic-link", pass: "sign-in" }, deps),
    ).resolves.toEqual({ allow: true, email: "cam@example.com" });

    expect(isAllowedEmail).toHaveBeenCalledWith("cam@example.com");
  });
});
