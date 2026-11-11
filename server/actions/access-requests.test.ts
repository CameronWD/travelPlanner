import { afterEach, describe, expect, it, vi } from "vitest";
import { INVITE_EXPIRY_MS } from "@/lib/invite-expiry";

/**
 * Tests for the /admin route's server actions (Task 15, ARCH-TEN-3c).
 *
 * `@/lib/guards` is mocked directly (requireAdmin stubbed), matching
 * trips.test.ts / feedback.test.ts convention — the guard's own branching
 * (admin vs notFound vs redirect) is covered exhaustively by
 * lib/guards.test.ts; this file only proves each action calls it FIRST and
 * respects its answer.
 */

const {
  requireAdminMock,
  accessRequestFindUniqueMock,
  accessRequestFindManyMock,
  accessRequestUpdateMock,
  allowedEmailCreateMock,
  allowedEmailFindManyMock,
  allowedEmailFindUniqueMock,
  allowedEmailDeleteMock,
  inviteUpdateManyMock,
  inviteFindManyMock,
  revalidateAdminMock,
  mailConfiguredMock,
  sendMailMock,
  reopenedByInviteMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  accessRequestFindUniqueMock: vi.fn(),
  accessRequestFindManyMock: vi.fn(),
  accessRequestUpdateMock: vi.fn(),
  allowedEmailCreateMock: vi.fn(),
  allowedEmailFindManyMock: vi.fn(),
  allowedEmailFindUniqueMock: vi.fn(),
  allowedEmailDeleteMock: vi.fn(),
  inviteUpdateManyMock: vi.fn(),
  inviteFindManyMock: vi.fn(),
  revalidateAdminMock: vi.fn(),
  mailConfiguredMock: vi.fn(() => false),
  sendMailMock: vi.fn(),
  reopenedByInviteMock: vi.fn(),
}));

vi.mock("@/lib/reopened-requests", () => ({ reopenedByInvite: reopenedByInviteMock }));

vi.mock("@/lib/guards", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: {
      findUnique: accessRequestFindUniqueMock,
      findMany: accessRequestFindManyMock,
      update: accessRequestUpdateMock,
    },
    allowedEmail: {
      create: allowedEmailCreateMock,
      findMany: allowedEmailFindManyMock,
      findUnique: allowedEmailFindUniqueMock,
      delete: allowedEmailDeleteMock,
    },
    invite: { updateMany: inviteUpdateManyMock, findMany: inviteFindManyMock },
  },
}));

vi.mock("@/lib/mail", () => ({ mailConfigured: mailConfiguredMock, sendMail: sendMailMock }));
vi.mock("@/lib/site-url", () => ({ siteUrl: () => "https://teepee.test" }));

vi.mock("@/lib/revalidate", () => ({
  revalidateAdmin: revalidateAdminMock,
}));

import {
  approveAccessRequest,
  dismissAccessRequest,
  listAccessRequests,
  revokeAllowedEmail,
} from "@/server/actions/access-requests";

const ADMIN = { id: "admin-1", email: "ops@example.com" };

function mockAdmin(email: string = ADMIN.email, id: string = ADMIN.id) {
  requireAdminMock.mockResolvedValue({ id, email });
}

reopenedByInviteMock.mockResolvedValue([]);

const ORIGINAL_ALLOWED_EMAILS = process.env.ALLOWED_EMAILS;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  reopenedByInviteMock.mockReset().mockResolvedValue([]);
  mailConfiguredMock.mockReturnValue(false);
  sendMailMock.mockReset();
  if (ORIGINAL_ALLOWED_EMAILS === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = ORIGINAL_ALLOWED_EMAILS;
});

// ---------------------------------------------------------------------------
// approveAccessRequest
// ---------------------------------------------------------------------------

