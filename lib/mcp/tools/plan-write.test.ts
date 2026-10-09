import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createItem,
  updateItem,
  deleteItem,
  scheduleItem,
  unscheduleItem,
  placeIdeaAtStop,
  addMarkerToWishlist,
  setVote,
  clearVote,
  setDayTitle,
  addNote,
  createChapter,
  updateChapter,
  requireTripAccess,
  itemFindUnique,
  chapterFindUnique,
  stopFindUnique,
} = vi.hoisted(() => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  scheduleItem: vi.fn(),
  unscheduleItem: vi.fn(),
  placeIdeaAtStop: vi.fn(),
  addMarkerToWishlist: vi.fn(),
  setVote: vi.fn(),
  clearVote: vi.fn(),
  setDayTitle: vi.fn(),
  addNote: vi.fn(),
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  requireTripAccess: vi.fn(),
  itemFindUnique: vi.fn(),
  chapterFindUnique: vi.fn(),
  stopFindUnique: vi.fn(),
}));

vi.mock("@/server/actions/items", () => ({
  createItem,
  updateItem,
  deleteItem,
  scheduleItem,
  unscheduleItem,
  placeIdeaAtStop,
  addMarkerToWishlist,
}));
vi.mock("@/server/actions/votes", () => ({ setVote, clearVote }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle }));
vi.mock("@/server/actions/notes", () => ({ addNote }));
vi.mock("@/server/actions/chapters", () => ({ createChapter, updateChapter }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { item: { findUnique: itemFindUnique }, chapter: { findUnique: chapterFindUnique }, stop: { findUnique: stopFindUnique } },
}));
// The rest of the server (reads.ts, trips-read.ts, trips-stops-write.ts)
// touches these only when their own tools are *called*; stubbing keeps
// buildMcpServer's full registration side-effect-free here.
vi.mock("@/lib/guards", () => ({ requireTripAccess, requireUser: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/server/actions/trips", () => ({ createTrip: vi.fn(), updateTrip: vi.fn(), setTripHardEndDate: vi.fn() }));
vi.mock("@/server/actions/stops", () => ({
  createStop: vi.fn(),
  updateStop: vi.fn(),
  deleteStop: vi.fn(),
  previewStopDeletion: vi.fn(),
  moveStop: vi.fn(),
  setStopDates: vi.fn(),
  firmUpTrip: vi.fn(),
  toggleStopPin: vi.fn(),
  makeStopRough: vi.fn(),
  setStopNotes: vi.fn(),
  setStopNights: vi.fn(),
}));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";

const TRIP_ID = "trip-1";
const ITEM_ID = "item-1";
const CHAPTER_ID = "chapter-1";
const notFoundErr = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

const itemRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  title: "Colosseum",
  category: "SIGHTSEEING",
  stopId: "stop-1",
  date: null,
  startTime: null,
  endTime: null,
  address: "Rome, Italy",
  link: null,
  booking: null,
  notes: "old notes",
  hiddenFromShares: true,
  ...overrides,
});

const chapterRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  name: "Italy",
  colour: "amber",
  startDate: "2026-05-01",
  endDate: "2026-05-10",
  ...overrides,
});

