/**
 * Spec 2026-10-16 F6: every MCP write tool returns the row as it now stands
 * (or `{ deleted }`), never `{}`. This walks every registered tool without
 * `readOnlyHint`, calls it once with valid arguments while every action
 * succeeds, and fails if one comes back empty. A new write tool must be added
 * to ARGS, or the first test fails.
 */
import { describe, expect, it, vi } from "vitest";

const { ok, row } = vi.hoisted(() => {
  const OK = {
    success: true, id: "new-1", placedItemId: "placed-1", cost: { id: "cost-1" }, tripId: "trip-1", href: "/trips/trip-1",
    templateId: "tpl-1", mode: "unslotted", sourceItemId: null, conflicts: [],
    preview: { accommodations: [], unpaidCosts: [], attachmentCount: 0, noteCount: 0 },
    note: { id: "fb-1", status: "OPEN" },
  };
  return {
    ok: () => vi.fn(async () => OK),
    row: () => vi.fn(async (id: string) => ({ id })),
  };
});

vi.mock("@/server/actions/trips", () => ({ createTrip: ok(), updateTrip: ok(), setTripHardEndDate: ok() }));
vi.mock("@/server/actions/stops", () => ({
  createStop: ok(), updateStop: ok(), deleteStop: ok(), previewStopDeletion: ok(), moveStop: ok(), setStopDates: ok(),
  firmUpTrip: ok(), toggleStopPin: ok(), makeStopRough: ok(), setStopNotes: ok(), setStopNights: ok(),
}));
vi.mock("@/server/actions/chapters", () => ({ assignStopToChapter: ok(), createChapter: ok(), updateChapter: ok() }));
vi.mock("@/server/actions/surprise", () => ({ setSurprise: ok(), revealSurprise: ok() }));
vi.mock("@/server/actions/items", () => ({
  createItem: ok(), updateItem: ok(), deleteItem: ok(), scheduleItem: ok(), unscheduleItem: ok(),
  placeIdeaAtStop: ok(), addMarkerToWishlist: ok(),
}));
vi.mock("@/server/actions/votes", () => ({ setVote: ok(), clearVote: ok() }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: ok() }));
vi.mock("@/server/actions/notes", () => ({ addNote: ok(), deleteNote: ok() }));
vi.mock("@/server/actions/accommodation", () => ({ createAccommodation: ok(), updateAccommodation: ok(), deleteAccommodation: ok() }));
vi.mock("@/server/actions/transport", () => ({ createTransport: ok(), updateTransport: ok(), deleteTransport: ok() }));
vi.mock("@/server/actions/costs", () => ({ createCost: ok(), updateCost: ok(), deleteCost: ok(), markCostPaid: ok(), markCostUnpaid: ok() }));
vi.mock("@/server/actions/reminders", () => ({ addReminder: ok(), updateReminder: ok(), deleteReminder: ok() }));
vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem: ok(), updateChecklistItem: ok(), toggleChecklistItem: ok(), setBuyState: ok(), deleteChecklistItem: ok(),
  reorderChecklistItem: ok(), saveAsTemplate: ok(), applyTemplate: ok(),
  listTemplates: vi.fn(async () => [{ id: "tpl-1", name: "Beach", itemCount: 3 }]),
}));
vi.mock("@/server/actions/feedback", () => ({ createFeedbackNote: ok() }));

