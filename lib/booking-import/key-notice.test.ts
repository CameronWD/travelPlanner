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

import { notifyBookingImportKeyRejected } from "./key-notice";

const NOW = new Date("2026-11-24T12:00:00Z");
const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

beforeEach(() => {
  noticeFind.mockReset();
  noticeUpsert.mockReset();
  notifyAdminsMock.mockReset().mockResolvedValue(undefined);
  reportErrorMock.mockReset().mockResolvedValue(undefined);
});

describe("notifyBookingImportKeyRejected", () => {
  it("pushes the Admins and records the time under its own key", async () => {
    noticeFind.mockResolvedValue(null);
    await notifyBookingImportKeyRejected(NOW);
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      "Booking import is failing",
      "Anthropic rejected the API key. Replace ANTHROPIC_API_KEY in Vercel and redeploy.",
      "/admin",
    );
    expect(noticeUpsert).toHaveBeenCalledWith({
      where: { key: "booking-import-key" },
      create: { key: "booking-import-key", lastSentAt: NOW },
      update: { lastSentAt: NOW },
    });
  });

  it("stays quiet 23 hours after the last push", async () => {
    noticeFind.mockResolvedValue({ key: "booking-import-key", lastSentAt: hoursBefore(23) });
    await notifyBookingImportKeyRejected(NOW);
    expect(notifyAdminsMock).not.toHaveBeenCalled();
  });

  it("pushes again 25 hours after the last push", async () => {
    noticeFind.mockResolvedValue({ key: "booking-import-key", lastSentAt: hoursBefore(25) });
    await notifyBookingImportKeyRejected(NOW);
    expect(notifyAdminsMock).toHaveBeenCalledOnce();
  });

  it("does not throw or start the quiet period when the push fails", async () => {
    noticeFind.mockResolvedValue(null);
    const err = new Error("push failed");
    notifyAdminsMock.mockRejectedValue(err);
    await expect(notifyBookingImportKeyRejected(NOW)).resolves.toBeUndefined();
    expect(noticeUpsert).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ route: expect.stringContaining("key-notice") }),
    );
  });
});
