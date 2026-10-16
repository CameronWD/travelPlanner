import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for activity server actions.
 * Mocks: lib/db, lib/guards
 */

const {
  requireUserMock,
  tripMemberUpdateManyMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1", name: "Test User", image: null }),
  tripMemberUpdateManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    tripMember: {
      updateMany: tripMemberUpdateManyMock,
    },
  },
}));

import { markAllRead } from "./activity";

const TRIP_ID = "trip-1";
const USER_ID = "user-1";

beforeEach(() => {
  requireUserMock.mockResolvedValue({ id: USER_ID, name: "Test User", image: null });
  tripMemberUpdateManyMock.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// markAllRead
// ---------------------------------------------------------------------------

describe("markAllRead", () => {
  it("calls db.tripMember.updateMany scoped to tripId and userId", async () => {
    await markAllRead(TRIP_ID);
    expect(tripMemberUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: TRIP_ID, userId: USER_ID },
      }),
    );
  });

  it("sets lastReadActivityAt to a Date", async () => {
    await markAllRead(TRIP_ID);
    expect(tripMemberUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastReadActivityAt: expect.any(Date),
        }),
      }),
    );
  });

  it("is access-checked before the write", async () => {
    // markAllRead's guard is requireUser (not requireTripAccess) — it scopes
    // the update by tripId + the caller's own userId rather than checking
    // trip membership, so requireUser is the guard whose ordering matters here.
    await markAllRead(TRIP_ID);

    expect(requireUserMock).toHaveBeenCalled();
    expectAccessCheckedBeforeWrite(requireUserMock, tripMemberUpdateManyMock);
  });
});
