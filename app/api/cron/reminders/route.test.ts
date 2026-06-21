import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tests for the cron reminders endpoint — focused on the fail-closed auth gate
 * (highest-risk code) plus the basic processing path.
 */

const {
  reminderFindManyMock,
  reminderUpdateMock,
  pushFindManyMock,
  pushDeleteManyMock,
  sendPushMock,
} = vi.hoisted(() => ({
  reminderFindManyMock: vi.fn(),
  reminderUpdateMock: vi.fn(),
  pushFindManyMock: vi.fn(),
  pushDeleteManyMock: vi.fn(),
  sendPushMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    reminder: { findMany: reminderFindManyMock, update: reminderUpdateMock },
    pushSubscription: {
      findMany: pushFindManyMock,
      deleteMany: pushDeleteManyMock,
    },
  },
}));
vi.mock("@/lib/push", () => ({
  sendPush: sendPushMock,
  buildNotificationPayload: ({ title }: { title: string }) =>
    JSON.stringify({ title }),
}));

import { GET } from "./route";

function req(opts: { secret?: string; header?: string } = {}): NextRequest {
  const url = opts.secret
    ? `http://localhost/api/cron/reminders?secret=${opts.secret}`
    : "http://localhost/api/cron/reminders";
  return new NextRequest(url, {
    headers: opts.header ? { authorization: opts.header } : {},
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/reminders — auth (fail-closed)", () => {
  it("returns 401 when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(req({ secret: "anything" }));
    expect(res.status).toBe(401);
    expect(reminderFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the provided secret is wrong", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    const res = await GET(req({ secret: "wrong" }));
    expect(res.status).toBe(401);
    expect(reminderFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the correct secret via query param", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    const res = await GET(req({ secret: "right" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, sent: 0, skipped: 0 });
  });

  it("returns 200 with the correct secret via Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    const res = await GET(req({ header: "Bearer right" }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/cron/reminders — processing", () => {
  it("processes a due reminder, skips push when unconfigured, and marks it sent", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([
      {
        id: "rem-1",
        tripId: "trip-1",
        title: "Check in opens",
        trip: { members: [{ userId: "user-1" }] },
      },
    ]);
    pushFindManyMock.mockResolvedValue([
      { id: "sub-1", endpoint: "https://e", p256dh: "p", auth: "a" },
    ]);
    sendPushMock.mockResolvedValue({ sent: false, skipped: true });

    const res = await GET(req({ secret: "right" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 1, sent: 0, skipped: 1 });
    expect(reminderUpdateMock).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { sent: true },
    });
  });
});
