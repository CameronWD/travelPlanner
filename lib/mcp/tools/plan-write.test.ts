import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createItem,
  updateItem,
  deleteItem,
  scheduleItem,
  unscheduleItem,
  placeIdeaAtStop,
  addMarkerToWishlist,
  setOpeningHours,
  setVote,
  clearVote,
  setDayTitle,
  addNote,
  deleteNote,
  createChapter,
  updateChapter,
  requireTripAccess,
  itemFindUnique,
  chapterFindUnique,
  stopFindUnique,
  loadItemForMcp,
  loadStopForMcp,
  loadChapterForMcp,
  loadWishlistIdeaForMcp,
  loadVotesForMcp,
  loadNoteForMcp,
} = vi.hoisted(() => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  scheduleItem: vi.fn(),
  unscheduleItem: vi.fn(),
  placeIdeaAtStop: vi.fn(),
  addMarkerToWishlist: vi.fn(),
  setOpeningHours: vi.fn(),
  setVote: vi.fn(),
  clearVote: vi.fn(),
  setDayTitle: vi.fn(),
  addNote: vi.fn(),
  deleteNote: vi.fn(),
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  requireTripAccess: vi.fn(),
  itemFindUnique: vi.fn(),
  chapterFindUnique: vi.fn(),
  stopFindUnique: vi.fn(),
  loadItemForMcp: vi.fn(),
  loadStopForMcp: vi.fn(),
  loadChapterForMcp: vi.fn(),
  loadWishlistIdeaForMcp: vi.fn(),
  loadVotesForMcp: vi.fn(),
  loadNoteForMcp: vi.fn(),
}));

