import { afterEach, describe, expect, it, vi } from "vitest";

const { allowedEmailFindUniqueMock, allowedEmailUpsertMock, inviteFindFirstMock } =
  vi.hoisted(() => ({
    allowedEmailFindUniqueMock: vi.fn(),
    allowedEmailUpsertMock: vi.fn(),
    inviteFindFirstMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    allowedEmail: { findUnique: allowedEmailFindUniqueMock, upsert: allowedEmailUpsertMock },
    invite: { findFirst: inviteFindFirstMock },
  },
}));

import { isAllowedEmail, hasPendingTripInvite, admitByTripInvite } from "./allowlist";

const ORIGINAL_ALLOWED_EMAILS = process.env.ALLOWED_EMAILS;

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_ALLOWED_EMAILS === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = ORIGINAL_ALLOWED_EMAILS;
});

describe("isAllowedEmail", () => {
  it("admits an address in ALLOWED_EMAILS, case- and space-insensitively", async () => {
    process.env.ALLOWED_EMAILS = " Cam@Example.com , other@example.com ";
    await expect(isAllowedEmail("cam@example.com")).resolves.toBe(true);
  });

  it("admits an address held in the AllowedEmail table", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue({ email: "friend@example.com" });
    await expect(isAllowedEmail("Friend@example.com")).resolves.toBe(true);
    // The needle passed to Prisma must already be normalised — the table is
    // backfilled/written lowercase (see the rollout-gate migration).
    expect(allowedEmailFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "friend@example.com" },
    });
  });

  it("refuses an unknown address", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    await expect(isAllowedEmail("stranger@example.com")).resolves.toBe(false);
  });

  it("refuses null/undefined/empty", async () => {
    await expect(isAllowedEmail(null)).resolves.toBe(false);
    await expect(isAllowedEmail(undefined)).resolves.toBe(false);
    await expect(isAllowedEmail("   ")).resolves.toBe(false);
  });

  it("does not query the table when ALLOWED_EMAILS already admits the address", async () => {
    process.env.ALLOWED_EMAILS = "cam@example.com";
    await expect(isAllowedEmail("cam@example.com")).resolves.toBe(true);
    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
  });

  it("fails closed (propagates rather than swallows) when the table lookup throws", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockRejectedValue(new Error("db down"));
    await expect(isAllowedEmail("cam@example.com")).rejects.toThrow("db down");
  });
});

describe("hasPendingTripInvite", () => {
  it("is true for an unexpired, un-accepted Trip Invite, case-insensitively", async () => {
    inviteFindFirstMock.mockResolvedValue({ id: "inv1" });
    await expect(hasPendingTripInvite("Invited@Example.com")).resolves.toBe(true);
    expect(inviteFindFirstMock).toHaveBeenCalledWith({
      where: {
        email: "invited@example.com",
        acceptedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: { id: true },
    });
  });

  it("is false when no matching Trip Invite exists", async () => {
    inviteFindFirstMock.mockResolvedValue(null);
    await expect(hasPendingTripInvite("nobody@example.com")).resolves.toBe(false);
  });

  it("is false for an empty email without querying the database", async () => {
    await expect(hasPendingTripInvite("   ")).resolves.toBe(false);
    expect(inviteFindFirstMock).not.toHaveBeenCalled();
  });

  // The two P0 refusal cases. Prisma itself is mocked everywhere else in this
  // file, so a mocked findFirst that just returns a canned value can't prove
  // the WHERE clause actually excludes these rows — these two tests instead
  // drive the mock off the real `where` shape hasPendingTripInvite sends,
  // against a single fixture row, so a regression that drops the
  // `acceptedAt: null` or `expiresAt` filter fails the test rather than
  // silently re-admitting someone who shouldn't be.
  it("refuses an ALREADY-ACCEPTED invite", async () => {
    const row: { email: string; acceptedAt: Date | null; expiresAt: Date | null } = {
      email: "accepted@example.com",
      acceptedAt: new Date("2026-01-01"),
      expiresAt: null,
    };
    inviteFindFirstMock.mockImplementation(
      async ({ where }: { where: { email: string; acceptedAt: null; OR: Array<{ expiresAt: null | { gt: Date } }> } }) => {
        const matches =
          row.email === where.email &&
          where.acceptedAt === null &&
          row.acceptedAt === null &&
          where.OR.some((clause) =>
            "gt" in (clause.expiresAt ?? {}) ? row.expiresAt !== null && row.expiresAt > (clause.expiresAt as { gt: Date }).gt : row.expiresAt === null,
          );
        return matches ? { id: "inv" } : null;
      },
    );
    await expect(hasPendingTripInvite("accepted@example.com")).resolves.toBe(false);
  });

  it("refuses an EXPIRED invite", async () => {
    const row: { email: string; acceptedAt: Date | null; expiresAt: Date | null } = {
      email: "expired@example.com",
      acceptedAt: null,
      expiresAt: new Date("2020-01-01"),
    };
    inviteFindFirstMock.mockImplementation(
      async ({ where }: { where: { email: string; acceptedAt: null; OR: Array<{ expiresAt: null | { gt: Date } }> } }) => {
        const matches =
          row.email === where.email &&
          row.acceptedAt === where.acceptedAt &&
          where.OR.some((clause) =>
            "gt" in (clause.expiresAt ?? {}) ? row.expiresAt !== null && row.expiresAt > (clause.expiresAt as { gt: Date }).gt : row.expiresAt === null,
          );
        return matches ? { id: "inv" } : null;
      },
    );
    await expect(hasPendingTripInvite("expired@example.com")).resolves.toBe(false);
  });
});

describe("admitByTripInvite", () => {
  it("upserts an AllowedEmail row for the lowercased address, noting it was admitted by Trip Invite", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    allowedEmailUpsertMock.mockResolvedValue({ email: "invited@example.com" });
    await admitByTripInvite("Invited@Example.com");
    expect(allowedEmailUpsertMock).toHaveBeenCalledWith({
      where: { email: "invited@example.com" },
      update: {},
      create: { email: "invited@example.com", note: "admitted by Trip Invite" },
    });
  });

  it("is idempotent — an existing row is left untouched, not overwritten", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue({ id: "ae1" });
    allowedEmailUpsertMock.mockResolvedValue({ email: "invited@example.com" });
    await admitByTripInvite("invited@example.com");
    // `update: {}` — a second admission must not clobber a row that, say,
    // later got a different note from an approved Access request.
    expect(allowedEmailUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  it("does nothing for an empty email", async () => {
    await expect(admitByTripInvite("   ")).resolves.toEqual({ created: false });
    expect(allowedEmailFindUniqueMock).not.toHaveBeenCalled();
    expect(allowedEmailUpsertMock).not.toHaveBeenCalled();
  });

  it("reports created: true for a first admission (no prior row)", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    allowedEmailUpsertMock.mockResolvedValue({ email: "invited@example.com" });
    await expect(admitByTripInvite("invited@example.com")).resolves.toEqual({ created: true });
  });

  it("reports created: false for a repeat admission (row already existed)", async () => {
    allowedEmailFindUniqueMock.mockResolvedValue({ id: "ae1" });
    allowedEmailUpsertMock.mockResolvedValue({ email: "invited@example.com" });
    await expect(admitByTripInvite("invited@example.com")).resolves.toEqual({ created: false });
  });
});
