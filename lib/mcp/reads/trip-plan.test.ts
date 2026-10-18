import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccess,
  stopFindMany,
  transportFindMany,
  chapterFindMany,
  itemFindMany,
  tripFindUnique,
  dayTitleFindMany,
  tripMemberFindMany,
  attachmentFindMany,
  accommodationFindMany,
  loadSurpriseVisibility,
} = vi.hoisted(() => ({
  requireTripAccess: vi.fn(),
  stopFindMany: vi.fn(),
  transportFindMany: vi.fn(),
  chapterFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  tripFindUnique: vi.fn(),
  dayTitleFindMany: vi.fn(),
  tripMemberFindMany: vi.fn(),
  attachmentFindMany: vi.fn(),
  accommodationFindMany: vi.fn(),
  loadSurpriseVisibility: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUnique },
    stop: { findMany: stopFindMany },
    transport: { findMany: transportFindMany },
    chapter: { findMany: chapterFindMany },
    item: { findMany: itemFindMany },
    dayTitle: { findMany: dayTitleFindMany },
    tripMember: { findMany: tripMemberFindMany },
    attachment: { findMany: attachmentFindMany },
    accommodation: { findMany: accommodationFindMany },
  },
}));

vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility };
});

import { NO_SURPRISES, type SurpriseVisibility } from "@/lib/surprise-visibility";
import type { SurpriseView } from "@/lib/surprise";
import { hiddenVisibility, MARKER_WHERE, placeholderItem } from "@/test/helpers/surprise-visibility";
import { loadTripPlanForMcp } from "./trip-plan";

const TRIP_ID = "trip-1";

