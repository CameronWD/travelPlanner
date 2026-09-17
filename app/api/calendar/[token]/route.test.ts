import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the public ICS feed route — focused on the type filter: the feed's
 * includeTransport/includeAccommodation/includeActivities flags must exclude the
 * unticked event types from the serialized calendar body.
 */

const {
  feedFindUniqueMock,
  stopFindManyMock,
  itemFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
} = vi.hoisted(() => ({
  feedFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    calendarFeed: { findUnique: feedFindUniqueMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
  },
}));

import { GET } from "./route";

const ITEM_TITLE = "Louvre Visit";
const TRANSPORT_MARKER = "✈";
const ACCOMMODATION_MARKER = "🛏 Stay:";

/** Seed all four findMany calls with exactly one row each. */
function seedRows() {
  stopFindManyMock.mockResolvedValue([
    { id: "stop-1", name: "Paris", timezone: "Europe/Paris" },
  ]);
  itemFindManyMock.mockResolvedValue([
    {
      id: "item-1",
      title: ITEM_TITLE,
      category: "Activity",
      date: "2026-07-01",
      startTime: null,
      endTime: null,
      stopId: "stop-1",
      address: null,
      link: null,
      booking: null,
      notes: null,
    },
  ]);
  transportFindManyMock.mockResolvedValue([
    {
      id: "trans-1",
      mode: "flight",
      depPlace: "London",
      arrPlace: "Paris",
      depAt: new Date("2026-07-01T08:00:00Z"),
      arrAt: new Date("2026-07-01T09:30:00Z"),
      reference: "BA123",
    },
  ]);
  accommodationFindManyMock.mockResolvedValue([
    {
      id: "accom-1",
      name: "Hotel Lumiere",
      checkIn: "2026-07-01",
      checkOut: "2026-07-04",
      address: null,
      confirmation: null,
      notes: null,
    },
  ]);
}

/** Invoke GET for a feed with the given flags and return the ICS body string. */
async function getBody(flags: {
  includeTransport: boolean;
  includeAccommodation: boolean;
  includeActivities: boolean;
}) {
  feedFindUniqueMock.mockResolvedValue({
    ...flags,
    trip: { id: "trip-1", name: "Summer Trip" },
  });
  const res = await GET(new Request("http://localhost/api/calendar/tok-1"), {
    params: Promise.resolve({ token: "tok-1" }),
  });
  expect(res.status).toBe(200);
  return res.text();
}

afterEach(() => vi.clearAllMocks());

describe("GET /api/calendar/[token] — type filter", () => {
  it("returns 404 when the feed token is unknown", async () => {
    feedFindUniqueMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/calendar/nope"), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(res.status).toBe(404);
    expect(stopFindManyMock).not.toHaveBeenCalled();
  });

  it("all flags true → includes transport, accommodation and item events", async () => {
    seedRows();
    const body = await getBody({
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: true,
    });
    expect(body).toContain(TRANSPORT_MARKER);
    expect(body).toContain("CATEGORIES:Transport");
    expect(body).toContain(ACCOMMODATION_MARKER);
    expect(body).toContain("CATEGORIES:Accommodation");
    expect(body).toContain(ITEM_TITLE);
  });

  it("includeTransport:false → excludes transport, keeps accommodation + item", async () => {
    seedRows();
    const body = await getBody({
      includeTransport: false,
      includeAccommodation: true,
      includeActivities: true,
    });
    expect(body).not.toContain(TRANSPORT_MARKER);
    expect(body).not.toContain("CATEGORIES:Transport");
    expect(body).toContain(ACCOMMODATION_MARKER);
    expect(body).toContain(ITEM_TITLE);
  });

  it("includeAccommodation:false → excludes accommodation, keeps transport + item", async () => {
    seedRows();
    const body = await getBody({
      includeTransport: true,
      includeAccommodation: false,
      includeActivities: true,
    });
    expect(body).not.toContain(ACCOMMODATION_MARKER);
    expect(body).not.toContain("CATEGORIES:Accommodation");
    expect(body).toContain(TRANSPORT_MARKER);
    expect(body).toContain(ITEM_TITLE);
  });

  it("includeActivities:false → excludes the item, keeps transport + accommodation", async () => {
    seedRows();
    const body = await getBody({
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: false,
    });
    expect(body).not.toContain(ITEM_TITLE);
    expect(body).toContain(TRANSPORT_MARKER);
    expect(body).toContain(ACCOMMODATION_MARKER);
  });
});

