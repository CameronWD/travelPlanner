import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccessMock,
  revalidatePathMock,
  feedFindFirstMock,
  feedCreateMock,
  feedUpsertMock,
  feedDeleteManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  revalidatePathMock: vi.fn(),
  feedFindFirstMock: vi.fn(),
  feedCreateMock: vi.fn(),
  feedUpsertMock: vi.fn(),
  feedDeleteManyMock: vi.fn().mockResolvedValue({ count: 1 }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    calendarFeed: {
      findFirst: feedFindFirstMock,
      create: feedCreateMock,
      upsert: feedUpsertMock,
      deleteMany: feedDeleteManyMock,
    },
  },
}));

import { getCalendarFeed, createCalendarFeed, rotateCalendarFeed, revokeCalendarFeed } from "./calendar-feed";

const TRIP_ID = "trip-abc";
afterEach(() => vi.clearAllMocks());

describe("calendar feed actions", () => {
  it("getCalendarFeed returns the token when one exists", async () => {
    feedFindFirstMock.mockResolvedValue({ token: "tok-1" });
    expect(await getCalendarFeed(TRIP_ID)).toEqual({ token: "tok-1" });
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("getCalendarFeed returns null when none exists", async () => {
    feedFindFirstMock.mockResolvedValue(null);
    expect(await getCalendarFeed(TRIP_ID)).toBeNull();
  });

  it("createCalendarFeed is idempotent — returns existing token", async () => {
    feedFindFirstMock.mockResolvedValue({ token: "existing" });
    const r = await createCalendarFeed(TRIP_ID);
    expect(r).toEqual({ token: "existing" });
    expect(feedCreateMock).not.toHaveBeenCalled();
  });

  it("createCalendarFeed creates a token when none exists", async () => {
    feedFindFirstMock.mockResolvedValue(null);
    feedCreateMock.mockResolvedValue({ token: "new-token" });
    const r = await createCalendarFeed(TRIP_ID);
    expect(r).toEqual({ token: "new-token" });
    expect(feedCreateMock).toHaveBeenCalledOnce();
  });

  it("rotateCalendarFeed upserts a fresh token", async () => {
    feedUpsertMock.mockResolvedValue({ token: "rotated" });
    const r = await rotateCalendarFeed(TRIP_ID);
    expect(r).toEqual({ token: "rotated" });
    expect(feedUpsertMock).toHaveBeenCalledOnce();
  });

  it("revokeCalendarFeed deletes the feed", async () => {
    await revokeCalendarFeed(TRIP_ID);
    expect(feedDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: TRIP_ID } });
  });
});
