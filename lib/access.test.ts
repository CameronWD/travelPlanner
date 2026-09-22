import { afterEach, describe, expect, it } from "vitest";
import { findMembership, isTripOwnerOrAdmin } from "@/lib/access";

describe("findMembership", () => {
  const members = [
    { userId: "u1", role: "owner" },
    { userId: "u2", role: "member" },
  ];

  it("returns the membership for a trip member", () => {
    expect(findMembership(members, "u2")).toEqual({
      userId: "u2",
      role: "member",
    });
  });

  it("returns the owner membership", () => {
    expect(findMembership(members, "u1")).toEqual({
      userId: "u1",
      role: "owner",
    });
  });

  it("denies a non-member by returning null", () => {
    expect(findMembership(members, "stranger")).toBeNull();
  });

  it("returns null when there are no members", () => {
    expect(findMembership([], "u1")).toBeNull();
  });
});

// ARCH-BND-3: one named owner/admin guard, replacing three hand-rolled
// copies in server/actions/trips.ts and server/actions/invites.ts.
describe("isTripOwnerOrAdmin", () => {
  const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
  });

  it("is true for the owner", () => {
    expect(isTripOwnerOrAdmin({ role: "owner" }, "member@example.com")).toBe(true);
  });

  it("is false for a plain member who is not an admin", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isTripOwnerOrAdmin({ role: "member" }, "member@example.com")).toBe(false);
  });

  it("is true for a non-owner member whose email is in ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "ops@example.com";
    expect(isTripOwnerOrAdmin({ role: "member" }, "ops@example.com")).toBe(true);
  });
});
