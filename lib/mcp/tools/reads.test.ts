import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccess,
  requireGlobeAccess,
  itemFindMany,
  noteFindMany,
  checklistItemFindMany,
  activityFindMany,
  markerFindMany,
  listTemplates,
  listRemindersForTrip,
  findPlaces,
  loadTripPlanForMcp,
} = vi.hoisted(() => ({
  requireTripAccess: vi.fn(),
  requireGlobeAccess: vi.fn(),
  itemFindMany: vi.fn(),
  noteFindMany: vi.fn(),
  checklistItemFindMany: vi.fn(),
  activityFindMany: vi.fn(),
  markerFindMany: vi.fn(),
  listTemplates: vi.fn(),
  listRemindersForTrip: vi.fn(),
  findPlaces: vi.fn(),
  loadTripPlanForMcp: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess }));
vi.mock("@/lib/db", () => ({
  db: {
    item: { findMany: itemFindMany },
    note: { findMany: noteFindMany },
    checklistItem: { findMany: checklistItemFindMany },
    activity: { findMany: activityFindMany },
    marker: { findMany: markerFindMany },
  },
}));
vi.mock("@/server/actions/checklists", () => ({ listTemplates }));
vi.mock("@/server/actions/reminders", () => ({ listRemindersForTrip }));
vi.mock("@/server/actions/places", () => ({ findPlaces }));
vi.mock("../reads/trip-plan", () => ({ loadTripPlanForMcp }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";

const TRIP_ID = "trip-1";
const notFoundErr = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

const traveller = (id: string, name: string) => ({ id, name, image: null, displayName: null, email: null });

describe("read tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    requireGlobeAccess.mockResolvedValue({ user: { id: "u1" }, globe: { id: "g1" } });
    // Each of these mocked loaders checks access first, same as the real ones.
    loadTripPlanForMcp.mockImplementation(async (tripId: string) => {
      await requireTripAccess(tripId);
      return { trip: { id: tripId }, stops: [], transports: [], chapters: [] };
    });
    listRemindersForTrip.mockImplementation(async (tripId: string) => {
      await requireTripAccess(tripId);
      return [];
    });
  });

  it("registers every Task 9 tool", async () => {
    const c = await connectTestClient();
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_trip_plan",
        "get_wishlist",
        "get_notes",
        "get_reminders",
        "get_checklists",
        "get_activity",
        "list_globe_markers",
        "search_places",
      ]),
    );
  });

  it("get_trip_plan returns the loader's plan", async () => {
    loadTripPlanForMcp.mockResolvedValue({ trip: { id: TRIP_ID, name: "Japan" }, stops: [], transports: [], chapters: [] });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "get_trip_plan", arguments: { tripId: TRIP_ID } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({
      trip: { id: TRIP_ID, name: "Japan" },
      stops: [],
      transports: [],
      chapters: [],
    });
  });

  it("get_wishlist maps ideas with votes", async () => {
    itemFindMany.mockResolvedValue([
      {
        id: "i1",
        title: "Visit the aquarium",
        category: "ACTIVITY",
        notes: "Pre-book",
        link: "https://example.com",
        votes: [{ level: "MUST", user: traveller("u2", "Priya") }],
      },
    ]);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "get_wishlist", arguments: { tripId: TRIP_ID } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({
      ideas: [
        {
          id: "i1",
          title: "Visit the aquarium",
          category: "ACTIVITY",
          notes: "Pre-book",
          link: "https://example.com",
          votes: [{ traveller: "Priya", level: "MUST" }],
        },
      ],
    });
    expect(itemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null, stopId: null, date: null }) }),
    );
  });

  it("get_notes maps author to a display name", async () => {
    noteFindMany.mockResolvedValue([
      {
        id: "n1",
        targetType: "STOP",
        targetId: "s1",
        body: "Great view",
        createdAt: new Date("2026-02-01T00:00:00Z"),
        author: traveller("u2", "Priya"),
      },
    ]);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "get_notes", arguments: { tripId: TRIP_ID } });
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({
      notes: [
        {
          id: "n1",
          targetType: "STOP",
          targetId: "s1",
          body: "Great view",
          author: "Priya",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("get_reminders passes fromDate through, defaulting to today", async () => {
    listRemindersForTrip.mockResolvedValue([{ id: "r1", title: "Buy visa", date: "2026-03-01", stopId: null, stopName: null }]);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "get_reminders", arguments: { tripId: TRIP_ID, fromDate: "2026-03-01" } });
    expect(listRemindersForTrip).toHaveBeenCalledWith(TRIP_ID, "2026-03-01");
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual([
      { id: "r1", title: "Buy visa", date: "2026-03-01", stopId: null, stopName: null },
    ]);
  });

  it("get_checklists sorts each kind and includes templates", async () => {
    checklistItemFindMany.mockResolvedValue([
      { id: "c2", kind: "PACKING", text: "Socks", done: false, dueDate: null, sortOrder: 1, buy: null },
      { id: "c1", kind: "PRETRIP", text: "Book flights", done: true, dueDate: "2026-01-01", sortOrder: 0, buy: null },
      { id: "c3", kind: "SHOPPING", text: "Sunscreen", done: false, dueDate: null, sortOrder: 0, buy: "NEEDED" },
    ]);
    listTemplates.mockResolvedValue([{ id: "t1", name: "Beach", itemCount: 5 }]);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "get_checklists", arguments: { tripId: TRIP_ID } });
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({
      pretrip: [{ id: "c1", text: "Book flights", done: true, dueDate: "2026-01-01", buyState: null }],
      packing: [{ id: "c2", text: "Socks", done: false, dueDate: null, buyState: null }],
      shopping: [{ id: "c3", text: "Sunscreen", done: false, dueDate: null, buyState: "NEEDED" }],
      templates: [{ id: "t1", name: "Beach", itemCount: 5 }],
    });
  });

  it("get_activity maps rows to headline/who/via, newest first and respects limit", async () => {
    activityFindMany.mockResolvedValue([
      {
        verb: "CREATED",
        entityType: "STOP",
        entityLabel: "Rome",
        source: "CLAUDE",
        createdAt: new Date("2026-02-02T00:00:00Z"),
        actor: traveller("u2", "Priya"),
      },
    ]);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "get_activity", arguments: { tripId: TRIP_ID, limit: 10 } });
    expect(activityFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10, orderBy: { createdAt: "desc" } }));
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual([
      { at: "2026-02-02T00:00:00.000Z", who: "Priya", what: "added the Rome stop", via: "via Claude" },
    ]);
  });

  it("get_activity defaults limit to 50 and via is null for app-made changes", async () => {
    activityFindMany.mockResolvedValue([
      {
        verb: "UPDATED",
        entityType: "ITEM",
        entityLabel: "Dinner",
        source: null,
        createdAt: new Date("2026-02-02T00:00:00Z"),
        actor: traveller("u2", "Priya"),
      },
    ]);
    const c = await connectTestClient();
    await c.callTool({ name: "get_activity", arguments: { tripId: TRIP_ID } });
    expect(activityFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it("list_globe_markers maps marker fields and requires globe access, not trip access", async () => {
    markerFindMany.mockResolvedValue([
      {
        id: "m1",
        title: "Eiffel Tower",
        category: "SIGHT",
        note: "Go at night",
        link: null,
        timing: "spring",
        city: "Paris",
        country: "France",
        countryCode: "fr",
      },
    ]);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "list_globe_markers", arguments: {} });
    expect(requireTripAccess).not.toHaveBeenCalled();
    expect(requireGlobeAccess).toHaveBeenCalled();
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({
      markers: [
        { id: "m1", name: "Eiffel Tower", category: "SIGHT", town: "Paris", countryCode: "fr", when: "spring", note: "Go at night", link: null },
      ],
    });
  });

  it("search_places returns findPlaces' outcome directly", async () => {
    findPlaces.mockResolvedValue({ status: "ok", candidates: [{ name: "Paris", lat: 1, lng: 2, city: null, country: "France", countryCode: "fr" }] });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "search_places", arguments: { query: "Paris" } });
    expect(findPlaces).toHaveBeenCalledWith("Paris");
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({
      status: "ok",
      candidates: [{ name: "Paris", lat: 1, lng: 2, city: null, country: "France", countryCode: "fr" }],
    });
  });

  it("rejects a too-short search_places query before calling findPlaces", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "search_places", arguments: { query: "a" } });
    expect(r.isError).toBe(true);
    expect(findPlaces).not.toHaveBeenCalled();
  });

  describe("a non-member's trip id reads as not found, not data", () => {
    const tripScopedTools: [string, Record<string, unknown>][] = [
      ["get_trip_plan", { tripId: TRIP_ID }],
      ["get_wishlist", { tripId: TRIP_ID }],
      ["get_notes", { tripId: TRIP_ID }],
      ["get_reminders", { tripId: TRIP_ID }],
      ["get_checklists", { tripId: TRIP_ID }],
      ["get_activity", { tripId: TRIP_ID }],
    ];

    it.each(tripScopedTools)("%s", async (name, args) => {
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name, arguments: args });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe("Not found, or you don't have access to it.");
    });
  });
});