/**
 * Alarm regression guards (Task 3). Without these, the route's `select`
 * clauses could silently lose alarmTransport/alarmCheckOut (feed) or
 * checkOutTime/stopId (accommodation) and nothing here would fail — alarms
 * would just quietly stop firing, or a check-out alarm would silently fall
 * back to UTC and lose its check-out time. Vienna in December is a fixed
 * UTC+1 offset (no DST), so a UTC fallback produces a visibly different
 * instant than the correct one.
 */
describe("GET /api/calendar/[token] — Alarms", () => {
  it("alarmTransport:true → BEGIN:VALARM with the lead time for each transport mode", async () => {
    feedFindUniqueMock.mockResolvedValue({
      includeTransport: true,
      includeAccommodation: false,
      includeActivities: false,
      alarmTransport: true,
      alarmCheckOut: false,
      trip: { id: "trip-1", name: "Summer Trip" },
    });
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([
      {
        id: "trans-flight",
        mode: "FLIGHT",
        depPlace: "London",
        arrPlace: "Vienna",
        depAt: new Date("2026-12-10T08:00:00Z"),
        arrAt: new Date("2026-12-10T10:30:00Z"),
        reference: "BA123",
      },
      {
        id: "trans-train",
        mode: "TRAIN",
        depPlace: "Vienna",
        arrPlace: "Salzburg",
        depAt: new Date("2026-12-11T09:00:00Z"),
        arrAt: new Date("2026-12-11T11:30:00Z"),
        reference: null,
      },
    ]);

    const res = await GET(new Request("http://localhost/api/calendar/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("BEGIN:VALARM");
    expect(body).toContain("TRIGGER:-PT3H"); // FLIGHT lead time
    expect(body).toContain("TRIGGER:-PT2H"); // non-flight lead time

    // Guards the feed select itself: if alarmTransport/alarmCheckOut are ever
    // dropped from it, this fails even though the mock's return value doesn't.
    expect(feedFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          alarmTransport: true,
          alarmCheckOut: true,
        }),
      }),
    );
  });

  it("alarmCheckOut:true → absolute trigger instant computed in the stay's own (non-UTC) timezone", async () => {
    feedFindUniqueMock.mockResolvedValue({
      includeTransport: false,
      includeAccommodation: true,
      includeActivities: false,
      alarmTransport: false,
      alarmCheckOut: true,
      trip: { id: "trip-1", name: "Winter Trip" },
    });
    stopFindManyMock.mockResolvedValue([
      { id: "stop-vienna", name: "Vienna", timezone: "Europe/Vienna" },
    ]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([
      {
        id: "accom-vienna",
        name: "Hotel Vienna",
        checkIn: "2026-12-07",
        checkOut: "2026-12-10",
        address: null,
        confirmation: null,
        notes: null,
        checkOutTime: "10:00",
        stopId: "stop-vienna",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/calendar/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();

    // 08:00 in Europe/Vienna (UTC+1 in December, no DST) is 07:00 UTC. If
    // stopId were dropped, the alarm would fall back to UTC and this would
    // read T080000Z instead — a visibly different, wrong instant.
    expect(body).toContain("TRIGGER;VALUE=DATE-TIME:20261210T070000Z");
    // If checkOutTime were dropped, the alarm's DESCRIPTION would omit "by 10:00".
    expect(body).toContain("DESCRIPTION:Check out of Hotel Vienna by 10:00");

    // Guards the accommodation select itself: if checkOutTime/stopId are ever
    // dropped from it, this fails even though the mock's return value doesn't.
    expect(accommodationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          checkOutTime: true,
          stopId: true,
        }),
      }),
    );
  });

  it("both alarm flags false → no BEGIN:VALARM at all, even with transport and accommodation present", async () => {
    feedFindUniqueMock.mockResolvedValue({
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: false,
      alarmTransport: false,
      alarmCheckOut: false,
      trip: { id: "trip-1", name: "Winter Trip" },
    });
    stopFindManyMock.mockResolvedValue([
      { id: "stop-vienna", name: "Vienna", timezone: "Europe/Vienna" },
    ]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([
      {
        id: "trans-flight",
        mode: "FLIGHT",
        depPlace: "London",
        arrPlace: "Vienna",
        depAt: new Date("2026-12-10T08:00:00Z"),
        arrAt: new Date("2026-12-10T10:30:00Z"),
        reference: "BA123",
      },
    ]);
    accommodationFindManyMock.mockResolvedValue([
      {
        id: "accom-vienna",
        name: "Hotel Vienna",
        checkIn: "2026-12-07",
        checkOut: "2026-12-10",
        address: null,
        confirmation: null,
        notes: null,
        checkOutTime: "10:00",
        stopId: "stop-vienna",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/calendar/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).not.toContain("BEGIN:VALARM");
  });
});
