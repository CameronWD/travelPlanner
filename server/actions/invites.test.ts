import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the invite server actions.
 *
 * Mocks:
 *   - lib/db     — assert Prisma call shapes without hitting SQLite
 *   - lib/guards — requireTripAccess returns a predictable membership
 *   - next/cache — revalidatePath is a spy
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  tripMemberFindManyMock,
  inviteFindFirstMock,
  inviteCreateMock,
  inviteFindUniqueMock,
  inviteDeleteMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  inviteFindFirstMock: vi.fn(),
  inviteCreateMock: vi.fn(),
  inviteFindUniqueMock: vi.fn(),
  inviteDeleteMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    tripMember: {
      findMany: tripMemberFindManyMock,
    },
    invite: {
      findFirst: inviteFindFirstMock,
      create: inviteCreateMock,
      findUnique: inviteFindUniqueMock,
      delete: inviteDeleteMock,
    },
  },
}));

import { inviteToTrip, cancelInvite } from "./invites";

const TRIP_ID = "trip-abc";
const INVITE_ID = "invite-xyz";

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// inviteToTrip
// ---------------------------------------------------------------------------

describe("inviteToTrip", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({ id: "new-invite" });

    await inviteToTrip(TRIP_ID, "friend@example.com");

    expect(requireTripAccessMock).toHaveBeenCalledOnce();
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("returns error for invalid email address", async () => {
    const result = await inviteToTrip(TRIP_ID, "not-an-email");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/email/i);
    }
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("returns error when the email is already a member", async () => {
    // findMany returns an array with user.email matching the invited email
    tripMemberFindManyMock.mockResolvedValue([
      { user: { email: "already@example.com" } },
    ]);

    const result = await inviteToTrip(TRIP_ID, "already@example.com");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/already a member/i);
    }
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("creates a new invite and returns success when none exists", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({ id: "new-invite-id" });

    const result = await inviteToTrip(TRIP_ID, "partner@example.com");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.inviteId).toBe("new-invite-id");
    }
    expect(inviteCreateMock).toHaveBeenCalledOnce();
    expect(inviteCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: TRIP_ID,
          email: "partner@example.com",
          role: "member",
        }),
      }),
    );
  });

  it("normalises email to lowercase", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({ id: "inv-1" });

    await inviteToTrip(TRIP_ID, "Partner@EXAMPLE.COM");

    expect(inviteCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "partner@example.com" }),
      }),
    );
  });

  it("keeps existing pending invite (no duplicate create)", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteFindFirstMock.mockResolvedValue({ id: "existing-invite" });

    const result = await inviteToTrip(TRIP_ID, "friend@example.com");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.inviteId).toBe("existing-invite");
    }
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("revalidates the settings path after inviting", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({ id: "inv" });

    await inviteToTrip(TRIP_ID, "new@example.com");

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
  });
});

// ---------------------------------------------------------------------------
// cancelInvite
// ---------------------------------------------------------------------------

describe("cancelInvite", () => {
  it("is access-checked — calls requireTripAccess with the invite's tripId", async () => {
    inviteFindUniqueMock.mockResolvedValue({ tripId: TRIP_ID, acceptedAt: null });
    inviteDeleteMock.mockResolvedValue({});

    await cancelInvite(INVITE_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("returns error when invite is not found", async () => {
    inviteFindUniqueMock.mockResolvedValue(null);

    const result = await cancelInvite(INVITE_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not found/i);
    }
    expect(inviteDeleteMock).not.toHaveBeenCalled();
  });

  it("deletes the invite and returns success", async () => {
    inviteFindUniqueMock.mockResolvedValue({ tripId: TRIP_ID, acceptedAt: null });
    inviteDeleteMock.mockResolvedValue({});

    const result = await cancelInvite(INVITE_ID);

    expect(result.success).toBe(true);
    expect(inviteDeleteMock).toHaveBeenCalledOnce();
    expect(inviteDeleteMock).toHaveBeenCalledWith({ where: { id: INVITE_ID } });
  });

  it("revalidates the settings path after cancelling", async () => {
    inviteFindUniqueMock.mockResolvedValue({ tripId: TRIP_ID, acceptedAt: null });
    inviteDeleteMock.mockResolvedValue({});

    await cancelInvite(INVITE_ID);

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
  });
});
