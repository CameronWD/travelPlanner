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
  inviteUpsertMock,
  inviteFindUniqueMock,
  inviteDeleteMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  inviteUpsertMock: vi.fn(),
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
      upsert: inviteUpsertMock,
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
    inviteUpsertMock.mockResolvedValue({ id: "new-invite" });

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
    expect(inviteUpsertMock).not.toHaveBeenCalled();
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
    expect(inviteUpsertMock).not.toHaveBeenCalled();
  });

  it("creates a new invite and returns success when none exists", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteUpsertMock.mockResolvedValue({ id: "new-invite-id" });

    const result = await inviteToTrip(TRIP_ID, "partner@example.com");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.inviteId).toBe("new-invite-id");
    }
    expect(inviteUpsertMock).toHaveBeenCalledOnce();
    expect(inviteUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tripId: TRIP_ID,
          email: "partner@example.com",
          role: "member",
        }),
      }),
    );
  });

  it("normalises email to lowercase", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteUpsertMock.mockResolvedValue({ id: "inv-1" });

    await inviteToTrip(TRIP_ID, "Partner@EXAMPLE.COM");

    expect(inviteUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ email: "partner@example.com" }),
      }),
    );
  });

  it("returns the upsert's resolved id on the no-duplicate path (idempotent)", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    // Simulate the conflict path: a row for (tripId, email) already exists, so
    // the compound-key upsert resolves to that existing row's id.
    inviteUpsertMock.mockResolvedValue({ id: "existing-invite" });

    const result = await inviteToTrip(TRIP_ID, "friend@example.com");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.inviteId).toBe("existing-invite");
    }
    // A single upsert keyed on the compound (tripId, email) — never two rows.
    expect(inviteUpsertMock).toHaveBeenCalledOnce();
    expect(inviteUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId_email: { tripId: TRIP_ID, email: "friend@example.com" } },
      }),
    );
  });

  it("revalidates the settings path after inviting", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteUpsertMock.mockResolvedValue({ id: "inv" });

    await inviteToTrip(TRIP_ID, "new@example.com");

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
  });

  it("upserts on (tripId, email) so a duplicate cannot be created", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    inviteUpsertMock.mockResolvedValue({ id: INVITE_ID });

    const result = await inviteToTrip(TRIP_ID, "Friend@Example.com ");

    expect(result.success).toBe(true);
    expect(inviteUpsertMock).toHaveBeenCalledOnce();
    expect(inviteUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId_email: { tripId: TRIP_ID, email: "friend@example.com" } },
        update: {},
        create: expect.objectContaining({
          tripId: TRIP_ID,
          email: "friend@example.com",
          role: "member",
        }),
      }),
    );
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
