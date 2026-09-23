import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the side-effectful acceptPendingGlobeInvitesForUser.
 *
 * Mirrors lib/invites-accept.test.ts's split from lib/invites.test.ts: the
 * pure decideGlobeMembership stays in globe-invites.test.ts with a `db: {}`
 * mock; this file drives the Prisma call shapes with a full mock so we can
 * assert query shape and the create/update side effects.
 */

const {
  globeInviteFindManyMock,
  globeInviteUpdateMock,
  globeMemberCreateMock,
  getUserGlobeMock,
} = vi.hoisted(() => ({
  globeInviteFindManyMock: vi.fn(),
  globeInviteUpdateMock: vi.fn(),
  globeMemberCreateMock: vi.fn(),
  getUserGlobeMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    globeInvite: { findMany: globeInviteFindManyMock, update: globeInviteUpdateMock },
    globeMember: { create: globeMemberCreateMock },
  },
}));
vi.mock("@/lib/globe", () => ({ getUserGlobe: getUserGlobeMock }));

import { acceptPendingGlobeInvitesForUser } from "./globe-invites";

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

describe("acceptPendingGlobeInvitesForUser", () => {
  it("creates membership and marks the invite accepted on the happy path", async () => {
    globeInviteFindManyMock.mockResolvedValue([
      { id: "gi-1", globeId: "globe-1", email: EMAIL },
    ]);
    getUserGlobeMock.mockResolvedValue(null);
    globeMemberCreateMock.mockResolvedValue({});
    globeInviteUpdateMock.mockResolvedValue({});

    await acceptPendingGlobeInvitesForUser(USER_ID, EMAIL);

    expect(globeMemberCreateMock).toHaveBeenCalledWith({
      data: { globeId: "globe-1", userId: USER_ID, role: "member" },
    });
    expect(globeInviteUpdateMock).toHaveBeenCalledWith({
      where: { id: "gi-1" },
      data: { acceptedAt: expect.any(Date) },
    });
  });

  it("filters pending invites to exclude expired ones (expiresAt: null stays valid)", async () => {
    globeInviteFindManyMock.mockResolvedValue([]);

    await acceptPendingGlobeInvitesForUser(USER_ID, EMAIL);

    expect(globeInviteFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          acceptedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
    expect(globeMemberCreateMock).not.toHaveBeenCalled();
  });
});
