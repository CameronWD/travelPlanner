import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  errorSpy.mockRestore();
});

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
    expect(inviteUpdateMock).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { acceptedAt: expect.any(Date) },
    });
  });

  it("treats a P2002 unique-constraint race as success and still marks accepted", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    tripMemberFindManyMock.mockResolvedValue([]);
    tripMemberCreateMock.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    inviteUpdateMock.mockResolvedValue({});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(inviteUpdateMock).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { acceptedAt: expect.any(Date) },
    });
  });

  it("does NOT mark accepted when membership creation fails for a non-unique error, and logs it", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    tripMemberFindManyMock.mockResolvedValue([]);
    tripMemberCreateMock.mockRejectedValue(new Error("connection refused"));
    inviteUpdateMock.mockResolvedValue({});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(inviteUpdateMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns early without touching memberships when there are no pending invites", async () => {
    inviteFindManyMock.mockResolvedValue([]);

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
    expect(tripMemberCreateMock).not.toHaveBeenCalled();
    expect(inviteUpdateMock).not.toHaveBeenCalled();
  });

  it("marks an already-joined trip's invite accepted without creating a membership", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    // User is already a member of trip-1 — decideMembershipsToCreate skips it,
    // so it flows through the toAcceptOnly loop instead.
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1", userId: USER_ID }]);
    inviteUpdateMock.mockResolvedValue({});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(tripMemberCreateMock).not.toHaveBeenCalled();
    expect(inviteUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1" } }),
    );
  });

  it("isolates failures across invites — a failed create does not block a successful one", async () => {
    inviteFindManyMock.mockResolvedValue([
      { id: "inv-1", tripId: "trip-1", email: EMAIL },
      { id: "inv-2", tripId: "trip-2", email: EMAIL },
    ]);
    tripMemberFindManyMock.mockResolvedValue([]);
    // First create (trip-1) fails with a non-unique error; second (trip-2) succeeds.
    tripMemberCreateMock
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce({});
    inviteUpdateMock.mockResolvedValue({});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    // inv-1 (failed) is NOT marked accepted; inv-2 (succeeded) IS.
    expect(inviteUpdateMock).toHaveBeenCalledTimes(1);
    expect(inviteUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-2" } }),
    );
    expect(errorSpy).toHaveBeenCalled();
  });
});
