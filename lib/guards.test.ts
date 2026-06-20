import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the framework + db dependencies so we can test the requireTripAccess
// wrapper's branching (member allowed vs non-member denied) in isolation.
// vi.hoisted keeps the mock fns available to the hoisted vi.mock factories.
const { authMock, findManyMock, notFoundMock, redirectMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    findManyMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    redirectMock: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
  }),
);

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: { tripMember: { findMany: findManyMock } },
}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

import { requireTripAccess } from "@/lib/guards";

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireTripAccess", () => {
  it("allows a trip member and returns their membership", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    const result = await requireTripAccess("trip1");

    expect(result.user.id).toBe("u1");
    expect(result.membership).toEqual({ userId: "u1", role: "owner" });
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("denies a non-member with notFound (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "stranger" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    await expect(requireTripAccess("trip1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("redirects an unauthenticated user to sign-in", async () => {
    authMock.mockResolvedValue(null);

    await expect(requireTripAccess("trip1")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledOnce();
  });
});
