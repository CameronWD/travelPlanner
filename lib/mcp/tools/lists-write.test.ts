import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const {
  addReminder,
  updateReminder,
  deleteReminder,
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  setBuyState,
  deleteChecklistItem,
  reorderChecklistItem,
  saveAsTemplate,
  applyTemplate,
  requireTripAccess,
  reminderFindUnique,
  stopFindUnique,
  tripFindUnique,
  createFeedbackNote,
} = vi.hoisted(() => ({
  addReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
  addChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(),
  setBuyState: vi.fn(),
  deleteChecklistItem: vi.fn(),
  reorderChecklistItem: vi.fn(),
  saveAsTemplate: vi.fn(),
  applyTemplate: vi.fn(),
  requireTripAccess: vi.fn(),
  reminderFindUnique: vi.fn(),
  stopFindUnique: vi.fn(),
  tripFindUnique: vi.fn(),
  createFeedbackNote: vi.fn(),
}));

vi.mock("@/server/actions/reminders", () => ({ addReminder, updateReminder, deleteReminder }));
vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  setBuyState,
  deleteChecklistItem,
  reorderChecklistItem,
  saveAsTemplate,
  applyTemplate,
}));
vi.mock("@/server/actions/feedback", () => ({ createFeedbackNote }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    reminder: { findUnique: reminderFindUnique },
    stop: { findUnique: stopFindUnique },
    trip: { findUnique: tripFindUnique },
  },
}));
// The rest of the server (reads.ts, trips-read.ts, trips-stops-write.ts,
// plan-write.ts, bookings-write.ts) touches these only when their own
// tools are *called*; stubbing keeps buildMcpServer's full registration
// side-effect-free here without reproducing every property.
//
// requireRealPlanRow (lib/mcp/real-plan.ts) is now a thin wrapper over
// requireRowAccess (lib/guards.ts, card C); this mock stands in for that
// guard exactly as the pre-Task-5 real-plan.ts used to do it directly —
// same db.stop.findUnique call shape (so every existing assertion on it
// keeps working unchanged), same requireTripAccess, and the real (unmocked)
// requireOutsideSurprise so a Surprise-carrying row would still be refused
// (no test here exercises that, but it stays faithful to production).
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async (kind: string, id: string) => {
    const args = { where: { id, forkId: null }, select: { tripId: true } };
    const row = kind === "stop" ? await stopFindUnique(args) : null;
    if (!row) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const { user, membership } = await requireTripAccess((row as { tripId: string }).tripId);
    let surpriseOf = null;
    if (kind === "stop") {
      const { requireOutsideSurprise } = await import("@/lib/surprise-guard");
      surpriseOf = await requireOutsideSurprise(user.id, { stopId: id });
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

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";

const TRIP_ID = "trip-1";
const REMINDER_ID = "reminder-1";
const ITEM_ID = "item-1";
const STOP_ID = "stop-1";
const notFoundErr = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

const reminderRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  title: "Reconfirm the tour",
  date: "2026-07-02",
  stopId: null,
  ...overrides,
});

