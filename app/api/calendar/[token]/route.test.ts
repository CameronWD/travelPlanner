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
