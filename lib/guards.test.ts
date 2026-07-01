import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the framework + db dependencies so we can test the requireTripAccess
// wrapper's branching (member allowed vs non-member denied) in isolation.
// vi.hoisted keeps the mock fns available to the hoisted vi.mock factories.
const { authMock, findManyMock, forkFindUniqueMock, notFoundMock, redirectMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    findManyMock: vi.fn(),
    forkFindUniqueMock: vi.fn(),
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
  db: {
    tripMember: { findMany: findManyMock },
    fork: { findUnique: forkFindUniqueMock },
  },
}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

import { assertForkingAllowed, requireForkAccess, requireTripAccess } from "@/lib/guards";

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

describe("assertForkingAllowed", () => {
  it.each(["sketching", "planning", "final-prep"] as const)(
    "allows %s",
    (p) => expect(() => assertForkingAllowed(p)).not.toThrow(),
  );
  it.each(["travelling", "past"] as const)(
    "blocks %s",
    (p) => expect(() => assertForkingAllowed(p)).toThrow(),
  );
});

describe("requireForkAccess", () => {
  const forkRow = {
    id: "fork-1",
    tripId: "trip-1",
    trip: { id: "trip-1", startDate: "2026-09-01", endDate: "2026-09-14" },
  };

  it("returns user, fork, and trip when fork exists and user is a member", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    forkFindUniqueMock.mockResolvedValue(forkRow);
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    const result = await requireForkAccess("fork-1");

    expect(result.user.id).toBe("u1");
    expect(result.fork.id).toBe("fork-1");
    expect(result.trip).toEqual({ id: "trip-1", startDate: "2026-09-01", endDate: "2026-09-14" });
    expect(forkFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fork-1" } }),
    );
  });

  it("calls notFound when the fork does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    forkFindUniqueMock.mockResolvedValue(null);

    await expect(requireForkAccess("missing-fork")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("calls notFound when the user is not a member of the fork's trip", async () => {
    authMock.mockResolvedValue({ user: { id: "stranger" } });
    forkFindUniqueMock.mockResolvedValue(forkRow);
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);

    await expect(requireForkAccess("fork-1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("redirects to sign-in when the user is not authenticated", async () => {
    authMock.mockResolvedValue(null);
    forkFindUniqueMock.mockResolvedValue(forkRow);

    await expect(requireForkAccess("fork-1")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledOnce();
  });
});