vi.mock("@/server/actions/items", () => ({
  createItem,
  updateItem,
  deleteItem,
  scheduleItem,
  unscheduleItem,
  placeIdeaAtStop,
  addMarkerToWishlist,
  setOpeningHours,
}));
vi.mock("@/server/actions/votes", () => ({ setVote, clearVote }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle }));
vi.mock("@/server/actions/notes", () => ({ addNote, deleteNote }));
vi.mock("../reads/notes", () => ({ loadNoteForMcp, loadNotesForMcp: vi.fn() }));
vi.mock("@/server/actions/chapters", () => ({ createChapter, updateChapter }));
vi.mock("../reads/entities", () => ({ loadItemForMcp, loadStopForMcp, loadChapterForMcp }));
vi.mock("../reads/lists", () => ({ loadWishlistIdeaForMcp, loadVotesForMcp }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { item: { findUnique: itemFindUnique }, chapter: { findUnique: chapterFindUnique }, stop: { findUnique: stopFindUnique } },
}));
// The rest of the server (reads.ts, trips-read.ts, trips-stops-write.ts)
// touches these only when their own tools are *called*; stubbing keeps
// buildMcpServer's full registration side-effect-free here.
//
// requireRealPlanRow (lib/mcp/real-plan.ts) is now a thin wrapper over
// requireRowAccess (lib/guards.ts, card C); this mock stands in for that
// guard exactly as the pre-Task-5 real-plan.ts used to do it directly —
// same db.<kind>.findUnique call shape (so every existing assertion on it
// keeps working unchanged), same requireTripAccess, and the real (unmocked)
// requireOutsideSurprise so a Surprise-carrying row would still be refused
// (no test here exercises that, but it stays faithful to production).
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async (kind: string, id: string) => {
    const args = { where: { id, forkId: null }, select: { tripId: true } };
    let row: Record<string, unknown> | null = null;
    if (kind === "item") row = await itemFindUnique(args);
    else if (kind === "chapter") row = await chapterFindUnique(args);
    else if (kind === "stop") row = await stopFindUnique(args);
    if (!row) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const { user, membership } = await requireTripAccess((row as { tripId: string }).tripId);
    let surpriseOf = null;
    if (kind === "item" || kind === "stop") {
      const { requireOutsideSurprise } = await import("@/lib/surprise-guard");
      surpriseOf = await requireOutsideSurprise(user.id, kind === "item" ? { itemId: id } : { stopId: id });
    }
    return { row, user, membership, surpriseOf };
  }),
);
vi.mock("@/lib/guards", () => ({
  requireTripAccess,
  requireUser: vi.fn(),
  isTripOwnerOrAdmin: vi.fn(),
  requireRowAccess: requireRowAccessMock,
}));
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
    loadItemForMcp.mockImplementation(async (id: string) => ({ id }));
    loadChapterForMcp.mockImplementation(async (id: string) => ({ id }));
    loadWishlistIdeaForMcp.mockImplementation(async (id: string) => ({ id, votes: [] }));
    loadVotesForMcp.mockImplementation(async (itemId: string) => ({ itemId, votes: [] }));
    loadStopForMcp.mockResolvedValue({ id: "stop-1", days: [{ date: "2027-06-02", dayTitle: "Ribeira day", items: [] }] });
  });

  it("registers every write tool, none accepting a forkId", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "add_thing_to_do",
        "update_thing_to_do",
        "set_opening_hours",
        "delete_thing_to_do",
        "schedule_thing_to_do",
        "unschedule_thing_to_do",
        "place_idea_at_stop",
        "add_marker_to_wishlist",
        "set_vote",
        "clear_vote",
        "set_day_title",
        "add_note",
        "delete_note",
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

  describe("Booking state (spec 2026-10-17 R2, R13)", () => {
    it("update_thing_to_do passes bookingState through and turns bookBy \"\" into a clear (null)", async () => {
      updateItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, bookingState: "TO_BOOK", bookBy: "" } });
      expect(updateItem).toHaveBeenCalledWith(ITEM_ID, { bookingState: "TO_BOOK", bookBy: null });
    });

    it("add_thing_to_do forwards bookingState and bookBy", async () => {
      createItem.mockResolvedValue({ success: true, id: "item-new" });
      const c = await connectTestClient();
      await c.callTool({
        name: "add_thing_to_do",
        arguments: { tripId: TRIP_ID, title: "Alhambra", category: "SIGHTSEEING", bookingState: "TO_BOOK", bookBy: "2027-05-01" },
      });
      expect(createItem).toHaveBeenCalledWith(TRIP_ID, expect.objectContaining({ bookingState: "TO_BOOK", bookBy: "2027-05-01" }));
    });
  });

  describe("update_thing_to_do (PATCH)", () => {
    it("checks the item and any new Stop are real-plan, then forwards only the fields passed", async () => {
      updateItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, notes: "new notes" } });
      expect(itemFindUnique).toHaveBeenCalledWith({ where: { id: ITEM_ID, forkId: null }, select: { tripId: true } });
      expect(updateItem).toHaveBeenCalledWith(ITEM_ID, { notes: "new notes" });
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

  // Task D.12 (CONTEXT.md "Opening hours"). Adapted from the brief's assumed
  // weekly/closedDates/sourceUrl shape to d-as-built.md: S's real OpeningHours
  // is week (sun..sat)/seasons/closed, and the field (and this tool's
  // override argument) is named source, not sourceUrl.
  describe("set_opening_hours (R4)", () => {
    it("checks the real plan, saves through setOpeningHours with the source link, and returns the item", async () => {
      setOpeningHours.mockResolvedValue({ success: true });
      loadItemForMcp.mockResolvedValue({ id: ITEM_ID, openingHours: { week: {}, seasons: [], closed: [] } });
      const span = [["10:00", "18:00"]];
      const hours = { week: { sun: [], mon: span, tue: span, wed: span, thu: span, fri: span, sat: span }, seasons: [], closed: ["2027-12-25"] };
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_opening_hours", arguments: { itemId: ITEM_ID, hours, source: "https://lello.example/hours" } });
      expect(r.isError).toBeFalsy();
      expect(itemFindUnique).toHaveBeenCalledWith({ where: { id: ITEM_ID, forkId: null }, select: { tripId: true } });
      expect(setOpeningHours).toHaveBeenCalledWith(ITEM_ID, { ...hours, source: "https://lello.example/hours" });
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ item: { id: ITEM_ID, openingHours: { week: {}, seasons: [], closed: [] } } });
    });

    it("with null clears them", async () => {
      setOpeningHours.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "set_opening_hours", arguments: { itemId: ITEM_ID, hours: null } });
      expect(setOpeningHours).toHaveBeenCalledWith(ITEM_ID, null);
    });

    it("on a Fork's row is not found and writes nothing", async () => {
      itemFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_opening_hours", arguments: { itemId: ITEM_ID, hours: null } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(setOpeningHours).not.toHaveBeenCalled();
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

  it("the schedule tool refuses 24:00 and an impossible date before calling the action", async () => {
    const c = await connectTestClient();
    const bad = await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: "i1", date: "2026-04-31" } });
    expect(bad.isError).toBe(true);
    const late = await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: "i1", date: "2026-04-30", startTime: "24:00" } });
    expect(late.isError).toBe(true);
    expect(scheduleItem).not.toHaveBeenCalled();
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

  it("add_note returns the new Note: id, body and what it is on", async () => {
    addNote.mockResolvedValue({ success: true, id: "note-1" });
    loadNoteForMcp.mockResolvedValue({ id: "note-1", targetType: "ITEM", targetId: "item-1", body: "Book ahead", author: "Cam", createdAt: "2026-10-16T09:00:00.000Z" });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "add_note", arguments: { tripId: "trip-1", targetType: "ITEM", targetId: "item-1", body: "Book ahead" } });
    expect(addNote).toHaveBeenCalledWith("trip-1", { targetType: "ITEM", targetId: "item-1", body: "Book ahead" });
    expect(loadNoteForMcp).toHaveBeenCalledWith("note-1");
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({
      note: { id: "note-1", targetType: "ITEM", targetId: "item-1", body: "Book ahead", author: "Cam", createdAt: "2026-10-16T09:00:00.000Z" },
    });
  });

  describe("delete_note (F2)", () => {
    it("calls deleteNote and returns { deleted }", async () => {
      deleteNote.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "delete_note", arguments: { noteId: "note-1" } });
      expect(deleteNote).toHaveBeenCalledWith("note-1");
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ deleted: "note-1" });
    });

    it("a Note the caller can't reach (not on their Trip, inside a Surprise hidden from them) is NOT_FOUND_TEXT", async () => {
      deleteNote.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
      const c = await connectTestClient();
      const r = await c.callTool({ name: "delete_note", arguments: { noteId: "note-x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
    });

    it("is destructive and asks Claude to confirm first, like the other delete tools", async () => {
      const c = await connectTestClient();
      const { tools } = await c.listTools();
      const t = tools.find((x) => x.name === "delete_note")!;
      expect(t.annotations?.destructiveHint).toBe(true);
      expect(t.description).toMatch(/This cannot be undone\. Confirm with the person before calling this\./);
    });
  });

  it("the Note tools and update_thing_to_do tell a Note from an Item's own notes", async () => {
    const c = await connectTestClient();
    const { tools } = await c.listTools();
    const d = (n: string) => tools.find((t) => t.name === n)!.description!;
    for (const name of ["add_note", "get_notes", "delete_note"]) {
      expect(d(name), name).toMatch(/never edited/i);
      expect(d(name), name).toMatch(/update_thing_to_do/);
    }
    expect(d("update_thing_to_do")).toMatch(/add_note/);
    expect(d("update_thing_to_do")).toMatch(/not a Note/i);
    const notesField = (tools.find((t) => t.name === "update_thing_to_do")!.inputSchema as { properties: Record<string, { description?: string }> }).properties.notes;
    expect(notesField.description).toMatch(/add_note/);
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
    it("checks the Chapter is real-plan, then forwards only the fields passed", async () => {
      updateChapter.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_chapter", arguments: { chapterId: CHAPTER_ID, name: "New name" } });
      expect(chapterFindUnique).toHaveBeenCalledWith({ where: { id: CHAPTER_ID, forkId: null }, select: { tripId: true } });
      expect(updateChapter).toHaveBeenCalledWith(CHAPTER_ID, { name: "New name" });
    });

    // keep, unchanged: "checks trip access before …" and "a made-up chapter id …" —
    // requireRealPlanRow's access check now refuses them.
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

    it("the action's refusal maps to isError", async () => {
      updateChapter.mockResolvedValue({ success: false, errors: { endDate: ["Set both dates or neither"] } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_chapter", arguments: { chapterId: CHAPTER_ID, startDate: "2026-06-01" } });
      expect(r.isError).toBe(true);
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

  describe("writes return the row (F6)", () => {
    const body = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

    it("add_thing_to_do returns the new Item through get_item", async () => {
      createItem.mockResolvedValue({ success: true, id: "new-1" });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "add_thing_to_do", arguments: { tripId: "trip-1", title: "Castle", category: "SIGHTSEEING" } }))).toEqual({ item: { id: "new-1" } });
      expect(loadItemForMcp).toHaveBeenCalledWith("new-1");
    });

    it("schedule_thing_to_do returns the placed copy when an idea was copied onto the date", async () => {
      itemFindUnique.mockResolvedValue({ tripId: "trip-1" });
      scheduleItem.mockResolvedValue({ success: true, placedItemId: "placed-1" });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: "idea-1", date: "2027-06-02" } }))).toEqual({ item: { id: "placed-1" } });
    });

    it("schedule_thing_to_do on a placed thing to do returns that Item", async () => {
      scheduleItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: "item-1", date: "2027-06-02" } }))).toEqual({ item: { id: "item-1" } });
    });

    it("place_idea_at_stop returns the placed copy", async () => {
      placeIdeaAtStop.mockResolvedValue({ success: true, placedItemId: "placed-2" });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "place_idea_at_stop", arguments: { itemId: "idea-1", stopId: "stop-1" } }))).toEqual({ item: { id: "placed-2" } });
    });

    it.each([
      [{ success: true, mode: "placement-removed", sourceItemId: "idea-1" }, { deleted: "item-1", ideaId: "idea-1" }],
      [{ success: true, mode: "unslotted", sourceItemId: null }, { item: { id: "item-1" } }],
    ])("unschedule_thing_to_do returns %j as %j", async (result, expected) => {
      itemFindUnique.mockResolvedValue({ tripId: "trip-1" });
      unscheduleItem.mockResolvedValue(result);
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "unschedule_thing_to_do", arguments: { itemId: "item-1" } }))).toEqual(expected);
    });

    it("set_day_title returns that day of the Stop with its title", async () => {
      stopFindUnique.mockResolvedValue({ tripId: "trip-1" });
      setDayTitle.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "set_day_title", arguments: { stopId: "stop-1", date: "2027-06-02", title: "Ribeira day" } }))).toEqual({
        stopId: "stop-1", day: { date: "2027-06-02", dayTitle: "Ribeira day", items: [] },
      });
    });

    it("set_vote returns the Votes on the Item; add_chapter the new Chapter; delete_thing_to_do { deleted }", async () => {
      itemFindUnique.mockResolvedValue({ tripId: "trip-1" });
      setVote.mockResolvedValue({ success: true });
      createChapter.mockResolvedValue({ success: true, id: "ch-1" });
      deleteItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "set_vote", arguments: { tripId: "trip-1", itemId: "item-1", level: "KEEN" } }))).toEqual({ itemId: "item-1", votes: [] });
      expect(body(await c.callTool({ name: "add_chapter", arguments: { tripId: "trip-1", name: "Italy", colour: "rose" } }))).toEqual({ chapter: { id: "ch-1" } });
      expect(body(await c.callTool({ name: "delete_thing_to_do", arguments: { itemId: "item-1" } }))).toEqual({ deleted: "item-1" });
    });

    it("add_marker_to_wishlist returns the idea; update_chapter the Chapter; clear_vote the Votes", async () => {
      addMarkerToWishlist.mockResolvedValue({ success: true, id: "idea-9" });
      updateChapter.mockResolvedValue({ success: true });
      clearVote.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "add_marker_to_wishlist", arguments: { markerId: "m-1", tripId: "trip-1" } }))).toEqual({ idea: { id: "idea-9", votes: [] } });
      expect(body(await c.callTool({ name: "update_chapter", arguments: { chapterId: "chapter-1", name: "Rome" } }))).toEqual({ chapter: { id: "chapter-1" } });
      expect(body(await c.callTool({ name: "clear_vote", arguments: { tripId: "trip-1", itemId: "item-1" } }))).toEqual({ itemId: "item-1", votes: [] });
    });
  });

  describe("Slot time on the thing-to-do tools (R3)", () => {
    it("add_thing_to_do forwards slotTime, arriveByMinutes and refundable to createItem, mapped to a boolean", async () => {
      createItem.mockResolvedValue({ success: true, id: "new-1" });
      const c = await connectTestClient();
      await c.callTool({ name: "add_thing_to_do", arguments: { tripId: TRIP_ID, title: "Lodge tour", category: "ACTIVITY", date: "2027-06-02", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" } });
      expect(createItem.mock.calls[0][1]).toEqual(expect.objectContaining({ slotTime: "12:00", arriveByMinutes: 15, refundable: false }));
    });
    it("add_thing_to_do's refundable UNKNOWN is the same as not setting it (nothing to clear on a create)", async () => {
      createItem.mockResolvedValue({ success: true, id: "new-2" });
      const c = await connectTestClient();
      await c.callTool({ name: "add_thing_to_do", arguments: { tripId: TRIP_ID, title: "x", category: "ACTIVITY", refundable: "UNKNOWN" } });
      expect(createItem.mock.calls[0][1].refundable).toBeUndefined();
    });
    it("update_thing_to_do passes null through to clear the slot, and refuses a made-up refundability", async () => {
      updateItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, slotTime: null, arriveByMinutes: null } });
      expect(updateItem).toHaveBeenCalledWith(ITEM_ID, { slotTime: null, arriveByMinutes: null });
      const bad = await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, refundable: "MAYBE" } });
      expect(bad.isError).toBe(true);
    });
    it("update_thing_to_do maps YES/NO/UNKNOWN to true/false/null, UNKNOWN clearing it back to not known", async () => {
      updateItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, refundable: "YES" } });
      expect(updateItem).toHaveBeenCalledWith(ITEM_ID, { refundable: true });
      await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, refundable: "UNKNOWN" } });
      expect(updateItem).toHaveBeenCalledWith(ITEM_ID, { refundable: null });
    });
    it("clearing slotTime alone while a margin remains is refused with the arrive-by message (checkSlotFields, via the action) (fix round 1 #3)", async () => {
      const { ARRIVE_BY_NEEDS_SLOT_MESSAGE } = await import("@/lib/validations/planning");
      updateItem.mockResolvedValue({ success: false, errors: { arriveByMinutes: [ARRIVE_BY_NEEDS_SLOT_MESSAGE] } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, slotTime: null } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain(ARRIVE_BY_NEEDS_SLOT_MESSAGE);
    });
    it("update_thing_to_do's startTime takes null, to let a slot default it again (fix round 1 #6)", async () => {
      updateItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, startTime: null } });
      expect(updateItem).toHaveBeenCalledWith(ITEM_ID, { startTime: null });
      const tool = (await c.listTools()).tools.find((t) => t.name === "update_thing_to_do")!;
      expect(tool.description).toMatch(/null startTime/i);
    });
    it("schedule_thing_to_do forwards a slot; its description says start defaults from it", async () => {
      scheduleItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: ITEM_ID, date: "2027-06-02", slotTime: "20:00", arriveByMinutes: 10 } });
      expect(scheduleItem.mock.calls[0][1]).toEqual({ date: "2027-06-02", slotTime: "20:00", arriveByMinutes: 10 });
      const tool = (await c.listTools()).tools.find((t) => t.name === "schedule_thing_to_do")!;
      expect(tool.description).toMatch(/slot/i);
    });
    it("the slot fields are described as the ticket's, not the start", async () => {
      const c = await connectTestClient();
      const add = (await c.listTools()).tools.find((t) => t.name === "add_thing_to_do")!;
      const props = (add.inputSchema as { properties: Record<string, { description?: string }> }).properties;
      expect(props.slotTime.description).toMatch(/ticket/i);
      expect(props.refundable.description).toMatch(/UNKNOWN/);
    });
    it("update_thing_to_do's description says passing null for both slotTime and arriveByMinutes clears the slot", async () => {
      const c = await connectTestClient();
      const tool = (await c.listTools()).tools.find((t) => t.name === "update_thing_to_do")!;
      expect(tool.description).toMatch(/pass null for both slottime and arrivebyminutes/i);
    });
  });
});