describe("reminder and checklist write tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    // Real-plan pre-check default: every stop id names a real-plan Stop on TRIP_ID.
    stopFindUnique.mockResolvedValue({ tripId: TRIP_ID });
  });

  it("registers every write tool, none accepting a forkId", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "add_reminder",
        "update_reminder",
        "delete_reminder",
        "add_checklist_item",
        "add_shopping_item",
        "update_checklist_item",
        "tick_checklist_item",
        "set_need_to_buy",
        "move_checklist_item",
        "delete_checklist_item",
        "save_packing_template",
        "apply_packing_template",
        "leave_feedback",
      ]),
    );
    for (const t of tools) {
      const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("forkId");
    }
  });

  // -------------------------------------------------------------------------
  // Reminders
  // -------------------------------------------------------------------------

  it("add_reminder calls addReminder(tripId, { title, date }) with no stopId when omitted", async () => {
    addReminder.mockResolvedValue({ success: true, id: "r1" });
    const c = await connectTestClient();
    await c.callTool({ name: "add_reminder", arguments: { tripId: TRIP_ID, title: "Pack passports", date: "2026-07-02" } });
    expect(addReminder).toHaveBeenCalledWith(TRIP_ID, { title: "Pack passports", date: "2026-07-02" });
  });

  it("add_reminder forwards stopId when given", async () => {
    addReminder.mockResolvedValue({ success: true, id: "r1" });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_reminder",
      arguments: { tripId: TRIP_ID, title: "Sort visa", date: "2026-07-02", stopId: STOP_ID },
    });
    expect(addReminder).toHaveBeenCalledWith(TRIP_ID, { title: "Sort visa", date: "2026-07-02", stopId: STOP_ID });
  });

  describe("update_reminder (PATCH)", () => {
    it("forwards only the fields passed", async () => {
      updateReminder.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_reminder", arguments: { reminderId: REMINDER_ID, title: "New title" } });
      expect(updateReminder).toHaveBeenCalledWith(REMINDER_ID, { title: "New title" });
      expect(reminderFindUnique).not.toHaveBeenCalled();
    });

    it("a made-up reminderId reads as NOT_FOUND_TEXT, same as a non-member's", async () => {
      updateReminder.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_reminder", arguments: { reminderId: REMINDER_ID, title: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
    });
  });

  it("delete_reminder calls deleteReminder(id)", async () => {
    deleteReminder.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "delete_reminder", arguments: { reminderId: REMINDER_ID } });
    expect(deleteReminder).toHaveBeenCalledWith(REMINDER_ID);
  });

  it("delete_reminder description is permanent, destructiveHint true", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const tool = tools.find((t) => t.name === "delete_reminder")!;
    expect(tool.description?.toLowerCase()).toContain("permanent");
    expect(tool.description?.toLowerCase()).toContain("confirm");
    expect(tool.annotations?.destructiveHint).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Checklists
  // -------------------------------------------------------------------------

  it("add_checklist_item's kind schema excludes SHOPPING", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const tool = tools.find((t) => t.name === "add_checklist_item")!;
    const props = (tool.inputSchema as { properties?: Record<string, { enum?: string[] }> }).properties ?? {};
    expect(props.kind?.enum).toEqual(["PRETRIP", "PACKING"]);
  });

  it("add_checklist_item calls addChecklistItem(tripId, { kind, text })", async () => {
    addChecklistItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "add_checklist_item", arguments: { tripId: TRIP_ID, kind: "PRETRIP", text: "Buy insurance" } });
    expect(addChecklistItem).toHaveBeenCalledWith(TRIP_ID, { kind: "PRETRIP", text: "Buy insurance" });
  });

  it("add_checklist_item forwards dueDate when given", async () => {
    addChecklistItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_checklist_item",
      arguments: { tripId: TRIP_ID, kind: "PACKING", text: "Sunscreen", dueDate: "2026-07-01" },
    });
    expect(addChecklistItem).toHaveBeenCalledWith(TRIP_ID, { kind: "PACKING", text: "Sunscreen", dueDate: "2026-07-01" });
  });

  it("add_shopping_item calls addChecklistItem(tripId, { kind: SHOPPING, text })", async () => {
    addChecklistItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "add_shopping_item", arguments: { tripId: TRIP_ID, text: "Flight snacks" } });
    expect(addChecklistItem).toHaveBeenCalledWith(TRIP_ID, { kind: "SHOPPING", text: "Flight snacks" });
  });

  describe("update_checklist_item", () => {
    it("with only text does not touch dueDate", async () => {
      updateChecklistItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_checklist_item", arguments: { itemId: ITEM_ID, text: "New text" } });
      expect(updateChecklistItem).toHaveBeenCalledWith(ITEM_ID, { text: "New text" });
    });

    it("dueDate null clears it (forwarded as empty string to the action)", async () => {
      updateChecklistItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_checklist_item", arguments: { itemId: ITEM_ID, dueDate: null } });
      expect(updateChecklistItem).toHaveBeenCalledWith(ITEM_ID, { dueDate: "" });
    });

    it("a given dueDate is forwarded as-is", async () => {
      updateChecklistItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_checklist_item", arguments: { itemId: ITEM_ID, dueDate: "2026-08-01" } });
      expect(updateChecklistItem).toHaveBeenCalledWith(ITEM_ID, { dueDate: "2026-08-01" });
    });

    it("omitting both fields calls the action with neither", async () => {
      updateChecklistItem.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_checklist_item", arguments: { itemId: ITEM_ID } });
      expect(updateChecklistItem).toHaveBeenCalledWith(ITEM_ID, {});
    });
  });

  it("tick_checklist_item calls toggleChecklistItem(itemId, done)", async () => {
    toggleChecklistItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "tick_checklist_item", arguments: { itemId: ITEM_ID, done: true } });
    expect(toggleChecklistItem).toHaveBeenCalledWith(ITEM_ID, true);
  });

  it("set_need_to_buy calls setBuyState(itemId, buy)", async () => {
    setBuyState.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "set_need_to_buy", arguments: { itemId: ITEM_ID, buy: "NEEDED" } });
    expect(setBuyState).toHaveBeenCalledWith(ITEM_ID, "NEEDED");
  });

  it("set_need_to_buy accepts a null buy to clear it", async () => {
    setBuyState.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "set_need_to_buy", arguments: { itemId: ITEM_ID, buy: null } });
    expect(setBuyState).toHaveBeenCalledWith(ITEM_ID, null);
  });

  it("set_need_to_buy's own-kind refusal surfaces as a tool error, not success", async () => {
    setBuyState.mockResolvedValue({
      success: false,
      errors: { _: ["Only a Packing item can be marked to buy."] },
    });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_need_to_buy", arguments: { itemId: ITEM_ID, buy: "NEEDED" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain("Only a Packing item can be marked to buy.");
  });

  it("move_checklist_item calls reorderChecklistItem(itemId, direction)", async () => {
    reorderChecklistItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "move_checklist_item", arguments: { itemId: ITEM_ID, direction: "up" } });
    expect(reorderChecklistItem).toHaveBeenCalledWith(ITEM_ID, "up");
  });

  it("delete_checklist_item calls deleteChecklistItem(itemId)", async () => {
    deleteChecklistItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "delete_checklist_item", arguments: { itemId: ITEM_ID } });
    expect(deleteChecklistItem).toHaveBeenCalledWith(ITEM_ID);
  });

  it("delete_checklist_item description is permanent, destructiveHint true", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const tool = tools.find((t) => t.name === "delete_checklist_item")!;
    expect(tool.description?.toLowerCase()).toContain("permanent");
    expect(tool.description?.toLowerCase()).toContain("confirm");
    expect(tool.annotations?.destructiveHint).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Packing templates
  // -------------------------------------------------------------------------

  it("save_packing_template calls saveAsTemplate(tripId, name) and returns the templateId", async () => {
    saveAsTemplate.mockResolvedValue({ success: true, templateId: "tpl-1" });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "save_packing_template", arguments: { tripId: TRIP_ID, name: "Europe winter" } });
    expect(saveAsTemplate).toHaveBeenCalledWith(TRIP_ID, "Europe winter");
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ templateId: "tpl-1" });
  });

  it("apply_packing_template calls applyTemplate(tripId, templateId)", async () => {
    applyTemplate.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "apply_packing_template", arguments: { tripId: TRIP_ID, templateId: "tpl-1" } });
    expect(applyTemplate).toHaveBeenCalledWith(TRIP_ID, "tpl-1");
  });

  it("apply_packing_template's not-owned/missing template reads as NOT_FOUND_TEXT", async () => {
    applyTemplate.mockRejectedValue(notFoundErr());
    const c = await connectTestClient();
    const r = await c.callTool({ name: "apply_packing_template", arguments: { tripId: TRIP_ID, templateId: "tpl-1" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
  });
  // -------------------------------------------------------------------------
  // Feedback
  // -------------------------------------------------------------------------

  describe("leave_feedback", () => {
    it("calls createFeedbackNote with the fixed Claude-connection fields and no trip", async () => {
      createFeedbackNote.mockResolvedValue({ success: true, note: { id: "fb-1", status: "NEEDS_REVIEW" } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "leave_feedback", arguments: { body: "The map jumps on load" } });

      expect(createFeedbackNote).toHaveBeenCalledTimes(1);
      const input = createFeedbackNote.mock.calls[0][0];
      expect(input).toMatchObject({
        body: "The map jumps on load",
        route: "/claude",
        pageLabel: "Claude connection",
        tripId: null,
        tripName: null,
        userAgent: "Claude connection",
      });
      expect(typeof input.clientKey).toBe("string");
      expect(input.clientKey.length).toBeGreaterThan(0);
      expect(input.clientKey.length).toBeLessThanOrEqual(64);
      expect(Number.isNaN(Date.parse(input.authoredAt))).toBe(false);

      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ noteId: "fb-1", status: "NEEDS_REVIEW" });
    });

    it("with a tripId, looks up trip access and the trip's name first", async () => {
      createFeedbackNote.mockResolvedValue({ success: true, note: { id: "fb-2", status: "OPEN" } });
      tripFindUnique.mockResolvedValue({ name: "Europe" });
      const c = await connectTestClient();
      await c.callTool({ name: "leave_feedback", arguments: { body: "Nice trip", tripId: TRIP_ID } });

      expect(requireTripAccess).toHaveBeenCalledWith(TRIP_ID);
      expect(tripFindUnique).toHaveBeenCalledWith({ where: { id: TRIP_ID }, select: { name: true } });
      const input = createFeedbackNote.mock.calls[0][0];
      expect(input).toMatchObject({ tripId: TRIP_ID, tripName: "Europe" });
    });

    it("a tripId the viewer is not on reads as NOT_FOUND_TEXT and calls createFeedbackNote not at all", async () => {
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "leave_feedback", arguments: { body: "x", tripId: TRIP_ID } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(createFeedbackNote).not.toHaveBeenCalled();
    });

    it("a failed action surfaces as a tool error through runTool's normal path", async () => {
      createFeedbackNote.mockResolvedValue({ success: false, errors: { body: ["Feedback cannot be empty"] } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "leave_feedback", arguments: { body: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Feedback cannot be empty");
    });
  });

  describe("real plan only: a Fork's stop reads as not found", () => {
    const forkOnly = ({ where }: { where: { forkId?: unknown } }) =>
      Promise.resolve(where.forkId === null ? null : { tripId: TRIP_ID });

    it("add_reminder with a Fork's stopId is NOT_FOUND_TEXT and adds nothing", async () => {
      stopFindUnique.mockImplementation(forkOnly);
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "add_reminder",
        arguments: { tripId: TRIP_ID, title: "x", date: "2026-07-02", stopId: "fork-stop" },
      });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(addReminder).not.toHaveBeenCalled();
    });

    it("update_reminder with a Fork's stopId is NOT_FOUND_TEXT and updates nothing", async () => {
      reminderFindUnique.mockResolvedValue(reminderRow());
      stopFindUnique.mockImplementation(forkOnly);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_reminder", arguments: { reminderId: REMINDER_ID, stopId: "fork-stop" } });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateReminder).not.toHaveBeenCalled();
    });

    it("add_reminder without a stopId needs no stop lookup", async () => {
      addReminder.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "add_reminder", arguments: { tripId: TRIP_ID, title: "x", date: "2026-07-02" } });
      expect(stopFindUnique).not.toHaveBeenCalled();
      expect(addReminder).toHaveBeenCalled();
    });
  });
});
