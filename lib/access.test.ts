import { describe, expect, it } from "vitest";
import { findMembership } from "@/lib/access";

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
