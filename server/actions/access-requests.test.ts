import { afterEach, describe, expect, it, vi } from "vitest";

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
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  accessRequestFindUniqueMock: vi.fn(),
  accessRequestFindManyMock: vi.fn(),
  accessRequestUpdateMock: vi.fn(),
  allowedEmailCreateMock: vi.fn(),
  allowedEmailFindManyMock: vi.fn(),
  allowedEmailFindUniqueMock: vi.fn(),
  allowedEmailDeleteMock: vi.fn(),
}));

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
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  approveAccessRequest,
  dismissAccessRequest,
  listAccessRequests,
  listAllowedEmails,
  revokeAllowedEmail,
} from "@/server/actions/access-requests";

const ADMIN = { id: "admin-1", email: "ops@example.com" };

function mockAdmin(email: string = ADMIN.email, id: string = ADMIN.id) {
  requireAdminMock.mockResolvedValue({ id, email });
}

const ORIGINAL_ALLOWED_EMAILS = process.env.ALLOWED_EMAILS;

afterEach(() => {
  vi.clearAllMocks();
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

    expect(result.success).toBe(true);
    expect(allowedEmailCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "friend@example.com" }) }),
    );
    expect(accessRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolvedAt: expect.any(Date) }) }),
    );
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
});

// ---------------------------------------------------------------------------
// dismissAccessRequest
// ---------------------------------------------------------------------------

describe("dismissAccessRequest", () => {
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
});

// ---------------------------------------------------------------------------
// listAccessRequests
// ---------------------------------------------------------------------------

describe("listAccessRequests", () => {
  it("requires admin", async () => {
    mockAdmin();
    accessRequestFindManyMock.mockResolvedValue([]);

    await listAccessRequests();

    expect(requireAdminMock).toHaveBeenCalled();
  });

  // Approve deliberately never touches `status` (no third status value), so
  // "still pending" is `resolvedAt: null` — NOT `status: "pending"`, which
  // would still be true of an approved-but-unchanged-status row.
  it("only queries unresolved requests, by resolvedAt: null (not by status)", async () => {
    mockAdmin();
    accessRequestFindManyMock.mockResolvedValue([]);

    await listAccessRequests();

    const arg = accessRequestFindManyMock.mock.calls[0][0];
    expect(arg.where).toEqual({ resolvedAt: null });
  });

  it("maps rows to the view shape", async () => {
    mockAdmin();
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
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// listAllowedEmails
// ---------------------------------------------------------------------------

describe("listAllowedEmails", () => {
  it("requires admin", async () => {
    mockAdmin();
    allowedEmailFindManyMock.mockResolvedValue([]);
    delete process.env.ALLOWED_EMAILS;

    await listAllowedEmails();

    expect(requireAdminMock).toHaveBeenCalled();
  });

  it("marks database rows as revocable", async () => {
    mockAdmin();
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    allowedEmailFindManyMock.mockResolvedValue([
      { id: "ae1", email: "friend@example.com", note: "approved", createdAt },
    ]);
    delete process.env.ALLOWED_EMAILS;

    const result = await listAllowedEmails();

    expect(result).toEqual([
      {
        id: "ae1",
        email: "friend@example.com",
        note: "approved",
        createdAt: createdAt.toISOString(),
        revocable: true,
      },
    ]);
  });

  it("surfaces ALLOWED_EMAILS entries as non-revocable, and never as a deletable row", async () => {
    mockAdmin();
    allowedEmailFindManyMock.mockResolvedValue([]);
    process.env.ALLOWED_EMAILS = "bootstrap@example.com";

    const result = await listAllowedEmails();

    expect(result).toEqual([
      expect.objectContaining({ email: "bootstrap@example.com", revocable: false }),
    ]);
  });

  it("does not double-list an address that is in both ALLOWED_EMAILS and the AllowedEmail table", async () => {
    mockAdmin();
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    allowedEmailFindManyMock.mockResolvedValue([
      { id: "ae1", email: "both@example.com", note: null, createdAt },
    ]);
    process.env.ALLOWED_EMAILS = "Both@Example.com";

    const result = await listAllowedEmails();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ email: "both@example.com", revocable: true });
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