// Readers: each answers with a row naming the id it was asked for.
vi.mock("../reads/entities", () => ({
  loadStopForMcp: row(), loadItemForMcp: row(), loadTransportForMcp: row(), loadAccommodationForMcp: row(),
  loadChapterForMcp: row(), loadTripSummaryForMcp: row(),
  readMcpStops: vi.fn(async (_t: string, ids: string[]) => ids.map((id) => ({ id }))),
}));
vi.mock("../reads/stop-changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../reads/stop-changes")>()),
  stopTracker: () => ({
    start: vi.fn(async () => {}),
    stopAndShifted: vi.fn(async (id: string) => ({ stop: { id }, shifted: [] })),
    changed: vi.fn(async () => [{ id: "stop-1" }]),
  }),
}));
vi.mock("../reads/notes", () => ({ loadNoteForMcp: row(), loadNotesForMcp: vi.fn() }));
vi.mock("../reads/costs", () => ({ loadCostForMcp: row(), loadCostsForMcp: vi.fn() }));
vi.mock("../reads/lists", () => ({
  loadChecklistItemForMcp: row(),
  loadChecklistOfItemForMcp: vi.fn(async () => ({ kind: "PACKING", items: [{ id: "ci-1" }] })),
  readChecklist: vi.fn(async () => [{ id: "ci-1" }]),
  loadWishlistIdeaForMcp: row(),
  loadVotesForMcp: vi.fn(async (itemId: string) => ({ itemId, votes: [] })),
}));
vi.mock("@/lib/reminder-reads", () => ({ readReminderItem: row(), listRemindersForTrip: vi.fn() }));

// Access: every id is a real-plan row on trip-1 the caller can reach.
vi.mock("../real-plan", () => ({
  requireRealPlanRow: vi.fn(async () => ({ tripId: "trip-1" })),
  requireRealPlanRows: vi.fn(async () => {}),
}));
vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "u1" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "u1" }, membership: { role: "owner" } })),
  requireRowAccess: vi.fn(async () => ({ row: { tripId: "trip-1", ownerType: "OTHER", ownerId: null }, user: { id: "u1" } })),
  isTripOwnerOrAdmin: vi.fn(() => true),
}));
vi.mock("@/lib/surprise-guard", () => ({ requireOutsideSurprise: vi.fn(async () => null) }));
vi.mock("@/lib/db", () => ({
  db: {
    stop: {
      findUnique: vi.fn(async () => ({ tripId: "trip-1", pinned: false })),
      findMany: vi.fn(async () => [{ id: "stop-1", name: "Rome", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 0 }]),
    },
    cost: { findUnique: vi.fn(async () => ({ tripId: "trip-1" })) },
    trip: { findUnique: vi.fn(async () => ({ name: "Japan", startDate: null })) },
  },
}));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";

