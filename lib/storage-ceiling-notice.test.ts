import { beforeEach, describe, expect, it, vi } from "vitest";

const { noticeFind, noticeUpsert, notifyAdminsMock, reportErrorMock } = vi.hoisted(() => ({
  noticeFind: vi.fn(),
  noticeUpsert: vi.fn(),
  notifyAdminsMock: vi.fn().mockResolvedValue(undefined),
  reportErrorMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ db: { operatorNotice: { findUnique: noticeFind, upsert: noticeUpsert } } }));
vi.mock("@/lib/admin-notify", () => ({ notifyAdmins: notifyAdminsMock }));
vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

import { notifyStorageCeiling } from "./storage-ceiling-notice";

beforeEach(() => {
  noticeFind.mockReset();
  noticeUpsert.mockReset();
  notifyAdminsMock.mockReset().mockResolvedValue(undefined);
  reportErrorMock.mockReset().mockResolvedValue(undefined);
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

  it("never throws when the db fails, and reports the error", async () => {
    const err = new Error("down");
    noticeFind.mockRejectedValue(err);
    await expect(notifyStorageCeiling()).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ route: expect.stringContaining("storage-ceiling-notice") }),
    );
  });

  it("calls notifyAdmins BEFORE upserting lastSentAt", async () => {
    noticeFind.mockResolvedValue(null);
    const order: string[] = [];
    notifyAdminsMock.mockImplementation(async () => { order.push("notifyAdmins"); });
    noticeUpsert.mockImplementation(async () => { order.push("upsert"); });
    await notifyStorageCeiling(new Date("2026-10-02T10:00:00Z"));
    expect(order).toEqual(["notifyAdmins", "upsert"]);
  });

  it("does not record lastSentAt (and reports the error) when notifyAdmins throws", async () => {
    noticeFind.mockResolvedValue(null);
    const err = new Error("push failed");
    notifyAdminsMock.mockRejectedValue(err);
    await expect(notifyStorageCeiling(new Date("2026-10-02T10:00:00Z"))).resolves.toBeUndefined();
    expect(noticeUpsert).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ route: expect.stringContaining("storage-ceiling-notice") }),
    );
  });
});
