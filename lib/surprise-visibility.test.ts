import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  stopFindManyMock,
  itemFindManyMock,
  accommodationFindManyMock,
  tripMemberFindManyMock,
} = vi.hoisted(() => ({
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    tripMember: { findMany: tripMemberFindManyMock },
  },
}));

import { loadSurpriseVisibility, maskSurpriseStops, NO_SURPRISES } from "./surprise-visibility";

const TRIP_ID = "trip-1";
const NOW = new Date("2026-06-15T12:00:00.000Z");

const members = [
  { user: { id: "cam", name: "Cam Williams", image: null } },
  { user: { id: "sam", name: "Sam Jones", image: null } },
];

function liveStopRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "stop-1",
    departDate: "2026-06-20",
    timezone: "UTC",
    surprisePlannerId: "cam",
    surpriseForIds: '["sam"]',
    surpriseRevealedAt: null,
    ...overrides,
  };
}

function liveItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "item-x",
    forkId: null,
    stopId: null,
    date: "2026-06-20",
    startTime: "09:00",
    endTime: null,
    sortOrder: 3,
    hiddenFromShares: false,
    surprisePlannerId: "cam",
    surpriseForIds: '["sam"]',
    surpriseRevealedAt: null,
    stop: null,
    ...overrides,
  };
}

beforeEach(() => {
  stopFindManyMock.mockReset().mockResolvedValue([]);
  itemFindManyMock.mockReset().mockResolvedValue([]);
  accommodationFindManyMock.mockReset().mockResolvedValue([]);
  tripMemberFindManyMock.mockReset().mockResolvedValue(members);
});