/** One valid call per write tool. */
const ARGS: Record<string, Record<string, unknown>> = {
  create_trip: { name: "Japan", homeCurrency: "AUD" },
  update_trip: { tripId: "trip-1", name: "Japan" },
  set_hard_end_date: { tripId: "trip-1", hardEndDate: null },
  add_stop: { tripId: "trip-1", name: "Rome", countryCode: "it", nights: 2 },
  update_stop: { stopId: "stop-1", name: "Roma" },
  delete_stop: { stopId: "stop-1" },
  move_stop: { stopId: "stop-1", direction: "down" },
  set_stop_nights: { stopId: "stop-1", nights: 3 },
  set_stop_dates: { stopId: "stop-1", arriveDate: "2027-06-01", departDate: "2027-06-04" },
  set_stop_pinned: { stopId: "stop-1", pinned: true },
  make_stop_rough: { stopId: "stop-1" },
  set_stop_notes: { stopId: "stop-1", notes: "Ferry at 9" },
  firm_up_trip: { tripId: "trip-1" },
  assign_stop_to_chapter: { stopId: "stop-1", chapterId: null },
  set_surprise: { kind: "STOP", id: "stop-1" },
  reveal_surprise: { kind: "ITEM", id: "item-1" },
  add_thing_to_do: { tripId: "trip-1", title: "Colosseum", category: "SIGHTSEEING" },
  update_thing_to_do: { itemId: "item-1", title: "Forum" },
  delete_thing_to_do: { itemId: "item-1" },
  schedule_thing_to_do: { itemId: "item-1", date: "2027-06-02" },
  unschedule_thing_to_do: { itemId: "item-1" },
  place_idea_at_stop: { itemId: "item-1", stopId: "stop-1" },
  add_marker_to_wishlist: { markerId: "marker-1", tripId: "trip-1" },
  set_vote: { tripId: "trip-1", itemId: "item-1", level: "KEEN" },
  clear_vote: { tripId: "trip-1", itemId: "item-1" },
  set_day_title: { stopId: "stop-1", date: "2027-06-02", title: "Ribeira day" },
  add_note: { tripId: "trip-1", targetType: "ITEM", targetId: "item-1", body: "Book ahead" },
  delete_note: { noteId: "note-1" },
  add_chapter: { tripId: "trip-1", name: "Italy", colour: "rose" },
  update_chapter: { chapterId: "chapter-1", name: "Italia" },
  add_accommodation: { stopId: "stop-1", name: "Hotel", checkIn: "2027-06-01", checkOut: "2027-06-04" },
  update_accommodation: { accommodationId: "acc-1", name: "Hotel B" },
  delete_accommodation: { accommodationId: "acc-1" },
  add_transport: { tripId: "trip-1", mode: "TRAIN", fromStopId: "stop-1", toStopId: "stop-2", depAt: "2027-06-04T09:00", arrAt: "2027-06-04T12:00" },
  update_transport: { transportId: "tr-1", reference: "ICE 512" },
  set_booking_state: { kind: "TRANSPORT", id: "tr-1", state: "TO_BOOK", bookBy: "2027-05-01" },
  delete_transport: { transportId: "tr-1" },
  add_cost: { tripId: "trip-1", costMinor: 1000, currency: "AUD", ownerType: "OTHER", label: "Insurance" },
  update_cost: { costId: "cost-1", label: "Travel insurance" },
  delete_cost: { costId: "cost-1" },
  mark_cost_paid: { costId: "cost-1", paidMinor: 1000, paidAt: "2027-05-01" },
  mark_cost_unpaid: { costId: "cost-1" },
  add_reminder: { tripId: "trip-1", title: "Print tickets", date: "2027-05-30" },
  update_reminder: { reminderId: "rem-1", title: "Print the tickets" },
  delete_reminder: { reminderId: "rem-1" },
  add_checklist_item: { tripId: "trip-1", kind: "PRETRIP", text: "Insurance" },
  add_shopping_item: { tripId: "trip-1", text: "Snacks" },
  update_checklist_item: { itemId: "ci-1", text: "Travel insurance" },
  tick_checklist_item: { itemId: "ci-1", done: true },
  set_need_to_buy: { itemId: "ci-1", buy: "NEEDED" },
  move_checklist_item: { itemId: "ci-1", direction: "up" },
  delete_checklist_item: { itemId: "ci-1" },
  save_packing_template: { tripId: "trip-1", name: "Beach" },
  apply_packing_template: { tripId: "trip-1", templateId: "tpl-1" },
  leave_feedback: { body: "Love the Day view" },
  make_it_fit_apply: { tripId: "trip-1", trims: [{ stopId: "stop-1", nights: 2 }] },
};

const text = (r: Record<string, unknown>) => (r.content as { type: string; text: string }[])[0].text;

describe("every MCP write returns the row it left behind (F6)", () => {
  it("ARGS names exactly the registered write tools (every tool without readOnlyHint)", async () => {
    const c = await connectTestClient();
    const { tools } = await c.listTools();
    const writes = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name).sort();
    expect(writes).toEqual(Object.keys(ARGS).sort());
  });

  it.each(Object.entries(ARGS))("%s returns a row, never {}", async (name, args) => {
    const c = await connectTestClient();
    const r = await c.callTool({ name, arguments: args });
    expect(r.isError, text(r)).toBeFalsy();
    const body = JSON.parse(text(r));
    expect(body).toBeTypeOf("object");
    expect(body).not.toBeNull();
    expect(Object.keys(body).length, `${name} returned ${text(r)}`).toBeGreaterThan(0);
    expect(body).not.toHaveProperty("success");
  });
});