describe("approveAccessRequest", () => {
  it("writes an AllowedEmail row and stamps resolvedAt", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "pending",
    });

    const result = await approveAccessRequest("ar1");

    expect(result).toEqual({ success: true, mailed: false });
    expect(allowedEmailCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "friend@example.com" }) }),
    );
    expect(accessRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolvedAt: expect.any(Date) }) }),
    );
    // A second admin tab (or the same tab after a stale render) must not go
    // on serving the request as still-pending after this resolves it.
    expect(revalidateAdminMock).toHaveBeenCalledOnce();
  });

  it("approving revives the address's expired, unaccepted Trip Invites", async () => {
    const now = new Date("2026-11-11T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "Sam@Example.com", resolvedAt: null });

    await approveAccessRequest("ar1");

    expect(inviteUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(inviteUpdateManyMock).toHaveBeenCalledWith({
      where: { email: "sam@example.com", acceptedAt: null, expiresAt: { lt: now } },
      data: { expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS) },
    });
  });

  it("emails the approved address after the allowlist row and resolvedAt are written, when mail is configured", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "friend@example.com", resolvedAt: null });
    allowedEmailCreateMock.mockResolvedValue({});
    accessRequestUpdateMock.mockResolvedValue({});
    mailConfiguredMock.mockReturnValue(true);
    sendMailMock.mockResolvedValue({ sent: true });

    const result = await approveAccessRequest("ar1");

    expect(result).toEqual({ success: true, mailed: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.to).toBe("friend@example.com");
    expect(msg.subject).toBe("You're in: sign in to Teepee");
    expect(msg.text).toContain("https://teepee.test/");
    // Order: the grant and the resolve happen before the send.
    expect(allowedEmailCreateMock.mock.invocationCallOrder[0]).toBeLessThan(sendMailMock.mock.invocationCallOrder[0]);
    expect(accessRequestUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(sendMailMock.mock.invocationCallOrder[0]);
  });

  // Review Focus 3: mail can never undo an approval.
  it("still approves, and reports mailed: false, when the send fails", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "friend@example.com", resolvedAt: null });
    allowedEmailCreateMock.mockResolvedValue({});
    accessRequestUpdateMock.mockResolvedValue({});
    mailConfiguredMock.mockReturnValue(true);
    sendMailMock.mockResolvedValue({ sent: false, error: "Resend error 500: nope" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await approveAccessRequest("ar1");

    expect(result).toEqual({ success: true, mailed: false });
    expect(allowedEmailCreateMock).toHaveBeenCalledTimes(1);
    expect(accessRequestUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { resolvedAt: expect.any(Date) } }));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("sends nothing when mail is not configured", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "friend@example.com", resolvedAt: null });
    allowedEmailCreateMock.mockResolvedValue({});
    accessRequestUpdateMock.mockResolvedValue({});
    mailConfiguredMock.mockReturnValue(false);
    await expect(approveAccessRequest("ar1")).resolves.toEqual({ success: true, mailed: false });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("requires admin FIRST — a non-admin cannot approve and nothing is written", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(approveAccessRequest("ar1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(accessRequestFindUniqueMock).not.toHaveBeenCalled();
    expect(allowedEmailCreateMock).not.toHaveBeenCalled();
  });

  // HIGHEST-RISK requirement: User.email is never normalised anywhere in this
  // codebase, and a mixed-case AllowedEmail row is invisible to
  // isAllowedEmail's lowercased needle — approving someone with a
  // not-already-lowercase stored email would permanently lock them out, and
  // the unique index makes the two casings look like two different people.
  // AccessRequest.email is already stored lowercased by the capture path
  // (lib/access-requests.ts), but this asserts approve is explicit about it
  // rather than trusting that upstream invariant blindly.
  it("writes the AllowedEmail row lowercased, even if the stored request record is not", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "Mixed-Case@Example.COM",
      status: "pending",
    });

    await approveAccessRequest("ar1");

    expect(allowedEmailCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "mixed-case@example.com" }) }),
    );
  });

  it("is idempotent: a P2002 from an already-allowlisted address does not throw, and the request still resolves", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "pending",
    });
    allowedEmailCreateMock.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const result = await approveAccessRequest("ar1");

    expect(result.success).toBe(true);
    expect(accessRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolvedAt: expect.any(Date) }) }),
    );
  });

  it("does not swallow a non-P2002 error from the AllowedEmail write", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "pending",
    });
    allowedEmailCreateMock.mockRejectedValueOnce(new Error("db exploded"));

    await expect(approveAccessRequest("ar1")).rejects.toThrow("db exploded");
    expect(accessRequestUpdateMock).not.toHaveBeenCalled();
  });

  it("does not add a third AccessRequest status value — approve's update never sets status", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "pending",
    });

    await approveAccessRequest("ar1");

    const data = accessRequestUpdateMock.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
  });

  it("fails cleanly when the request no longer exists", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue(null);

    const result = await approveAccessRequest("gone");

    expect(result.success).toBe(false);
    expect(allowedEmailCreateMock).not.toHaveBeenCalled();
  });

  // Two-admin-tab race: dismiss the request in tab A, then approve the SAME
  // request in tab B before it re-renders. Without this guard, approve would
  // grant access AND overwrite resolvedAt while status stayed "dismissed" —
  // the one audit row (AccessRequest.email is @unique) would then say
  // "declined" while behaving "admitted."
  it("refuses to approve a request that is already resolved (e.g. dismissed in another tab)", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "dismissed",
      resolvedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = await approveAccessRequest("ar1");

    expect(result.success).toBe(false);
    expect(allowedEmailCreateMock).not.toHaveBeenCalled();
    expect(accessRequestUpdateMock).not.toHaveBeenCalled();
  });

  it("approves a reopened request: allowlists, sets status pending and resolvedAt, revives Invites", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "dismissed",
      resolvedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    reopenedByInviteMock.mockResolvedValue([{ id: "ar1" }]);

    const result = await approveAccessRequest("ar1");

    expect(result).toEqual({ success: true, mailed: false });
    expect(reopenedByInviteMock).toHaveBeenCalledWith("ar1");
    expect(allowedEmailCreateMock).toHaveBeenCalled();
    expect(accessRequestUpdateMock).toHaveBeenCalledWith({
      where: { id: "ar1" },
      data: { status: "pending", resolvedAt: expect.any(Date) },
    });
    expect(inviteUpdateManyMock).toHaveBeenCalledTimes(1);
  });

  it("still refuses a dismissed request with no later Invite", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "dismissed",
      resolvedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    reopenedByInviteMock.mockResolvedValue([]);

    const result = await approveAccessRequest("ar1");

    expect(result).toMatchObject({ success: false, errors: { _: ["That request has already been resolved."] } });
    expect(allowedEmailCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dismissAccessRequest
// ---------------------------------------------------------------------------

describe("dismissAccessRequest", () => {
  it("dismissing never touches Invites", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "x@example.com", resolvedAt: null });

    await dismissAccessRequest("ar1");

    expect(inviteUpdateManyMock).not.toHaveBeenCalled();
  });

  it("sets status to dismissed and stamps resolvedAt, without granting access", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "x@example.com",
      status: "pending",
    });

    const result = await dismissAccessRequest("ar1");

    expect(result.success).toBe(true);
    expect(allowedEmailCreateMock).not.toHaveBeenCalled();
    expect(accessRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "dismissed", resolvedAt: expect.any(Date) }),
      }),
    );
    expect(revalidateAdminMock).toHaveBeenCalledOnce();
  });

  it("never emails", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({ id: "ar1", email: "friend@example.com", resolvedAt: null });
    accessRequestUpdateMock.mockResolvedValue({});
    mailConfiguredMock.mockReturnValue(true);
    await dismissAccessRequest("ar1");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("requires admin FIRST — a non-admin cannot dismiss", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(dismissAccessRequest("ar1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(accessRequestUpdateMock).not.toHaveBeenCalled();
  });

  it("fails cleanly when the request no longer exists", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue(null);

    const result = await dismissAccessRequest("gone");

    expect(result.success).toBe(false);
    expect(accessRequestUpdateMock).not.toHaveBeenCalled();
  });

  // The mirror ordering: approve in tab A, then dismiss the same request in
  // tab B. Dismiss never revokes, so an unguarded dismiss here would leave
  // the AllowedEmail grant standing while status flips to "dismissed" — the
  // one audit row again says the opposite of what actually happened.
  it("refuses to dismiss a request that is already resolved (e.g. approved in another tab)", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "pending",
      resolvedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = await dismissAccessRequest("ar1");

    expect(result.success).toBe(false);
    expect(accessRequestUpdateMock).not.toHaveBeenCalled();
  });

  it("re-dismisses a reopened request, stamping a new resolvedAt", async () => {
    mockAdmin();
    accessRequestFindUniqueMock.mockResolvedValue({
      id: "ar1",
      email: "friend@example.com",
      status: "dismissed",
      resolvedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    reopenedByInviteMock.mockResolvedValue([{ id: "ar1" }]);

    const result = await dismissAccessRequest("ar1");

    expect(result.success).toBe(true);
    expect(accessRequestUpdateMock).toHaveBeenCalledWith({
      where: { id: "ar1" },
      data: { status: "dismissed", resolvedAt: expect.any(Date) },
    });
  });
});

