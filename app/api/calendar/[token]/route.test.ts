import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the public ICS feed route — focused on the type filter: the feed's
 * includeTransport/includeAccommodation/includeActivities flags must exclude the
 * unticked event types from the serialized calendar body.
 */

const {
  feedFindFirstMock,
  stopFindManyMock,
  itemFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  loadSurpriseVisibilityMock,
} = vi.hoisted(() => ({
  feedFindFirstMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    calendarFeed: { findFirst: feedFindFirstMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
  },
}));

// Surprise (ADR 0051): the feed asks the visibility loader with no viewer.
vi.mock("@/lib/surprise-visibility", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/surprise-visibility")>()),
  loadSurpriseVisibility: loadSurpriseVisibilityMock,
}));

import { GET } from "./route";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, placeholderItem, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

beforeEach(() => {
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
});

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
    },
  ]);
  accommodationFindManyMock.mockResolvedValue([
    {
      id: "accom-1",
      name: "Hotel Lumiere",
      checkIn: "2026-07-01",
      checkOut: "2026-07-04",
      address: null,
    },
  ]);
}

/** Invoke GET for a feed with the given flags and return the ICS body string. */
async function getBody(flags: {
  includeTransport: boolean;
  includeAccommodation: boolean;
  includeActivities: boolean;
}) {
  feedFindFirstMock.mockResolvedValue({
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
    feedFindFirstMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/calendar/nope"), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(res.status).toBe(404);
    expect(stopFindManyMock).not.toHaveBeenCalled();
  });

  // ADR 0067 (Recently deleted): the feed lookup itself excludes a Trip in
  // Recently deleted, same as an unknown token.
  it("looks the feed up with a filter that excludes a Trip in Recently deleted", async () => {
    feedFindFirstMock.mockResolvedValue(null);
    await GET(new Request("http://localhost/api/calendar/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(feedFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: "tok-1", trip: { deletedAt: null } } }),
    );
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
    feedFindFirstMock.mockResolvedValue({
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
      },
      {
        id: "trans-train",
        mode: "TRAIN",
        depPlace: "Vienna",
        arrPlace: "Salzburg",
        depAt: new Date("2026-12-11T09:00:00Z"),
        arrAt: new Date("2026-12-11T11:30:00Z"),
      },
    ]);

    const res = await GET(new Request("http://localhost/api/calendar/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("BEGIN:VALARM");
    expect(body).toContain("TRIGGER:-PT180M"); // FLIGHT lead time
    expect(body).toContain("TRIGGER:-PT120M"); // non-flight lead time

    // Guards the feed select itself: if alarmTransport/alarmCheckOut are ever
    // dropped from it, this fails even though the mock's return value doesn't.
    expect(feedFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          alarmTransport: true,
          alarmCheckOut: true,
        }),
      }),
    );
  });

  it("alarmCheckOut:true → absolute trigger instant computed in the stay's own (non-UTC) timezone", async () => {
    feedFindFirstMock.mockResolvedValue({
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

  it("alarmCheckOut:true, but the stay's own Stop is rough (no timezone) → publishes the check-out event with no VALARM", async () => {
    feedFindFirstMock.mockResolvedValue({
      includeTransport: false,
      includeAccommodation: true,
      includeActivities: false,
      alarmTransport: false,
      alarmCheckOut: true,
      trip: { id: "trip-1", name: "Loose Trip" },
    });
    // The route only fetches stops with arriveDate set, so a rough Stop (no
    // dates, no stored timezone) never appears here — even though the
    // Accommodation pinned to it is still fetched below.
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([
      {
        id: "accom-rough",
        name: "Somewhere TBD",
        checkIn: "2026-08-01",
        checkOut: "2026-08-04",
        address: null,
        checkOutTime: "10:00",
        stopId: "stop-rough",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/calendar/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();

    // The check-out itself is still real and belongs in the feed.
    expect(body).toContain(ACCOMMODATION_MARKER);
    expect(body).toContain("CATEGORIES:Accommodation");
    // But with no known timezone to resolve 08:00 against, a UTC fallback
    // would fire hours off local time — worse than no Alarm at all, since
    // TEEPEE can never observe whether it fired.
    expect(body).not.toContain("BEGIN:VALARM");
  });

  // Finding 4 (2026-09-20 review): the route used to feed `lib/ics.ts` a
  // truthy `s.timezone ?? "UTC"` fallback for a scheduled Stop returned with
  // `timezone: null` — which the `&& tz` guard added by an earlier task waves
  // straight through, firing a check-out Alarm at a confidently wrong hour.
  // Unlike the "rough Stop never appears in `stops`" case above, THIS Stop is
  // present in the row set — it just has no zone yet (e.g. geocoding hasn't
  // resolved it) — so it is the one shape the old "?? UTC" default actually
  // touched. The route now passes `s.timezone` through unchanged and
  // `IcsStop.timezone: string | null` makes the compiler enforce it.
  it("scheduled stop present but with timezone: null → no VALARM (never falls back to UTC)", async () => {
    feedFindFirstMock.mockResolvedValue({
      includeTransport: false,
      includeAccommodation: true,
      includeActivities: false,
      alarmTransport: false,
      alarmCheckOut: true,
      trip: { id: "trip-1", name: "Ungeocoded Trip" },
    });
    stopFindManyMock.mockResolvedValue([
      { id: "stop-1", name: "Somewhere", timezone: null },
    ]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([
      {
        id: "accom-1",
        name: "Hostel",
        checkIn: "2026-08-01",
        checkOut: "2026-08-04",
        address: null,
        checkOutTime: "10:00",
        stopId: "stop-1",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/calendar/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    const body = await res.text();

    expect(body).toContain(ACCOMMODATION_MARKER);
    expect(body).not.toContain("BEGIN:VALARM");
  });

  it("both alarm flags false → no BEGIN:VALARM at all, even with transport and accommodation present", async () => {
    feedFindFirstMock.mockResolvedValue({
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
      },
    ]);
    accommodationFindManyMock.mockResolvedValue([
      {
        id: "accom-vienna",
        name: "Hotel Vienna",
        checkIn: "2026-12-07",
        checkOut: "2026-12-10",
        address: null,
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

/**
 * ARCH-TEN-7: a Calendar feed URL is bearer auth — Google/Apple fetch it
 * unauthenticated, and it travels wherever a subscribed calendar is shared.
 * It must therefore obey the same field floor as the Share link
 * (server/actions/share.ts:14): money, notes, confirmations and booking refs
 * are never emitted. Address/place fields are kept — a location is what a
 * calendar is for, and it's not on the forbidden list.
 */
describe("GET /api/calendar/[token] — ARCH-TEN-7 field floor", () => {
  it("never emits confirmations, booking refs or notes, even though address survives", async () => {
    feedFindFirstMock.mockResolvedValue({
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: true,
      alarmTransport: false,
      alarmCheckOut: false,
      trip: { id: "trip-1", name: "Summer Trip" },
    });
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([
      {
        id: "item-1",
        title: ITEM_TITLE,
        category: "Activity",
        date: "2026-07-01",
        startTime: null,
        endTime: null,
        stopId: null,
        address: "1 Rue de Rivoli",
        link: null,
        // Present even though the route no longer selects these — this
        // guards the serializer itself, not just the select clause.
        booking: "ITEM-BOOK-999",
        notes: "leave key under the mat",
      },
    ]);
    transportFindManyMock.mockResolvedValue([
      {
        id: "trans-1",
        mode: "FLIGHT",
        depPlace: "London",
        arrPlace: "Paris",
        depAt: new Date("2026-07-01T08:00:00Z"),
        arrAt: new Date("2026-07-01T09:30:00Z"),
        reference: "BA2490-XYZ",
      },
    ]);
    accommodationFindManyMock.mockResolvedValue([
      {
        id: "accom-1",
        name: "Hotel Lumiere",
        checkIn: "2026-07-01",
        checkOut: "2026-07-04",
        address: "12 Rue de Lumiere",
        confirmation: "ABC-123",
        notes: "door code 4821, paid by Cam",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/calendar/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();

    // Forbidden fields, wherever the builder might have put them
    // (DESCRIPTION, or — for transport — SUMMARY):
    expect(body).not.toContain("ABC-123");
    expect(body).not.toContain("door code 4821");
    expect(body).not.toContain("paid by Cam");
    expect(body).not.toContain("BA2490-XYZ");
    expect(body).not.toContain("ITEM-BOOK-999");
    expect(body).not.toContain("leave key under the mat");

    // Still a useful calendar: locations survive.
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("LOCATION:1 Rue de Rivoli");
    expect(body).toContain("LOCATION:12 Rue de Lumiere");
  });
});

describe("GET /api/calendar/[token] — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  const ALL_ON = { includeTransport: true, includeAccommodation: true, includeActivities: true };

  /** The db honours the fragment the way Prisma would: a marked query drops the hidden rows. */
  function surprised() {
    seedRows();
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        hiddenStopIds: ["stop-secret"],
        placeholders: [
          placeholderItem({ id: "item-secret", stopId: "stop-1", date: "2026-07-02", startTime: "19:30", endTime: "21:00" }),
          placeholderItem({ id: "item-fork", stopId: "stop-1", date: "2026-07-02", forkId: "fork-1" }),
          placeholderItem({ id: "item-undated", stopId: "stop-1", date: null }),
        ],
      }),
    );
    accommodationFindManyMock.mockImplementation(async (a: { where: { AND?: unknown } }) =>
      a.where.AND === MARKER_WHERE.accommodation.AND
        ? [{ id: "accom-1", name: "Hotel Lumiere", checkIn: "2026-07-01", checkOut: "2026-07-04", address: null }]
        : [
            { id: "accom-1", name: "Hotel Lumiere", checkIn: "2026-07-01", checkOut: "2026-07-04", address: null },
            { id: "accom-secret", name: "Secret Chateau", checkIn: "2026-07-04", checkOut: "2026-07-06", address: "1 Hidden Lane", stopId: "stop-secret" },
          ],
    );
  }

  it("asks the loader with no viewer and spreads the fragments into the Item and Accommodation reads", async () => {
    surprised();
    await getBody(ALL_ON);
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("trip-1", null);
    expect(itemFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(MARKER_WHERE.item) }));
    expect(accommodationFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(MARKER_WHERE.accommodation) }));
  });

  it("a hidden accommodation produces no VEVENT", async () => {
    surprised();
    const body = await getBody(ALL_ON);
    expect(body).toContain("Hotel Lumiere");
    expect(body).not.toContain("Secret Chateau");
    expect(body).not.toContain("accom-secret");
    expect(body).not.toContain("Hidden Lane");
  });

  it("a real-plan Surprise Item produces one VEVENT titled Surprise at its time, with no address", async () => {
    surprised();
    const body = await getBody(ALL_ON);
    const events = body.split("BEGIN:VEVENT").slice(1);
    const secret = events.filter((e) => e.includes("UID:item-item-secret@trip-planner"));
    expect(secret).toHaveLength(1);
    expect(secret[0]).toContain("SUMMARY:Surprise");
    expect(secret[0]).toContain("CATEGORIES:OTHER");
    // 19:30 Paris summer time is 17:30 UTC.
    expect(secret[0]).toContain("DTSTART:20260702T173000Z");
    expect(secret[0]).not.toContain("LOCATION");
    expect(body).not.toContain("item-fork");
    expect(body).not.toContain("item-undated");
  });

  it("the placeholder follows the activities dial", async () => {
    surprised();
    const body = await getBody({ ...ALL_ON, includeActivities: false });
    expect(body).not.toContain("SUMMARY:Surprise");
  });
});