describe("loadTripPlanForMcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    tripFindUnique.mockResolvedValue({
      name: "Japan",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      hardEndDate: "2026-01-12",
      homeCurrency: "AUD",
      homeName: "Sydney",
      roundTrip: true,
    });
    stopFindMany.mockResolvedValue([
      {
        id: "stopA",
        name: "Tokyo",
        countryCode: "jp",
        timezone: "Asia/Tokyo",
        arriveDate: "2026-01-01",
        departDate: "2026-01-03",
        nights: null,
        pinned: false,
        chapterId: null,
        notes: "Bring sunscreen",
        sortOrder: 0,
        accommodations: [],
      },
      {
        id: "stopB",
        name: "Someday Osaka",
        countryCode: "jp",
        timezone: null,
        arriveDate: null,
        departDate: null,
        nights: 3,
        pinned: false,
        chapterId: null,
        notes: null,
        sortOrder: 1,
        accommodations: [],
      },
    ]);
    transportFindMany.mockResolvedValue([
      {
        id: "t1",
        mode: "FLIGHT",
        fromStopId: null,
        toStopId: "stopA",
        depIsHome: true,
        arrIsHome: false,
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2025-12-31T22:00:00Z"),
        arrAt: new Date("2026-01-01T10:00:00Z"),
        reference: "QF1",
        notes: null,
      },
    ]);
    chapterFindMany.mockResolvedValue([{ id: "c1", name: "Asia", startDate: "2026-01-01", endDate: "2026-01-10" }]);
    tripMemberFindMany.mockResolvedValue([
      { role: "owner", user: { id: "u1", name: "Cam", displayName: null, email: "cam@x", image: null } },
    ]);
    // item.findMany is called twice: things-to-do (date: null) then scheduled (date: not null).
    itemFindMany.mockImplementation(({ where }: { where: { date?: unknown } }) => {
      if (where.date === null) {
        return Promise.resolve([
          {
            id: "item-todo",
            title: "Visit museum",
            category: "ACTIVITY",
            startTime: null,
            endTime: null,
            address: null,
            link: null,
            booking: null,
            notes: null,
            stopId: "stopA",
          },
        ]);
      }
      return Promise.resolve([
        {
          id: "item-arrive",
          title: "Arrive and settle",
          category: "ACTIVITY",
          date: "2026-01-01",
          startTime: null,
          endTime: null,
          address: null,
          link: null,
          booking: null,
          notes: null,
          stopId: "stopA",
        },
        {
          id: "item-breakfast",
          title: "Breakfast",
          category: "FOOD",
          date: "2026-01-02",
          startTime: "10:00",
          endTime: null,
          address: null,
          link: null,
          booking: null,
          notes: null,
          stopId: "stopA",
        },
      ]);
    });
    dayTitleFindMany.mockResolvedValue([{ stopId: "stopA", dayIndex: 0, title: "Day one" }]);
    attachmentFindMany.mockResolvedValue([]);
    accommodationFindMany.mockResolvedValue([]);
  });

  it("checks access before any db read", async () => {
    await loadTripPlanForMcp(TRIP_ID);
    const accessOrder = requireTripAccess.mock.invocationCallOrder[0]!;
    for (const mock of [tripFindUnique, stopFindMany, transportFindMany, chapterFindMany, itemFindMany, dayTitleFindMany, tripMemberFindMany, attachmentFindMany]) {
      expect(mock.mock.invocationCallOrder[0]!).toBeGreaterThan(accessOrder);
    }
  });

  it("scopes every query to the real plan (forkId: null)", async () => {
    await loadTripPlanForMcp(TRIP_ID);
    expect(stopFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
    expect(transportFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
    expect(chapterFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
    for (const call of itemFindMany.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ forkId: null }));
    }
  });

  it("never resolves or accepts a forkId", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan).not.toHaveProperty("forkId");
  });

  it("returns the trip with home base and currency", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan.trip).toEqual({
      id: TRIP_ID,
      name: "Japan",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      hardEndDate: "2026-01-12",
      homeCurrency: "AUD",
      homeBase: "Sydney",
      homeTimezone: null,
      roundTrip: true,
      files: [],
    });
  });

  it("orders stops in plan order and marks a date-less stop rough", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan.stops.map((s) => s.id)).toEqual(["stopA", "stopB"]);
    expect(plan.stops[1]).toMatchObject({ rough: true, nights: 3, arriveDate: null, departDate: null, days: [] });
  });

  it("groups the unscheduled thing-to-do under its Stop, separate from scheduled days", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    const stopA = plan.stops[0]!;
    expect(stopA.thingsToDo).toEqual([
      { id: "item-todo", title: "Visit museum", category: "ACTIVITY", address: null, link: null, booking: null, notes: null, slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN", openingHours: null, tryList: null, files: [], surprise: null },
    ]);
  });

  it("groups scheduled Items under the right day, with the Day title attached", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    const stopA = plan.stops[0]!;
    expect(stopA.days).toHaveLength(3); // arrive..depart inclusive: 01-01, 01-02, 01-03
    expect(stopA.days[0]).toEqual({
      date: "2026-01-01",
      dayTitle: "Day one",
      items: [
        {
          id: "item-arrive",
          title: "Arrive and settle",
          category: "ACTIVITY",
          startTime: null,
          endTime: null,
          address: null,
          link: null,
          booking: null,
          notes: null,
          bookingState: "NONE",
          bookBy: null,
          slotTime: null,
          arriveByMinutes: null,
          refundable: "UNKNOWN",
          openingHours: null,
          tryList: null,
          owningStop: { id: "stopA", name: "Tokyo" },
          files: [],
          surprise: null,
        },
      ],
    });
    expect(stopA.days[1]).toMatchObject({ date: "2026-01-02", dayTitle: null });
    expect(stopA.days[1]!.items[0]).toMatchObject({ id: "item-breakfast", startTime: "10:00" });
    expect(stopA.days[2]).toMatchObject({ date: "2026-01-03", items: [] });
  });

  it("resolves a transport's home/stop endpoints", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan.transports).toEqual([
      {
        id: "t1",
        mode: "FLIGHT",
        from: { home: true },
        to: { stopId: "stopA", name: "Tokyo" },
        depPlace: null,
        arrPlace: null,
        depAt: new Date("2025-12-31T22:00:00Z").toISOString(),
        arrAt: new Date("2026-01-01T10:00:00Z").toISOString(),
        // No Stop on the home end, so both ends fall back to Tokyo's zone.
        departs: {
          at: new Date("2025-12-31T22:00:00Z").toISOString(),
          localTime: "07:00",
          localDate: "2026-01-01",
          zone: expect.any(String),
        },
        arrives: {
          at: new Date("2026-01-01T10:00:00Z").toISOString(),
          localTime: "19:00",
          localDate: "2026-01-01",
          zone: expect.any(String),
        },
        dayDelta: 0,
        reference: "QF1",
        notes: null,
        files: [],
      },
    ]);
  });

  it("returns chapters", async () => {
    const plan = await loadTripPlanForMcp(TRIP_ID);
    expect(plan.chapters).toEqual([{ id: "c1", name: "Asia", startDate: "2026-01-01", endDate: "2026-01-10" }]);
  });

  it("propagates a not-found from requireTripAccess without reading the db", async () => {
    requireTripAccess.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    await expect(loadTripPlanForMcp(TRIP_ID)).rejects.toThrow();
    expect(stopFindMany).not.toHaveBeenCalled();
  });
  describe("dated things to do with no Stop (add_thing_to_do with a date only)", () => {
    const stopless = (id: string, date: string) => ({
      id,
      title: id,
      category: "ACTIVITY",
      date,
      startTime: null,
      endTime: null,
      address: null,
      link: null,
      booking: null,
      notes: null,
      stopId: null,
    });

    beforeEach(() => {
      const base = itemFindMany.getMockImplementation()!;
      itemFindMany.mockImplementation((args: { where: { date?: unknown; stopId?: unknown } }) => {
        if (args.where.date === null) return base(args);
        // The scheduled query must not filter Stopless Items out.
        const extra = args.where.stopId === undefined ? [stopless("item-inside", "2026-01-02"), stopless("item-outside", "2026-02-01")] : [];
        return (base(args) as Promise<unknown[]>).then((rows) => [...rows, ...extra]);
      });
    });

    it("shows a Stopless dated Item on the day of the Stop whose stay covers it (ADR 0049)", async () => {
      const plan = await loadTripPlanForMcp(TRIP_ID);
      const day = plan.stops[0]!.days.find((d) => d.date === "2026-01-02")!;
      expect(day.items.map((i) => i.id)).toContain("item-inside");
      expect(plan.unplacedDatedItems.map((i) => i.id)).not.toContain("item-inside");
    });

    it("lists a dated Item no Stop's stay covers in unplacedDatedItems, with its date", async () => {
      const plan = await loadTripPlanForMcp(TRIP_ID);
      expect(plan.unplacedDatedItems).toEqual([
        expect.objectContaining({ id: "item-outside", date: "2026-02-01", stopId: null }),
      ]);
    });
  });

  describe("transport places, local times, Stop timezones, Travellers (spec 2026-10-11 Task 1)", () => {
    beforeEach(() => {
      requireTripAccess.mockResolvedValue({ user: { id: "u-you" }, membership: {} });
      stopFindMany.mockResolvedValue([
        {
          id: "stopLIS",
          name: "Lisbon",
          countryCode: "pt",
          timezone: "Europe/Lisbon",
          arriveDate: "2026-12-10",
          departDate: "2026-12-13",
          nights: null,
          pinned: false,
          chapterId: null,
          notes: null,
          sortOrder: 0,
          accommodations: [],
        },
        {
          id: "stopMUC",
          name: "Munich",
          countryCode: "de",
          timezone: "Europe/Berlin",
          arriveDate: "2026-12-13",
          departDate: "2026-12-16",
          nights: null,
          pinned: false,
          chapterId: null,
          notes: null,
          sortOrder: 1,
          accommodations: [],
        },
      ]);
      transportFindMany.mockResolvedValue([
        {
          id: "t-main",
          mode: "FLIGHT",
          fromStopId: "stopLIS",
          toStopId: "stopMUC",
          depIsHome: false,
          arrIsHome: false,
          depPlace: "Lisbon Airport",
          arrPlace: "Munich Airport",
          depAt: new Date("2026-12-12T07:30:00Z"),
          arrAt: new Date("2026-12-12T11:15:00Z"),
          reference: null,
          notes: "Gate closes 40 min before",
        },
        {
          id: "t-home",
          mode: "FLIGHT",
          fromStopId: null,
          toStopId: "stopLIS",
          depIsHome: true,
          arrIsHome: false,
          depPlace: null,
          arrPlace: null,
          depAt: new Date("2026-12-10T22:00:00Z"),
          arrAt: new Date("2026-12-11T06:00:00Z"),
          reference: null,
          notes: null,
        },
        {
          id: "t-untimed",
          mode: "TRAIN",
          fromStopId: "stopLIS",
          toStopId: "stopMUC",
          depIsHome: false,
          arrIsHome: false,
          depPlace: null,
          arrPlace: null,
          depAt: null,
          arrAt: null,
          reference: null,
          notes: null,
        },
      ]);
      chapterFindMany.mockResolvedValue([]);
      itemFindMany.mockResolvedValue([]);
      dayTitleFindMany.mockResolvedValue([]);
      tripMemberFindMany.mockResolvedValue([
        { role: "owner", user: { id: "u-you", name: "Cam", displayName: null, email: "c@x", image: null } },
        { role: "member", user: { id: "u-x", name: "Xanthia", displayName: null, email: "x@x", image: null } },
      ]);
    });

    it("returns transport places, notes and local times per end", async () => {
      // Stops: LIS (Europe/Lisbon), MUC (Europe/Berlin). Transport LIS→MUC
      // depAt 2026-12-12T07:30:00Z, arrAt 2026-12-12T11:15:00Z, depPlace "Lisbon Airport", arrPlace "Munich Airport", notes "Gate closes 40 min before".
      const plan = await loadTripPlanForMcp("trip-1");
      const t = plan.transports[0]!;
      expect(t).toMatchObject({
        depPlace: "Lisbon Airport",
        arrPlace: "Munich Airport",
        notes: "Gate closes 40 min before",
        depAt: "2026-12-12T07:30:00.000Z",
        departs: { at: "2026-12-12T07:30:00.000Z", localTime: "07:30", localDate: "2026-12-12" },
        arrives: { at: "2026-12-12T11:15:00.000Z", localTime: "12:15", localDate: "2026-12-12" },
        dayDelta: 0,
      });
      expect(t.departs!.zone).toBeTruthy();
      expect(t.arrives!.zone).toBeTruthy();
    });

    it("a home-departing leg takes the arrival Stop's zone, per the app's rule", async () => {
      // Transport depIsHome true, fromStopId null, toStopId LIS, depAt 2026-12-10T22:00:00Z
      const plan = await loadTripPlanForMcp("trip-1");
      const t = plan.transports.find((x) => x.from && "home" in x.from)!;
      expect(t.departs).toMatchObject({ localTime: "22:00", localDate: "2026-12-10" }); // Lisbon is UTC+0 in December
    });

    it("an untimed transport has null departs/arrives", async () => {
      const plan = await loadTripPlanForMcp("trip-1");
      const untimed = plan.transports.find((x) => x.depAt === null)!;
      expect(untimed.departs).toBeNull();
      expect(untimed.arrives).toBeNull();
    });

    it("each Stop carries its timezone", async () => {
      const plan = await loadTripPlanForMcp("trip-1");
      expect(plan.stops.find((s) => s.name === "Munich")!.timezone).toBe("Europe/Berlin");
    });

    it("lists Travellers with role and a you marker, never an email", async () => {
      // requireTripAccess resolves { user: { id: "u-you" } }; tripMember.findMany returns
      // [{ role: "owner", user: { id: "u-you", name: "Cam", displayName: null, email: "c@x", image: null } },
      //  { role: "member", user: { id: "u-x", name: "Xanthia", displayName: null, email: "x@x", image: null } }]
      const plan = await loadTripPlanForMcp("trip-1");
      expect(plan.travellers).toEqual([
        { id: "u-you", name: "Cam", role: "owner", you: true },
        { id: "u-x", name: "Xanthia", role: "traveller", you: false },
      ]);
      expect(JSON.stringify(plan)).not.toContain("@x");
    });
  });

  describe("Home base timezone (Task 6)", () => {
    it("returns homeTimezone and renders a Home departure in it", async () => {
      tripFindUnique.mockResolvedValue({
        name: "Indonesia",
        startDate: "2026-12-01",
        endDate: "2026-12-10",
        hardEndDate: null,
        homeCurrency: "AUD",
        homeName: "Brisbane",
        homeTimezone: "Australia/Brisbane",
        roundTrip: false,
      });
      stopFindMany.mockResolvedValue([
        {
          id: "stopMKS",
          name: "Makassar",
          countryCode: "id",
          timezone: "Asia/Makassar",
          arriveDate: "2026-12-04",
          departDate: "2026-12-07",
          nights: null,
          pinned: false,
          chapterId: null,
          notes: null,
          sortOrder: 0,
          accommodations: [],
        },
      ]);
      transportFindMany.mockResolvedValue([
        {
          id: "t-home",
          mode: "FLIGHT",
          fromStopId: null,
          toStopId: "stopMKS",
          depIsHome: true,
          arrIsHome: false,
          depPlace: null,
          arrPlace: null,
          depAt: new Date("2026-12-04T07:50:00Z"),
          arrAt: new Date("2026-12-04T16:00:00Z"),
          reference: null,
          notes: null,
        },
      ]);
      chapterFindMany.mockResolvedValue([]);
      itemFindMany.mockResolvedValue([]);
      dayTitleFindMany.mockResolvedValue([]);
      tripMemberFindMany.mockResolvedValue([
        { role: "owner", user: { id: "u1", name: "Cam", displayName: null, email: "c@x", image: null } },
      ]);

      const plan = await loadTripPlanForMcp(TRIP_ID);
      expect(plan.trip.homeTimezone).toBe("Australia/Brisbane");
      const t = plan.transports.find((x) => x.from && "home" in x.from)!;
      expect(t.departs).toMatchObject({ localTime: "17:50" });
    });
  });

  describe("files on Stops, Transport, Accommodation, things to do and day items (spec 2026-10-11 Task 3)", () => {
    const uploader = { id: "u1", name: "Cam", displayName: null, email: "cam@x", image: null };

    beforeEach(() => {
      requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
      tripFindUnique.mockResolvedValue({
        name: "Japan",
        startDate: null,
        endDate: null,
        hardEndDate: null,
        homeCurrency: "AUD",
        homeName: null,
        roundTrip: false,
      });
      // stop.findMany is called by both trip-plan.ts (no `where.id`) and
      // owners.ts's loadOwners (`where.id`, distinguished further by whether
      // its `select` asks for `forkId` — the fork-check query vs the
      // name-lookup query).
      stopFindMany.mockImplementation((args: { where?: { id?: unknown }; select?: { forkId?: unknown } }) => {
        if (args.where?.id) {
          if (args.select && "forkId" in args.select) {
            return Promise.resolve([{ id: "stopA", name: "Tokyo", forkId: null }]);
          }
          return Promise.resolve([{ id: "stopA", name: "Tokyo" }]);
        }
        return Promise.resolve([
          {
            id: "stopA",
            name: "Tokyo",
            countryCode: "jp",
            timezone: "Asia/Tokyo",
            arriveDate: "2026-01-01",
            departDate: "2026-01-03",
            nights: null,
            pinned: false,
            chapterId: null,
            notes: null,
            sortOrder: 0,
            accommodations: [
              { id: "acc1", name: "Hotel Tokyo", address: null, checkIn: "2026-01-01", checkOut: "2026-01-03", confirmation: null, notes: null },
            ],
          },
        ]);
      });
      accommodationFindMany.mockResolvedValue([{ id: "acc1", name: "Hotel Tokyo", stopId: "stopA", forkId: null }]);
      transportFindMany.mockImplementation((args: { where?: { id?: unknown } }) => {
        if (args.where?.id) {
          return Promise.resolve([
            { id: "t1", fromStopId: null, toStopId: "stopA", depIsHome: true, arrIsHome: false, depPlace: null, arrPlace: null, forkId: null },
          ]);
        }
        return Promise.resolve([
          {
            id: "t1",
            mode: "FLIGHT",
            fromStopId: null,
            toStopId: "stopA",
            depIsHome: true,
            arrIsHome: false,
            depPlace: null,
            arrPlace: null,
            depAt: new Date("2025-12-31T22:00:00Z"),
            arrAt: new Date("2026-01-01T10:00:00Z"),
            reference: "QF1",
            notes: null,
          },
        ]);
      });
      chapterFindMany.mockResolvedValue([]);
      itemFindMany.mockImplementation((args: { where: { id?: unknown; date?: unknown } }) => {
        if (args.where?.id) {
          return Promise.resolve([
            { id: "item-todo", title: "Visit museum", stopId: "stopA", date: null, forkId: null },
            { id: "item-breakfast", title: "Breakfast", stopId: "stopA", date: "2026-01-02", forkId: null },
          ]);
        }
        if (args.where.date === null) {
          return Promise.resolve([
            { id: "item-todo", title: "Visit museum", category: "ACTIVITY", startTime: null, endTime: null, address: null, link: null, booking: null, notes: null, stopId: "stopA" },
          ]);
        }
        return Promise.resolve([
          { id: "item-breakfast", title: "Breakfast", category: "FOOD", date: "2026-01-02", startTime: "10:00", endTime: null, address: null, link: null, booking: null, notes: null, stopId: "stopA" },
        ]);
      });
      dayTitleFindMany.mockResolvedValue([]);
      tripMemberFindMany.mockResolvedValue([{ role: "owner", user: uploader }]);
      attachmentFindMany.mockResolvedValue([
        { id: "f-trip", filename: "passport.pdf", title: null, mime: "application/pdf", size: 111, targetType: "TRIP", targetId: null, uploadedBy: uploader },
        { id: "f-stop", filename: "tokyo.pdf", title: "Tokyo guide", mime: "application/pdf", size: 222, targetType: "STOP", targetId: "stopA", uploadedBy: uploader },
        { id: "f-transport", filename: "boarding.pdf", title: null, mime: "application/pdf", size: 333, targetType: "TRANSPORT", targetId: "t1", uploadedBy: uploader },
        { id: "f-acc", filename: "hotel.pdf", title: null, mime: "application/pdf", size: 444, targetType: "ACCOMMODATION", targetId: "acc1", uploadedBy: uploader },
        { id: "f-todo", filename: "museum.pdf", title: null, mime: "application/pdf", size: 555, targetType: "ITEM", targetId: "item-todo", uploadedBy: uploader },
        { id: "f-day", filename: "breakfast.pdf", title: null, mime: "application/pdf", size: 666, targetType: "ITEM", targetId: "item-breakfast", uploadedBy: uploader },
      ]);
    });

    it("each Stop, Transport, Accommodation, thing to do and day item carries its files; the trip carries trip-level files", async () => {
      const plan = await loadTripPlanForMcp(TRIP_ID);
      expect(plan.trip.files).toEqual([{ id: "f-trip", title: "passport.pdf" }]);
      expect(plan.stops[0]!.files).toEqual([{ id: "f-stop", title: "Tokyo guide" }]);
      expect(plan.stops[0]!.accommodations[0]!.files).toEqual([{ id: "f-acc", title: "hotel.pdf" }]);
      expect(plan.transports[0]!.files).toEqual([{ id: "f-transport", title: "boarding.pdf" }]);
      expect(plan.stops[0]!.thingsToDo[0]!.files).toEqual([{ id: "f-todo", title: "museum.pdf" }]);
      const dayItem = plan.stops[0]!.days.flatMap((d) => d.items).find((i) => i.id === "item-breakfast")!;
      expect(dayItem.files).toEqual([{ id: "f-day", title: "breakfast.pdf" }]);
    });

    it("a thing with no files has files: []", async () => {
      attachmentFindMany.mockResolvedValue([]);
      const plan = await loadTripPlanForMcp(TRIP_ID);
      expect(plan.trip.files).toEqual([]);
      expect(plan.stops[0]!.files).toEqual([]);
      expect(plan.stops[0]!.accommodations[0]!.files).toEqual([]);
      expect(plan.transports[0]!.files).toEqual([]);
      expect(plan.stops[0]!.thingsToDo[0]!.files).toEqual([]);
    });
  });

  describe("Surprise: the connection sees what the acting Traveller sees (ADR 0051)", () => {
    // Cam plans Paris as a Surprise for Sam. Tokyo is ordinary, but holds a
    // Surprise dinner Cam planned for Sam on 2026-01-02.
    const SAM_VIEW: SurpriseView = { plannerId: "u-cam", plannerName: "Cam", forIds: ["u-sam"], forNames: ["Sam"], youAreSurprised: true };
    const CAM_VIEW: SurpriseView = { ...SAM_VIEW, youAreSurprised: false };
    const has = (where: unknown, marker: string) => JSON.stringify(where ?? null).includes(`"surpriseMarker":"${marker}"`);
    const item = (o: { id: string } & Record<string, unknown>) => ({
      title: "x", category: "ACTIVITY", date: null, startTime: null, endTime: null,
      address: null, link: null, booking: null, notes: null, stopId: null, ...o,
    });
    const uploader = { id: "u-cam", name: "Cam", displayName: null, email: "cam@x", image: null };

    beforeEach(() => {
      stopFindMany.mockImplementation((args: { where?: { id?: unknown }; select: { accommodations?: { where?: unknown } } }) => {
        // owners.ts's loadOwners, naming the Stop a file is attached to.
        if (args.where?.id) return Promise.resolve([{ id: "stopP", name: "Paris", forkId: null }]);
        const keepParisInside = !has(args.select.accommodations?.where, "accommodation");
        return Promise.resolve([
          {
            id: "stopA", name: "Tokyo", countryCode: "jp", timezone: "Asia/Tokyo",
            arriveDate: "2026-01-01", departDate: "2026-01-03", nights: null, pinned: false, chapterId: null,
            notes: null, sortOrder: 0, accommodations: [],
          },
          {
            id: "stopP", name: "Paris", countryCode: "fr", timezone: "Europe/Paris",
            arriveDate: "2026-01-03", departDate: "2026-01-05", nights: null, pinned: false, chapterId: null,
            notes: "Eiffel Tower at dusk", sortOrder: 1,
            accommodations: keepParisInside
              ? [{ id: "acc-p", name: "Hotel Lumiere", address: null, checkIn: "2026-01-03", checkOut: "2026-01-05", confirmation: null, notes: null }]
              : [],
          },
        ]);
      });
      itemFindMany.mockImplementation(({ where }: { where: { date?: unknown } }) => {
        const hide = has(where, "item");
        const rows = where.date === null
          ? [item({ id: "item-todo-p", title: "Seine cruise", stopId: "stopP" })]
          : [
              item({ id: "item-p-dinner", title: "Le Jules Verne", date: "2026-01-04", stopId: "stopP" }),
              item({ id: "item-a-dinner", title: "Omakase", date: "2026-01-02", startTime: "19:00", stopId: "stopA" }),
            ];
        return Promise.resolve(hide ? rows.filter((r) => r.stopId !== "stopP" && r.id !== "item-a-dinner") : rows);
      });
      attachmentFindMany.mockImplementation(({ where }: { where: unknown }) =>
        Promise.resolve(has(where, "attachment") ? [] : [
          { id: "f-p", filename: "paris.pdf", title: null, mime: "application/pdf", size: 1, targetType: "STOP", targetId: "stopP", uploadedBy: uploader },
        ]),
      );
      dayTitleFindMany.mockResolvedValue([{ stopId: "stopP", dayIndex: 0, title: "Arrive in Paris" }]);
      tripMemberFindMany.mockResolvedValue([
        { role: "owner", user: uploader },
        { role: "member", user: { id: "u-sam", name: "Sam", displayName: null, email: "sam@x", image: null } },
      ]);
    });

    function asSam(): SurpriseVisibility {
      const base = hiddenVisibility({
        viewerId: "u-sam",
        hiddenStopIds: ["stopP"],
        placeholders: [placeholderItem({ id: "item-a-dinner", stopId: "stopA", date: "2026-01-02", startTime: "19:00", surprise: SAM_VIEW })],
      });
      return { ...base, views: { stops: new Map([["stopP", SAM_VIEW]]), items: new Map([["item-a-dinner", SAM_VIEW]]) } };
    }

    function asCam(): SurpriseVisibility {
      return { ...NO_SURPRISES, viewerId: "u-cam", views: { stops: new Map([["stopP", CAM_VIEW]]), items: new Map([["item-a-dinner", CAM_VIEW]]) } };
    }

    it("loads the Surprise visibility as the acting Traveller, after the access check", async () => {
      requireTripAccess.mockResolvedValue({ user: { id: "u-sam" }, membership: {} });
      loadSurpriseVisibility.mockResolvedValue(asSam());
      await loadTripPlanForMcp(TRIP_ID);
      expect(loadSurpriseVisibility).toHaveBeenCalledWith(TRIP_ID, "u-sam");
      expect(loadSurpriseVisibility.mock.invocationCallOrder[0]!).toBeGreaterThan(requireTripAccess.mock.invocationCallOrder[0]!);
    });

    it("spreads the item, accommodation and attachment fragments into their queries", async () => {
      requireTripAccess.mockResolvedValue({ user: { id: "u-sam" }, membership: {} });
      loadSurpriseVisibility.mockResolvedValue(asSam());
      await loadTripPlanForMcp(TRIP_ID);
      expect(itemFindMany).toHaveBeenCalledTimes(2);
      for (const call of itemFindMany.mock.calls) expect(call[0].where).toEqual(expect.objectContaining(MARKER_WHERE.item));
      expect(stopFindMany.mock.calls[0]![0].select.accommodations.where).toEqual(MARKER_WHERE.accommodation);
      expect(attachmentFindMany.mock.calls[0]![0].where).toEqual(expect.objectContaining(MARKER_WHERE.attachment));
    });

    it("as Sam (surprised), the Surprise Stop is a shell: no notes, Accommodation, things to do, days or files", async () => {
      requireTripAccess.mockResolvedValue({ user: { id: "u-sam" }, membership: {} });
      loadSurpriseVisibility.mockResolvedValue(asSam());
      const plan = await loadTripPlanForMcp(TRIP_ID);
      const paris = plan.stops.find((s) => s.id === "stopP")!;
      expect(paris).toMatchObject({
        name: "Paris",
        arriveDate: "2026-01-03",
        departDate: "2026-01-05",
        notes: null,
        accommodations: [],
        thingsToDo: [],
        days: [],
        files: [],
        surprise: { plannedBy: "Cam", for: ["Sam"], youAreSurprised: true },
      });
      expect(plan.stops.find((s) => s.id === "stopA")!.surprise).toBeNull();
      // Day titles are asked only for the Stops Sam may see inside.
      expect(dayTitleFindMany.mock.calls[0]![0].where.stopId.in).toEqual(["stopA"]);
      expect(JSON.stringify(plan)).not.toMatch(/Eiffel|Lumiere|Seine|Jules Verne|Omakase|paris\.pdf/);
    });

    it("as Sam, a Surprise thing to do is a placeholder titled Surprise on its date and time", async () => {
      requireTripAccess.mockResolvedValue({ user: { id: "u-sam" }, membership: {} });
      loadSurpriseVisibility.mockResolvedValue(asSam());
      const plan = await loadTripPlanForMcp(TRIP_ID);
      const day = plan.stops.find((s) => s.id === "stopA")!.days.find((d) => d.date === "2026-01-02")!;
      expect(day.items).toEqual([
        {
          id: "item-a-dinner", title: "Surprise", category: "OTHER", startTime: "19:00", endTime: null,
          address: null, link: null, booking: null, notes: null, bookingState: "NONE", bookBy: null,
          slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN", openingHours: null, tryList: null,
          owningStop: { id: "stopA", name: "Tokyo" }, files: [],
          surprise: { plannedBy: "Cam", for: ["Sam"], youAreSurprised: true },
        },
      ]);
    });

    it("as Cam (the planner), everything is there, marked as a Surprise for Sam", async () => {
      requireTripAccess.mockResolvedValue({ user: { id: "u-cam" }, membership: {} });
      loadSurpriseVisibility.mockResolvedValue(asCam());
      const plan = await loadTripPlanForMcp(TRIP_ID);
      const paris = plan.stops.find((s) => s.id === "stopP")!;
      expect(paris.notes).toBe("Eiffel Tower at dusk");
      expect(paris.accommodations.map((a) => a.name)).toEqual(["Hotel Lumiere"]);
      expect(paris.thingsToDo.map((t) => t.title)).toEqual(["Seine cruise"]);
      expect(paris.days.map((d) => d.date)).toEqual(["2026-01-03", "2026-01-04", "2026-01-05"]);
      expect(paris.days[1]!.items.map((i) => i.title)).toEqual(["Le Jules Verne"]);
      expect(paris.files).toEqual([{ id: "f-p", title: "paris.pdf" }]);
      expect(paris.surprise).toEqual({ plannedBy: "Cam", for: ["Sam"], youAreSurprised: false });
      expect(paris.thingsToDo[0]!.surprise).toBeNull();
      const dinner = plan.stops.find((s) => s.id === "stopA")!.days.flatMap((d) => d.items).find((i) => i.id === "item-a-dinner")!;
      expect(dinner).toMatchObject({ title: "Omakase", surprise: { plannedBy: "Cam", for: ["Sam"], youAreSurprised: false } });
    });
  });
});