describe("loadSurpriseVisibility", () => {
  it("case 1: no Surprise rows at all -> isEmpty, every where.* is {}, no inside queries", async () => {
    const v = await loadSurpriseVisibility(TRIP_ID, "sam", { now: NOW });

    expect(v.isEmpty).toBe(true);
    expect(v).toMatchObject({ ...NO_SURPRISES, viewerId: "sam" });
    for (const w of Object.values(v.where)) expect(w).toEqual({});
    expect(accommodationFindManyMock).not.toHaveBeenCalled();
    expect(itemFindManyMock).toHaveBeenCalledTimes(1); // only the pre-query
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
  });

  it("case 2: a live Surprise Stop hides its insides from the named viewer", async () => {
    stopFindManyMock.mockResolvedValue([liveStopRow()]);
    itemFindManyMock
      .mockResolvedValueOnce([]) // pre-query: no live Items
      .mockResolvedValueOnce([{ id: "item-in-1" }]); // inside query
    accommodationFindManyMock.mockResolvedValue([{ id: "acc-1" }]);

    const v = await loadSurpriseVisibility(TRIP_ID, "sam", { now: NOW });

    expect(v.isEmpty).toBe(false);
    expect(v.hiddenStopIds).toEqual(["stop-1"]);
    expect(v.hiddenItemIds).toEqual(["item-in-1"]);
    expect(v.hiddenAccommodationIds).toEqual(["acc-1"]);
    expect(v.where.item).toEqual({
      AND: [{ OR: [{ stopId: null }, { stopId: { notIn: ["stop-1"] } }] }, { id: { notIn: [] } }],
    });
    expect(v.where.cost).toEqual({
      AND: [{ OR: [{ ownerId: null }, { ownerId: { notIn: ["item-in-1", "acc-1"] } }] }],
    });
    // Accommodation.stopId and Note.targetId are non-nullable columns, so
    // their fragments are the plain notIn form -- the OR-with-null form is
    // an invalid Prisma filter on them and throws at runtime.
    expect(v.where.accommodation).toEqual({ AND: [{ stopId: { notIn: ["stop-1"] } }] });
    expect(v.where.note).toEqual({
      AND: [{ targetId: { notIn: ["stop-1", "item-in-1", "acc-1"] } }],
    });
    // Reminder.stopId and Attachment.targetId are nullable, so they keep the
    // OR-with-null form.
    expect(v.where.reminder).toEqual({
      AND: [{ OR: [{ stopId: null }, { stopId: { notIn: ["stop-1"] } }] }],
    });
    expect(v.where.attachment).toEqual({
      AND: [{ OR: [{ targetId: null }, { targetId: { notIn: ["stop-1", "item-in-1", "acc-1"] } }] }],
    });
    expect(v.where.dayTitle).toEqual({ AND: [{ stopId: { notIn: ["stop-1"] } }] });
    expect(v.where.activity).toEqual({
      AND: [{ OR: [{ surpriseOfId: null }, { surpriseOfId: { notIn: ["stop-1"] } }] }],
    });
  });

  it("case 3: the planner viewing the same rows sees isEmpty, but still gets the Stop's view", async () => {
    stopFindManyMock.mockResolvedValue([liveStopRow()]);

    const v = await loadSurpriseVisibility(TRIP_ID, "cam", { now: NOW });

    expect(v.isEmpty).toBe(true);
    expect(accommodationFindManyMock).not.toHaveBeenCalled();
    const view = v.views.stops.get("stop-1");
    expect(view).toBeDefined();
    expect(view!.youAreSurprised).toBe(false);
  });

  it("case 4: a revealed Surprise is invisible as a Surprise at all -- isEmpty, no views", async () => {
    stopFindManyMock.mockResolvedValue([liveStopRow({ surpriseRevealedAt: new Date("2026-01-01T00:00:00Z") })]);

    const v = await loadSurpriseVisibility(TRIP_ID, "sam", { now: NOW });

    expect(v.isEmpty).toBe(true);
    expect(v.views.stops.size).toBe(0);
    expect(v.views.items.size).toBe(0);
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
  });

  it("case 5: a root Surprise Item produces one masked placeholder", async () => {
    itemFindManyMock.mockResolvedValueOnce([liveItemRow()]);

    const v = await loadSurpriseVisibility(TRIP_ID, "sam", { now: NOW });

    expect(v.hiddenRootItemIds).toEqual(["item-x"]);
    expect(v.placeholderItems).toHaveLength(1);
    const p = v.placeholderItems[0]!;
    expect(p).toMatchObject({
      id: "item-x",
      tripId: TRIP_ID,
      forkId: null,
      stopId: null,
      date: "2026-06-20",
      startTime: "09:00",
      endTime: null,
      title: "Surprise",
      category: "OTHER",
      address: null,
      link: null,
      booking: null,
      notes: null,
      lat: null,
      lng: null,
      countryCode: null,
      hiddenFromShares: false,
      sortOrder: 3,
      photoAttachmentId: null,
      sourceItemId: null,
    });
    expect(p.surprise.youAreSurprised).toBe(true);
  });

  it("case 5b: the placeholder carries the root Item's real hiddenFromShares, selected by the pre-query", async () => {
    itemFindManyMock.mockResolvedValueOnce([
      liveItemRow({ id: "item-off-shares", hiddenFromShares: true }),
      liveItemRow({ id: "item-on-shares", hiddenFromShares: false }),
    ]);

    const v = await loadSurpriseVisibility(TRIP_ID, null, { now: NOW });

    expect(itemFindManyMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      select: expect.objectContaining({ hiddenFromShares: true }),
    }));
    expect(v.placeholderItems.map((p) => [p.id, p.hiddenFromShares])).toEqual([
      ["item-off-shares", true],
      ["item-on-shares", false],
    ]);
  });

  it("case 6 (Review Focus 1): the inside-Items query filters by stopId only, never by date", async () => {
    stopFindManyMock.mockResolvedValue([liveStopRow()]);
    itemFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await loadSurpriseVisibility(TRIP_ID, "sam", { now: NOW });

    expect(itemFindManyMock).toHaveBeenNthCalledWith(2, {
      where: { tripId: TRIP_ID, stopId: { in: ["stop-1"] } },
      select: { id: true },
    });
  });

  it("case 7: a null viewer (share/calendar) is hidden from every live Surprise", async () => {
    stopFindManyMock.mockResolvedValue([liveStopRow()]);
    itemFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const v = await loadSurpriseVisibility(TRIP_ID, null, { now: NOW });

    expect(v.hiddenStopIds).toEqual(["stop-1"]);
    expect(v.viewerId).toBeNull();
  });
});

describe("maskSurpriseStops", () => {
  it("case 8: blanks notes only on hidden Stops, and attaches surprise (null for non-Surprise Stops)", () => {
    const v = { ...NO_SURPRISES, hiddenStopIds: ["stop-1"] };
    const view = { plannerId: "cam", plannerName: "Cam", forIds: ["sam"], forNames: ["Sam"], youAreSurprised: true };
    const views = new Map([["stop-1", view]]);
    const stops = [
      { id: "stop-1", notes: "secret plans" },
      { id: "stop-2", notes: "public notes" },
    ];

    const masked = maskSurpriseStops(stops, v, views);

    expect(masked[0]).toEqual({ id: "stop-1", notes: null, surprise: view });
    expect(masked[1]).toEqual({ id: "stop-2", notes: "public notes", surprise: null });
  });
});
