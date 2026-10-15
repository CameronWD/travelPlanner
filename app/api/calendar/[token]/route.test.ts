import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the public ICS feed route — focused on the type filter: the feed's
 * includeTransport/includeAccommodation/includeActivities flags must exclude the
 * unticked event types from the serialized calendar body.
 */

// The Plan rows come from one `readPlan(tripId, null, null)` call (Task 17),
// mocked here with the PlanRows a real call would have produced for each
// scenario. readPlan's own masking / placeholder / query-shape behaviour
// (Surprise fragments, selects) is pinned in lib/plan-reads.test.ts; this file
// proves the ROUTE turns given rows into the right feed. The CalendarFeed
// token lookup stays the route's own read, mocked at the db level.
const { feedFindFirstMock, readPlanMock } = vi.hoisted(() => ({
  feedFindFirstMock: vi.fn(),
  readPlanMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { calendarFeed: { findFirst: feedFindFirstMock } },
}));
// plan-reads → trip-shell-reads → server actions → guards → auth; nothing
// here touches auth, so stub the guard module rather than build the auth db.
vi.mock("@/lib/guards", () => ({}));
vi.mock("@/lib/plan-reads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plan-reads")>()),
  readPlan: readPlanMock,
}));

import { GET } from "./route";
import { mergePlanItems, PLAN_ACCOMMODATION_SELECT } from "@/lib/plan-reads";
import { NO_SURPRISES, type SurpriseVisibility } from "@/lib/surprise-visibility";
import { hiddenVisibility, placeholderItem } from "@/test/helpers/surprise-visibility";
import { planRows } from "@/test/builders/plan-rows";

type Row = Record<string, unknown>;

/**
 * The Plan a scenario hands the route: readPlan resolves to the PlanRows a
 * real call would have produced from these rows (partial rows — only the
 * fields a scenario needs). Items go through the real `mergePlanItems`, so a
 * scenario's placeholders are merged exactly as readPlan merges them.
 */
const plan: { stops: Row[]; items: Row[]; transports: Row[]; accommodations: Row[]; visibility: SurpriseVisibility } = {
  stops: [], items: [], transports: [], accommodations: [], visibility: NO_SURPRISES,
};
const seed = {
  stops: (r: Row[]) => void (plan.stops = r),
  items: (r: Row[]) => void (plan.items = r),
  transports: (r: Row[]) => void (plan.transports = r),
  accommodations: (r: Row[]) => void (plan.accommodations = r),
  visibility: (v: SurpriseVisibility) => void (plan.visibility = v),
};

beforeEach(() => {
  Object.assign(plan, { stops: [], items: [], transports: [], accommodations: [], visibility: NO_SURPRISES });
  readPlanMock.mockImplementation(async () =>
    planRows({
      visibility: plan.visibility,
      stops: plan.stops.map((st) => ({ surprise: null, ...st })) as never,
      items: mergePlanItems(plan.items as { id: string }[], plan.visibility, null) as never,
      transports: plan.transports as never,
      accommodations: plan.accommodations as never,
    }),
  );
});

const ITEM_TITLE = "Louvre Visit";
const TRANSPORT_MARKER = "✈";
const ACCOMMODATION_MARKER = "🛏 Stay:";

/** Seed the Plan with exactly one row of each kind. */
function seedRows() {
  seed.stops([
    { id: "stop-1", name: "Paris", timezone: "Europe/Paris", arriveDate: "2026-07-01", departDate: "2026-07-04" },
  ]);
  seed.items([
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
  seed.transports([
    {
      id: "trans-1",
      mode: "flight",
      depPlace: "London",
      arrPlace: "Paris",
      depAt: new Date("2026-07-01T08:00:00Z"),
      arrAt: new Date("2026-07-01T09:30:00Z"),
    },
  ]);
  seed.accommodations([
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
    expect(readPlanMock).not.toHaveBeenCalled();
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
    seed.stops([]);
    seed.items([]);
    seed.accommodations([]);
    seed.transports([
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
    seed.stops([
      { id: "stop-vienna", name: "Vienna", timezone: "Europe/Vienna", arriveDate: "2026-12-07", departDate: "2026-12-10" },
    ]);
    seed.items([]);
    seed.transports([]);
    seed.accommodations([
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

    // Guards the accommodation select itself: the rows now come from
    // readPlan, so if checkOutTime/stopId are ever dropped from ITS select,
    // this fails even though the mock's return value doesn't.
    expect(PLAN_ACCOMMODATION_SELECT).toEqual(
      expect.objectContaining({ checkOutTime: true, stopId: true }),
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
    // readPlan hands back every Stop, rough ones included; the route keeps
    // only those with arriveDate set, so a rough Stop (no dates, no stored
    // timezone) never reaches the serializer — even though the Accommodation
    // pinned to it is still in the rows.
    seed.stops([
      { id: "stop-rough", name: "Somewhere", timezone: null, arriveDate: null, departDate: null, nights: 3 },
    ]);
    seed.items([]);
    seed.transports([]);
    seed.accommodations([
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
    seed.stops([
      { id: "stop-1", name: "Somewhere", timezone: null, arriveDate: "2026-08-01", departDate: "2026-08-04" },
    ]);
    seed.items([]);
    seed.transports([]);
    seed.accommodations([
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
    seed.stops([
      { id: "stop-vienna", name: "Vienna", timezone: "Europe/Vienna", arriveDate: "2026-12-07", departDate: "2026-12-10" },
    ]);
    seed.items([]);
    seed.transports([
      {
        id: "trans-flight",
        mode: "FLIGHT",
        depPlace: "London",
        arrPlace: "Vienna",
        depAt: new Date("2026-12-10T08:00:00Z"),
        arrAt: new Date("2026-12-10T10:30:00Z"),
      },
    ]);
    seed.accommodations([
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
    seed.stops([]);
    seed.items([
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
        // readPlan's rows really do carry these (and Transport `reference`,
        // Accommodation `confirmation`/`notes` below) — the route must
        // narrow each row before it reaches the serializer.
        booking: "ITEM-BOOK-999",
        notes: "leave key under the mat",
      },
    ]);
    seed.transports([
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
    seed.accommodations([
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

  /**
   * The PlanRows readPlan(trip-1, null, null) hands back for a surprised
   * public viewer: the hidden Accommodation is already filtered out (its
   * `v.where.accommodation` fragment), and the hidden Items come back as
   * placeholders merged by the real `mergePlanItems` (so the Fork's one is
   * dropped and the undated one is kept for the route to filter).
   */
  function surprised() {
    seedRows();
    seed.visibility(
      hiddenVisibility({
        viewerId: undefined,
        hiddenStopIds: ["stop-secret"],
        placeholders: [
          placeholderItem({ id: "item-secret", stopId: "stop-1", date: "2026-07-02", startTime: "19:30", endTime: "21:00" }),
          placeholderItem({ id: "item-fork", stopId: "stop-1", date: "2026-07-02", forkId: "fork-1" }),
          placeholderItem({ id: "item-undated", stopId: "stop-1", date: null }),
        ],
      }),
    );
  }

  it("reads the real plan as the public: readPlan with no viewer and no Fork", async () => {
    surprised();
    await getBody(ALL_ON);
    expect(readPlanMock).toHaveBeenCalledWith("trip-1", null, null);
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
