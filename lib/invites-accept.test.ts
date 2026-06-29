import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the side-effectful acceptPendingInvitesForUser.
 *
 * Mocks @/lib/db so we can assert Prisma call shapes and drive the
 * membership-create failure paths. Kept separate from invites.test.ts, which
 * tests the pure decideMembershipsToCreate with no mocks.
 */

const {
  inviteFindManyMock,
  inviteUpdateMock,
  tripMemberFindManyMock,
  tripMemberCreateMock,
} = vi.hoisted(() => ({
  inviteFindManyMock: vi.fn(),
  inviteUpdateMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  tripMemberCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    invite: { findMany: inviteFindManyMock, update: inviteUpdateMock },
    tripMember: { findMany: tripMemberFindManyMock, create: tripMemberCreateMock },
  },
}));

import { acceptPendingInvitesForUser } from "./invites";

const USER_ID = "user-1";
const EMAIL = "partner@example.com";

afterEach(() => vi.clearAllMocks());

describe("acceptPendingInvitesForUser", () => {
  it("creates membership and marks the invite accepted on the happy path", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    tripMemberFindManyMock.mockResolvedValue([]);
    tripMemberCreateMock.mockResolvedValue({});
    inviteUpdateMock.mockResolvedValue({});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(tripMemberCreateMock).toHaveBeenCalledWith({
      data: { tripId: "trip-1", userId: USER_ID, role: "member" },
    });
    expect(inviteUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1" } }),
    );
  });

  it("treats a P2002 unique-constraint race as success and still marks accepted", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    tripMemberFindManyMock.mockResolvedValue([]);
    tripMemberCreateMock.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    inviteUpdateMock.mockResolvedValue({});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(inviteUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1" } }),
    );
  });

  it("does NOT mark accepted when membership creation fails for a non-unique error, and logs it", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    tripMemberFindManyMock.mockResolvedValue([]);
    tripMemberCreateMock.mockRejectedValue(new Error("connection refused"));
    inviteUpdateMock.mockResolvedValue({});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(inviteUpdateMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns early without touching memberships when there are no pending invites", async () => {
    inviteFindManyMock.mockResolvedValue([]);

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
    expect(tripMemberCreateMock).not.toHaveBeenCalled();
    expect(inviteUpdateMock).not.toHaveBeenCalled();
  });
});
