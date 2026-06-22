import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccessMock,
  revalidatePathMock,
  feedFindFirstMock,
  feedCreateMock,
  feedUpsertMock,
  feedDeleteManyMock,
  feedUpdateManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  revalidatePathMock: vi.fn(),
  feedFindFirstMock: vi.fn(),
  feedCreateMock: vi.fn(),
  feedUpsertMock: vi.fn(),
  feedDeleteManyMock: vi.fn().mockResolvedValue({ count: 1 }),
  feedUpdateManyMock: vi.fn().mockResolvedValue({ count: 1 }),
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
      updateMany: feedUpdateManyMock,
    },
  },
}));

import {
  getCalendarFeed,
  createCalendarFeed,
  rotateCalendarFeed,
  revokeCalendarFeed,
  updateCalendarFeedFilter,
} from "./calendar-feed";

const TRIP_ID = "trip-abc";
afterEach(() => vi.clearAllMocks());

describe("calendar feed actions", () => {
  it("getCalendarFeed returns the token and type filters when one exists", async () => {
    feedFindFirstMock.mockResolvedValue({
      token: "tok-1",
      includeTransport: false,
      includeAccommodation: true,
      includeActivities: true,
    });
    expect(await getCalendarFeed(TRIP_ID)).toEqual({
      token: "tok-1",
      includeTransport: false,
      includeAccommodation: true,
      includeActivities: true,
    });
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

  it("updateCalendarFeedFilter updates the feed with the given flags", async () => {
    const filter = {
      includeTransport: false,
      includeAccommodation: true,
      includeActivities: false,
    };
    await updateCalendarFeedFilter(TRIP_ID, filter);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expect(feedUpdateManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID },
      data: filter,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
  });
});
