import { beforeEach, describe, expect, it, vi } from "vitest";

// Spec 2026-10-17 R12: an Admin sets each account's Review permission on the
// Admin page. Every action calls requireAdmin() first (as access-requests.ts):
// the page guard alone does nothing for someone who already has an action id.
const { requireAdminMock, userFindManyMock, userUpdateManyMock, revalidateAdminMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  userFindManyMock: vi.fn(),
  userUpdateManyMock: vi.fn(),
  revalidateAdminMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/db", () => ({ db: { user: { findMany: userFindManyMock, updateMany: userUpdateManyMock } } }));
vi.mock("@/lib/revalidate", () => ({ revalidateAdmin: revalidateAdminMock }));

import { listReviewPermissions, setReviewPermission } from "@/server/actions/review-permission";

const traveller = (o: Record<string, unknown>) => ({
  name: null, image: null, displayName: null, photoKey: null, photoUpdatedAt: null, photoFocalX: null, photoFocalY: null, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue({ id: "admin-1", email: "ops@example.com" });
});

describe("listReviewPermissions", () => {
  it("lists every account by email with its permission and display name; an unknown value reads as OFF", async () => {
    userFindManyMock.mockResolvedValue([
      traveller({ id: "u1", email: "cam@example.com", displayName: "Cam", reviewPermission: "UNLIMITED" }),
      traveller({ id: "u2", email: "pat@example.com", name: "Pat Lee", reviewPermission: "LIMITED" }),
      traveller({ id: "u3", email: "sam@example.com", reviewPermission: "WHATEVER" }),
    ]);
    expect(await listReviewPermissions()).toEqual([
      { userId: "u1", email: "cam@example.com", name: "Cam", permission: "UNLIMITED" },
      { userId: "u2", email: "pat@example.com", name: "Pat Lee", permission: "LIMITED" },
      { userId: "u3", email: "sam@example.com", name: "sam", permission: "OFF" },
    ]);
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { email: "asc" } }));
  });

  it("a non-admin is refused before anything is read", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(listReviewPermissions()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(userFindManyMock).not.toHaveBeenCalled();
  });
});

describe("setReviewPermission", () => {
  it("writes the permission and revalidates /admin", async () => {
    userUpdateManyMock.mockResolvedValue({ count: 1 });
    expect(await setReviewPermission("u2", "UNLIMITED")).toEqual({ success: true, permission: "UNLIMITED" });
    expect(userUpdateManyMock).toHaveBeenCalledWith({ where: { id: "u2" }, data: { reviewPermission: "UNLIMITED" } });
    expect(revalidateAdminMock).toHaveBeenCalled();
  });

  it("refuses an empty or blank userId, and writes nothing", async () => {
    expect(await setReviewPermission("", "LIMITED")).toEqual({ success: false, errors: { _: ["Pick an account."] } });
    expect(await setReviewPermission("   ", "LIMITED")).toEqual({ success: false, errors: { _: ["Pick an account."] } });
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("refuses a value that isn't Off, Limited or Unlimited, and writes nothing", async () => {
    const result = await setReviewPermission("u2", "ADMIN");
    expect(result).toEqual({ success: false, errors: { _: ["Pick Off, Limited or Unlimited."] } });
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("says so when the account no longer exists", async () => {
    userUpdateManyMock.mockResolvedValue({ count: 0 });
    expect(await setReviewPermission("gone", "LIMITED")).toEqual({ success: false, errors: { _: ["That account no longer exists."] } });
    expect(revalidateAdminMock).not.toHaveBeenCalled();
  });

  it("a non-admin is refused before anything is written", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(setReviewPermission("u2", "UNLIMITED")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });
});