// ---------------------------------------------------------------------------
// listAccessRequests
// ---------------------------------------------------------------------------

describe("listAccessRequests", () => {
  // This is the leak path the brief singled out: an unguarded list exposes
  // every requester's email and avatar. `toHaveBeenCalled()` alone would
  // pass even if the guard were called AFTER the read — assert the read
  // never happens at all.
  it("a non-admin cannot list — requireAdmin rejects, and nothing is read", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(listAccessRequests()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(accessRequestFindManyMock).not.toHaveBeenCalled();
  });

  // Approve deliberately never touches `status` (no third status value), so
  // "still pending" is `resolvedAt: null` — NOT `status: "pending"`, which
  // would still be true of an approved-but-unchanged-status row.
  it("only queries unresolved requests, by resolvedAt: null (not by status)", async () => {
    mockAdmin();
    accessRequestFindManyMock.mockResolvedValue([]);
    inviteFindManyMock.mockResolvedValue([]);

    await listAccessRequests();

    const arg = accessRequestFindManyMock.mock.calls[0][0];
    expect(arg.where).toEqual({ resolvedAt: null });
  });

  it("maps rows to the view shape", async () => {
    mockAdmin();
    inviteFindManyMock.mockResolvedValue([]);
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    const lastAttemptAt = new Date("2026-09-05T00:00:00.000Z");
    accessRequestFindManyMock.mockResolvedValue([
      {
        id: "ar1",
        email: "friend@example.com",
        name: "Friend",
        image: null,
        createdAt,
        lastAttemptAt,
        attempts: 3,
      },
    ]);

    const result = await listAccessRequests();

    expect(result).toEqual([
      {
        id: "ar1",
        email: "friend@example.com",
        name: "Friend",
        image: null,
        createdAt: createdAt.toISOString(),
        lastAttemptAt: lastAttemptAt.toISOString(),
        attempts: 3,
        invitedTo: [],
        dismissedEarlier: false,
      },
    ]);
  });

  const row = (id: string, email: string, day: number) => ({
    id,
    email,
    name: null,
    image: null,
    createdAt: new Date(Date.UTC(2026, 8, day)),
    lastAttemptAt: new Date(Date.UTC(2026, 8, day)),
    attempts: 1,
  });

  it("attaches each request's unaccepted Trip Invites as tripName + ownerName", async () => {
    mockAdmin();
    accessRequestFindManyMock.mockResolvedValue([
      row("ar1", "Sam@Example.com", 1),
      row("ar2", "none@example.com", 2),
    ]);
    inviteFindManyMock.mockResolvedValue([
      {
        email: "sam@example.com",
        trip: {
          name: "Bali 2027",
          members: [{ user: { id: "u1", name: "Cam W", image: null, displayName: "Cam", email: "cam@example.com" } }],
        },
      },
    ]);

    const result = await listAccessRequests();

    expect(inviteFindManyMock).toHaveBeenCalledWith({
      where: { email: { in: ["sam@example.com", "none@example.com"] }, acceptedAt: null, trip: { deletedAt: null } },
      select: {
        email: true,
        trip: {
          select: {
            name: true,
            members: {
              where: { role: "owner" },
              select: { user: { select: { id: true, name: true, image: true, displayName: true, email: true } } },
            },
          },
        },
      },
    });
    expect(result.find((r) => r.id === "ar1")!.invitedTo).toEqual([{ tripName: "Bali 2027", ownerName: "Cam" }]);
    expect(result.find((r) => r.id === "ar2")!.invitedTo).toEqual([]);
  });

  it("lists invited requests first, each group oldest first", async () => {
    mockAdmin();
    accessRequestFindManyMock.mockResolvedValue([
      row("old-plain", "a@example.com", 1),
      row("old-invited", "b@example.com", 2),
      row("new-plain", "c@example.com", 3),
      row("new-invited", "d@example.com", 4),
    ]);
    const invite = (email: string) => ({
      email,
      trip: { name: "T", members: [{ user: { id: "u", name: null, image: null, displayName: "O", email: "o@example.com" } }] },
    });
    inviteFindManyMock.mockResolvedValue([invite("b@example.com"), invite("d@example.com")]);

    const result = await listAccessRequests();

    expect(result.map((r) => r.id)).toEqual(["old-invited", "new-invited", "old-plain", "new-plain"]);
  });

  it("includes reopened requests with dismissedEarlier true", async () => {
    mockAdmin();
    accessRequestFindManyMock.mockResolvedValue([row("pend", "a@example.com", 3)]);
    reopenedByInviteMock.mockResolvedValue([row("reopened", "b@example.com", 1)]);
    inviteFindManyMock.mockResolvedValue([
      {
        email: "b@example.com",
        trip: { name: "T", members: [{ user: { id: "u", name: null, image: null, displayName: "O", email: "o@example.com" } }] },
      },
    ]);

    const result = await listAccessRequests();

    expect(result.map((r) => [r.id, r.dismissedEarlier])).toEqual([
      ["reopened", true],
      ["pend", false],
    ]);
    expect(result[0].invitedTo).toEqual([{ tripName: "T", ownerName: "O" }]);
    expect(inviteFindManyMock.mock.calls[0][0].where.email).toEqual({ in: ["a@example.com", "b@example.com"] });
  });
});

