import { describe, expect, it } from "vitest";
import {
  decideMembershipsToCreate,
  type PendingInviteLike,
  type ExistingMembershipLike,
} from "./invites";

/**
 * Tests for the pure invite-acceptance decision helper.
 *
 * No mocks needed — this function is side-effect-free.
 */

const USER_ID = "user-alice";
const USER_EMAIL = "alice@example.com";

function invite(id: string, tripId: string, email = USER_EMAIL): PendingInviteLike {
  return { id, tripId, email };
}

function membership(tripId: string, userId = USER_ID): ExistingMembershipLike {
  return { tripId, userId };
}

describe("decideMembershipsToCreate", () => {
  it("creates a member for a matching pending invite with no existing membership", () => {
    const invites = [invite("inv-1", "trip-1")];
    const memberships: ExistingMembershipLike[] = [];

    const result = decideMembershipsToCreate(invites, memberships, USER_ID, USER_EMAIL);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("inv-1");
    expect(result[0].tripId).toBe("trip-1");
  });

  it("skips an invite when the user is already a member of that trip", () => {
    const invites = [invite("inv-1", "trip-1")];
    const memberships = [membership("trip-1")];

    const result = decideMembershipsToCreate(invites, memberships, USER_ID, USER_EMAIL);

    expect(result).toHaveLength(0);
  });

  it("matches email case-insensitively", () => {
    const invites = [
      invite("inv-1", "trip-1", "Alice@EXAMPLE.COM"),
      invite("inv-2", "trip-2", "ALICE@example.com"),
    ];
    const memberships: ExistingMembershipLike[] = [];

    const result = decideMembershipsToCreate(invites, memberships, USER_ID, "alice@example.com");

    expect(result).toHaveLength(2);
  });

  it("skips invites for a different email entirely", () => {
    const invites = [invite("inv-1", "trip-1", "other@example.com")];
    const memberships: ExistingMembershipLike[] = [];

    const result = decideMembershipsToCreate(invites, memberships, USER_ID, USER_EMAIL);

    expect(result).toHaveLength(0);
  });

  it("deduplicates by tripId — only one TripMember per trip even with multiple invites", () => {
    const invites = [
      invite("inv-1", "trip-1"),
      invite("inv-2", "trip-1"), // duplicate trip
    ];
    const memberships: ExistingMembershipLike[] = [];

    const result = decideMembershipsToCreate(invites, memberships, USER_ID, USER_EMAIL);

    expect(result).toHaveLength(1);
    expect(result[0].tripId).toBe("trip-1");
  });

  it("handles multiple trips — creates a member for each trip with a matching invite", () => {
    const invites = [
      invite("inv-1", "trip-1"),
      invite("inv-2", "trip-2"),
      invite("inv-3", "trip-3"),
    ];
    const memberships = [membership("trip-2")]; // already a member of trip-2

    const result = decideMembershipsToCreate(invites, memberships, USER_ID, USER_EMAIL);

    expect(result).toHaveLength(2);
    const tripIds = result.map((r) => r.tripId);
    expect(tripIds).toContain("trip-1");
    expect(tripIds).toContain("trip-3");
    expect(tripIds).not.toContain("trip-2");
  });

  it("returns an empty array when there are no pending invites", () => {
    const result = decideMembershipsToCreate([], [], USER_ID, USER_EMAIL);
    expect(result).toHaveLength(0);
  });

  it("is safe to call with an empty existing memberships list", () => {
    const invites = [invite("inv-1", "trip-1")];
    const result = decideMembershipsToCreate(invites, [], USER_ID, USER_EMAIL);
    expect(result).toHaveLength(1);
  });
});