describe("plan write tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    // Real-plan pre-check default: every id names a real-plan row on TRIP_ID.
    itemFindUnique.mockResolvedValue(itemRow());
    chapterFindUnique.mockResolvedValue(chapterRow());
    stopFindUnique.mockResolvedValue({ tripId: TRIP_ID });
  });

  it("registers every write tool, none accepting a forkId", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "add_thing_to_do",
        "update_thing_to_do",
        "delete_thing_to_do",
        "schedule_thing_to_do",
        "unschedule_thing_to_do",
        "place_idea_at_stop",
        "add_marker_to_wishlist",
        "set_vote",
        "clear_vote",
        "set_day_title",
        "add_note",
        "add_chapter",
        "update_chapter",
      ]),
    );
    for (const t of tools) {
      const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("forkId");
    }
  });

  it("add_thing_to_do and update_thing_to_do accept no lat/lng (createItem/updateItem ignore them; location comes from address)", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    for (const name of ["add_thing_to_do", "update_thing_to_do"]) {
      const tool = tools.find((t) => t.name === name)!;
      const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("lat");
      expect(Object.keys(props)).not.toContain("lng");
    }
  });

  it("add_thing_to_do calls createItem with a single input argument, no forkId", async () => {
    createItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_thing_to_do",
      arguments: { tripId: TRIP_ID, title: "Colosseum", category: "SIGHTSEEING" },
    });
    expect(createItem).toHaveBeenCalledTimes(1);
    const call = createItem.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(TRIP_ID);
    expect(call[1]).toEqual(expect.objectContaining({ title: "Colosseum", category: "SIGHTSEEING" }));
  });

  describe("update_thing_to_do (PATCH)", () => {
    it("with only notes keeps the other fields, including hiddenFromShares (not part of this tool's input)", async () => {
      itemFindUnique.mockResolvedValue(itemRow());
      updateItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, notes: "new notes" } });
      expect(updateItem).toHaveBeenCalledWith(
        ITEM_ID,
        expect.objectContaining({
          title: "Colosseum",
          category: "SIGHTSEEING",
          stopId: "stop-1",
          address: "Rome, Italy",
          notes: "new notes",
          hiddenFromShares: true,
        }),
      );
    });

    it("checks trip access before using the loaded row, so a non-member's item id returns NOT_FOUND_TEXT and does not call updateItem", async () => {
      itemFindUnique.mockResolvedValue(itemRow());
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, title: "New" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateItem).not.toHaveBeenCalled();
    });

    it("a made-up item id returns the same NOT_FOUND_TEXT", async () => {
      itemFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_thing_to_do", arguments: { itemId: "nope", notes: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateItem).not.toHaveBeenCalled();
    });

    it("an action failure maps to isError", async () => {
      itemFindUnique.mockResolvedValue(itemRow());
      updateItem.mockResolvedValue({ success: false, errors: { title: ["Title is required"] } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, title: "x" } });
      expect(r.isError).toBe(true);
    });
  });

  it("delete_thing_to_do calls deleteItem and its description is permanent", async () => {
    deleteItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const tool = tools.find((t) => t.name === "delete_thing_to_do")!;
    expect(tool.description?.toLowerCase()).toContain("permanent");
    expect(tool.annotations?.destructiveHint).toBe(true);
    await c.callTool({ name: "delete_thing_to_do", arguments: { itemId: ITEM_ID } });
    expect(deleteItem).toHaveBeenCalledWith(ITEM_ID);
  });

  it("schedule_thing_to_do calls scheduleItem with a single options object, no forkId", async () => {
    scheduleItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "schedule_thing_to_do",
      arguments: { itemId: ITEM_ID, date: "2026-05-02", startTime: "09:00" },
    });
    expect(scheduleItem).toHaveBeenCalledTimes(1);
    const call = scheduleItem.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(ITEM_ID);
    expect(call[1]).toEqual({ date: "2026-05-02", startTime: "09:00", endTime: undefined });
  });

  it("unschedule_thing_to_do calls unscheduleItem", async () => {
    unscheduleItem.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
    const c = await connectTestClient();
    await c.callTool({ name: "unschedule_thing_to_do", arguments: { itemId: ITEM_ID } });
    expect(unscheduleItem).toHaveBeenCalledWith(ITEM_ID);
  });

  it("place_idea_at_stop calls placeIdeaAtStop", async () => {
    placeIdeaAtStop.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "place_idea_at_stop", arguments: { itemId: ITEM_ID, stopId: "stop-1" } });
    expect(placeIdeaAtStop).toHaveBeenCalledWith(ITEM_ID, "stop-1");
  });

  it("add_marker_to_wishlist calls addMarkerToWishlist", async () => {
    addMarkerToWishlist.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "add_marker_to_wishlist", arguments: { markerId: "marker-1", tripId: TRIP_ID } });
    expect(addMarkerToWishlist).toHaveBeenCalledWith("marker-1", TRIP_ID);
  });

  it("set_vote calls setVote and clear_vote calls clearVote", async () => {
    setVote.mockResolvedValue({ success: true });
    clearVote.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "set_vote", arguments: { tripId: TRIP_ID, itemId: ITEM_ID, level: "MUST" } });
    expect(setVote).toHaveBeenCalledWith(TRIP_ID, ITEM_ID, "MUST");
    await c.callTool({ name: "clear_vote", arguments: { tripId: TRIP_ID, itemId: ITEM_ID } });
    expect(clearVote).toHaveBeenCalledWith(TRIP_ID, ITEM_ID);
  });

  it("set_day_title with an empty title passes an empty string through, not undefined", async () => {
    setDayTitle.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "set_day_title", arguments: { stopId: "stop-1", date: "2026-05-02", title: "" } });
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "stop-1", date: "2026-05-02", title: "" });
  });

  it("add_note calls addNote", async () => {
    addNote.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_note",
      arguments: { tripId: TRIP_ID, targetType: "ITEM", targetId: ITEM_ID, body: "Bring tickets" },
    });
    expect(addNote).toHaveBeenCalledWith(TRIP_ID, { targetType: "ITEM", targetId: ITEM_ID, body: "Bring tickets" });
  });

  it("add_chapter calls createChapter with a single input argument, no forkId or originStopId", async () => {
    createChapter.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_chapter",
      arguments: { tripId: TRIP_ID, name: "Italy", colour: "amber" },
    });
    expect(createChapter).toHaveBeenCalledTimes(1);
    const call = createChapter.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(TRIP_ID);
    expect(call[1]).toEqual(expect.objectContaining({ name: "Italy", colour: "amber" }));
  });

  describe("update_chapter (PATCH)", () => {
    it("with only name keeps colour and dates", async () => {
      chapterFindUnique.mockResolvedValue(chapterRow());
      updateChapter.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_chapter", arguments: { chapterId: CHAPTER_ID, name: "New name" } });
      expect(updateChapter).toHaveBeenCalledWith(CHAPTER_ID, {
        name: "New name",
        colour: "amber",
        startDate: "2026-05-01",
        endDate: "2026-05-10",
      });
    });

    it("a lone startDate on a rough chapter is a tool error, not a silent no-op", async () => {
      chapterFindUnique.mockResolvedValue(chapterRow({ startDate: null, endDate: null }));
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_chapter", arguments: { chapterId: CHAPTER_ID, startDate: "2026-06-01" } });
      expect(r.isError).toBe(true);
      expect(updateChapter).not.toHaveBeenCalled();
    });

    it("a lone endDate on a dated chapter merges with the current startDate", async () => {
      chapterFindUnique.mockResolvedValue(chapterRow());
      updateChapter.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_chapter", arguments: { chapterId: CHAPTER_ID, endDate: "2026-05-12" } });
      expect(updateChapter).toHaveBeenCalledWith(
        CHAPTER_ID,
        expect.objectContaining({ startDate: "2026-05-01", endDate: "2026-05-12" }),
      );
    });

    it("checks trip access before using the loaded row, so a non-member's chapter id returns NOT_FOUND_TEXT and does not call updateChapter", async () => {
      chapterFindUnique.mockResolvedValue(chapterRow());
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_chapter", arguments: { chapterId: CHAPTER_ID, name: "New" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateChapter).not.toHaveBeenCalled();
    });

    it("a made-up chapter id returns the same NOT_FOUND_TEXT", async () => {
      chapterFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_chapter", arguments: { chapterId: "nope", name: "New" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateChapter).not.toHaveBeenCalled();
    });
  });
  it("add_thing_to_do's description recommends a stopId alongside a date", async () => {
    const c = await connectTestClient();
    const tool = (await c.listTools()).tools.find((t) => t.name === "add_thing_to_do")!;
    expect(tool.description).toContain("pass stopId too");
  });

  describe("real plan only: a Fork's row reads as not found", () => {
    // A Fork-owned row exists, but only a query not scoped to forkId: null finds it.
    const forkOnly = (row: Record<string, unknown>) => ({ where }: { where: { forkId?: unknown } }) =>
      Promise.resolve(where.forkId === null ? null : row);

    const itemCases: [string, Record<string, unknown>, () => unknown][] = [
      ["update_thing_to_do", { itemId: "fork-item", notes: "x" }, () => updateItem],
      ["delete_thing_to_do", { itemId: "fork-item" }, () => deleteItem],
      ["schedule_thing_to_do", { itemId: "fork-item", date: "2026-05-02" }, () => scheduleItem],
      ["unschedule_thing_to_do", { itemId: "fork-item" }, () => unscheduleItem],
      ["place_idea_at_stop", { itemId: "fork-item", stopId: "stop-1" }, () => placeIdeaAtStop],
      ["set_vote", { tripId: TRIP_ID, itemId: "fork-item", level: "MUST" }, () => setVote],
      ["clear_vote", { tripId: TRIP_ID, itemId: "fork-item" }, () => clearVote],
    ];
    for (const [tool, args, action] of itemCases) {
      it(`${tool} with a Fork's item id is NOT_FOUND_TEXT and calls no action`, async () => {
        itemFindUnique.mockImplementation(forkOnly(itemRow()));
        const c = await connectTestClient();
        const r = await c.callTool({ name: tool, arguments: args });
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
        expect(action()).not.toHaveBeenCalled();
      });
    }

    const stopCases: [string, Record<string, unknown>, () => unknown][] = [
      ["place_idea_at_stop", { itemId: ITEM_ID, stopId: "fork-stop" }, () => placeIdeaAtStop],
      ["set_day_title", { stopId: "fork-stop", date: "2026-05-02", title: "x" }, () => setDayTitle],
      ["add_thing_to_do", { tripId: TRIP_ID, title: "x", category: "SIGHTSEEING", stopId: "fork-stop" }, () => createItem],
      ["update_thing_to_do", { itemId: ITEM_ID, stopId: "fork-stop" }, () => updateItem],
    ];
    for (const [tool, args, action] of stopCases) {
      it(`${tool} with a Fork's stop id is NOT_FOUND_TEXT and calls no action`, async () => {
        stopFindUnique.mockImplementation(forkOnly({ tripId: TRIP_ID }));
        const c = await connectTestClient();
        const r = await c.callTool({ name: tool, arguments: args });
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
        expect(action()).not.toHaveBeenCalled();
      });
    }

    it("update_chapter with a Fork's chapter id is NOT_FOUND_TEXT", async () => {
      chapterFindUnique.mockImplementation(forkOnly(chapterRow()));
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_chapter", arguments: { chapterId: "fork-chap", name: "x" } });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateChapter).not.toHaveBeenCalled();
    });

    it("a non-member's item id on a pass-through tool is NOT_FOUND_TEXT", async () => {
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "delete_thing_to_do", arguments: { itemId: ITEM_ID } });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(deleteItem).not.toHaveBeenCalled();
    });

    it("add_thing_to_do without a stopId needs no stop lookup", async () => {
      createItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "add_thing_to_do", arguments: { tripId: TRIP_ID, title: "x", category: "SIGHTSEEING" } });
      expect(stopFindUnique).not.toHaveBeenCalled();
      expect(createItem).toHaveBeenCalled();
    });
  });
});