// ---------------------------------------------------------------------------
// revokeAllowedEmail
// ---------------------------------------------------------------------------

describe("revokeAllowedEmail", () => {
  it("deletes the row for an ordinary admitted address", async () => {
    mockAdmin("ops@example.com", "admin-1");
    allowedEmailFindUniqueMock.mockResolvedValue({
      id: "ae1",
      email: "friend@example.com",
    });

    const result = await revokeAllowedEmail("ae1");

    expect(result.success).toBe(true);
    expect(allowedEmailDeleteMock).toHaveBeenCalledWith({ where: { id: "ae1" } });
    expect(revalidateAdminMock).toHaveBeenCalledOnce();
  });

  it("requires admin FIRST — a non-admin cannot revoke", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(revokeAllowedEmail("ae1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(allowedEmailDeleteMock).not.toHaveBeenCalled();
  });

  // The lockout-in-reverse this exists to prevent: an admin revoking the
  // very address that lets them sign in at all, with no revocation path back
  // short of raw SQL.
  it("refuses to let an admin revoke their own address", async () => {
    mockAdmin("ops@example.com", "admin-1");
    allowedEmailFindUniqueMock.mockResolvedValue({
      id: "ae1",
      email: "ops@example.com",
    });

    const result = await revokeAllowedEmail("ae1");

    expect(result.success).toBe(false);
    expect(allowedEmailDeleteMock).not.toHaveBeenCalled();
  });

  it("compares case-insensitively — an admin cannot revoke their own address by a different casing either", async () => {
    mockAdmin("Ops@Example.com", "admin-1");
    allowedEmailFindUniqueMock.mockResolvedValue({
      id: "ae1",
      email: "ops@example.com",
    });

    const result = await revokeAllowedEmail("ae1");

    expect(result.success).toBe(false);
    expect(allowedEmailDeleteMock).not.toHaveBeenCalled();
  });

  // I1: the mirror of the test above — the STORED ROW's casing is the
  // mismatched one this time, not the admin's own. Every known writer of
  // AllowedEmail.email lowercases, but this guard must not lean on that
  // invariant either (approveAccessRequest, ten lines away in this same
  // file, already declined to lean on it for its own write) — a row that
  // somehow isn't lowercase must still be recognised as the acting admin's
  // own address, or the guard misses and the delete runs.
  it("compares case-insensitively on the STORED ROW's side too, not just the admin's", async () => {
    mockAdmin("ops@example.com", "admin-1");
    allowedEmailFindUniqueMock.mockResolvedValue({
      id: "ae1",
      email: "Ops@Example.com",
    });

    const result = await revokeAllowedEmail("ae1");

    expect(result.success).toBe(false);
    expect(allowedEmailDeleteMock).not.toHaveBeenCalled();
  });

  it("no-op-safe: revoking an already-gone row still returns success", async () => {
    mockAdmin();
    allowedEmailFindUniqueMock.mockResolvedValue(null);

    const result = await revokeAllowedEmail("gone");

    expect(result.success).toBe(true);
    expect(allowedEmailDeleteMock).not.toHaveBeenCalled();
  });

  it("refuses an ALLOWED_EMAILS (env-var) entry rather than pretending a delete would work", async () => {
    mockAdmin();

    const result = await revokeAllowedEmail("env:bootstrap@example.com");

    expect(result.success).toBe(false);
    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
    expect(allowedEmailDeleteMock).not.toHaveBeenCalled();
  });
});
