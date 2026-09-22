import { afterEach, describe, expect, it, vi } from "vitest";

const { allowedEmailFindUniqueMock, inviteFindFirstMock } = vi.hoisted(() => ({
  allowedEmailFindUniqueMock: vi.fn(),
  inviteFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    allowedEmail: { findUnique: allowedEmailFindUniqueMock },
    invite: { findFirst: inviteFindFirstMock },
  },
}));

import { isAllowedEmail, hasPendingTripInvite } from "./allowlist";

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
});
