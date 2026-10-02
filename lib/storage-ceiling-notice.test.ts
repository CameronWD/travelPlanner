import { beforeEach, describe, expect, it, vi } from "vitest";

const { noticeFind, noticeUpsert, notifyAdminsMock } = vi.hoisted(() => ({
  noticeFind: vi.fn(),
  noticeUpsert: vi.fn(),
  notifyAdminsMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ db: { operatorNotice: { findUnique: noticeFind, upsert: noticeUpsert } } }));
vi.mock("@/lib/admin-notify", () => ({ notifyAdmins: notifyAdminsMock }));

import { notifyStorageCeiling } from "./storage-ceiling-notice";

beforeEach(() => {
  noticeFind.mockReset();
  noticeUpsert.mockReset();
  notifyAdminsMock.mockReset().mockResolvedValue(undefined);
});

describe("notifyStorageCeiling", () => {
  it("pushes once and records the time", async () => {
    noticeFind.mockResolvedValue(null);
    await notifyStorageCeiling(new Date("2026-10-02T10:00:00Z"));
    expect(notifyAdminsMock).toHaveBeenCalledWith("Teepee storage is at its 8 GB ceiling", expect.any(String), "/admin");
    expect(noticeUpsert).toHaveBeenCalledOnce();
  });

  it("stays quiet within 24 hours of the last push", async () => {
    noticeFind.mockResolvedValue({ key: "storage-ceiling", lastSentAt: new Date("2026-10-02T00:00:00Z") });
    await notifyStorageCeiling(new Date("2026-10-02T10:00:00Z"));
    expect(notifyAdminsMock).not.toHaveBeenCalled();
  });

  it("pushes again after 24 hours", async () => {
    noticeFind.mockResolvedValue({ key: "storage-ceiling", lastSentAt: new Date("2026-10-01T09:00:00Z") });
    await notifyStorageCeiling(new Date("2026-10-02T10:00:00Z"));
    expect(notifyAdminsMock).toHaveBeenCalledOnce();
  });

  it("never throws when the db fails", async () => {
    noticeFind.mockRejectedValue(new Error("down"));
    await expect(notifyStorageCeiling()).resolves.toBeUndefined();
  });
});
