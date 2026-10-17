import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTrip,
  updateTrip,
  setTripHardEndDate,
  createStop,
  updateStop,
  deleteStop,
  previewStopDeletion,
  moveStop,
  setStopDates,
  firmUpTrip,
  toggleStopPin,
  makeStopRough,
  setStopNotes,
  setStopNights,
  assignStopToChapter,
  requireTripAccess,
  stopFindUnique,
  tripFindUnique,
  chapterFindUnique,
  itemFindUnique,
  setSurprise,
  revealSurprise,
  loadStopForMcp,
  loadItemForMcp,
  loadTripSummaryForMcp,
  stopAndShifted,
  trackerChanged,
  trackerStart,
} = vi.hoisted(() => ({
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  setTripHardEndDate: vi.fn(),
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
  assignStopToChapter: vi.fn(),
  requireTripAccess: vi.fn(),
  stopFindUnique: vi.fn(),
  tripFindUnique: vi.fn(),
  chapterFindUnique: vi.fn(),
  itemFindUnique: vi.fn(),
  setSurprise: vi.fn(),
  revealSurprise: vi.fn(),
  loadStopForMcp: vi.fn(),
  loadItemForMcp: vi.fn(),
  loadTripSummaryForMcp: vi.fn(),
  stopAndShifted: vi.fn(),
  trackerChanged: vi.fn(),
  trackerStart: vi.fn(),
}));

vi.mock("@/server/actions/trips", () => ({ createTrip, updateTrip, setTripHardEndDate }));
vi.mock("@/server/actions/stops", () => ({
  createStop,
  updateStop,
  deleteStop,
  previewStopDeletion,
  moveStop,
  setStopDates,
  firmUpTrip,
  toggleStopPin,
  makeStopRough,
  setStopNotes,
  setStopNights,
}));
vi.mock("@/server/actions/chapters", () => ({ assignStopToChapter }));
vi.mock("@/server/actions/surprise", () => ({ setSurprise, revealSurprise }));
vi.mock("../reads/entities", () => ({ loadStopForMcp, loadItemForMcp, loadTripSummaryForMcp }));
vi.mock("../reads/stop-changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../reads/stop-changes")>()),
  stopTracker: () => ({ start: trackerStart, stopAndShifted, changed: trackerChanged }),
}));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    stop: { findUnique: stopFindUnique },
    trip: { findUnique: tripFindUnique },
    chapter: { findUnique: chapterFindUnique },
    item: { findUnique: itemFindUnique },
  },
}));
// The rest of the server (reads.ts, trips-read.ts) touches these only when
// their own tools are *called*; stubbing keeps buildMcpServer's full
// registration side-effect-free here without reproducing every property.
//
// requireRealPlanRow (lib/mcp/real-plan.ts) is now a thin wrapper over
// requireRowAccess (lib/guards.ts, card C); this mock stands in for that
// guard exactly as the pre-Task-5 real-plan.ts used to do it directly —
// same db.<kind>.findUnique call shape (so the explicit
// stopFindUnique/itemFindUnique assertions below keep working unchanged),
// same requireTripAccess, and the real (unmocked) requireOutsideSurprise —
// this file's own "set_surprise and reveal_surprise" tests rely on that
// running for real against the surprise columns stopFindUnique/
// itemFindUnique already return.
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async (kind: string, id: string) => {
    const args = { where: { id, forkId: null }, select: { tripId: true } };
    let row: Record<string, unknown> | null = null;
    if (kind === "stop") row = await stopFindUnique(args);
    else if (kind === "item") row = await itemFindUnique(args);
    else if (kind === "chapter") row = await chapterFindUnique(args);
    if (!row) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const { user, membership } = await requireTripAccess((row as { tripId: string }).tripId);
    let surpriseOf = null;
    if (kind === "stop" || kind === "item") {
      const { requireOutsideSurprise } = await import("@/lib/surprise-guard");
      surpriseOf = await requireOutsideSurprise(user.id, kind === "stop" ? { stopId: id } : { itemId: id });
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
const STOP_ID = "stop-1";
const notFoundErr = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

const roughStopRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  name: "Rome",
  country: "Italy",
  countryCode: "it",
  lat: 41.9,
  lng: 12.5,
  notes: "old notes",
  nights: 2,
  arriveDate: null,
  departDate: null,
  timezone: null,
  chapterId: "chap-1",
  ...overrides,
});

describe("trip and stop write tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    // Real-plan pre-check default: every id names a real-plan row on TRIP_ID.
    stopFindUnique.mockResolvedValue(roughStopRow());
    chapterFindUnique.mockResolvedValue({ tripId: TRIP_ID });
    itemFindUnique.mockResolvedValue({ tripId: TRIP_ID, stopId: null, date: null, surprisePlannerId: null, surpriseForIds: null, surpriseRevealedAt: null });
    loadStopForMcp.mockImplementation(async (id: string) => ({ id, name: "Rome" }));
    loadItemForMcp.mockImplementation(async (id: string) => ({ id, title: "Dinner" }));
    loadTripSummaryForMcp.mockImplementation(async (id: string) => ({ id, name: "Japan" }));
    trackerStart.mockResolvedValue(undefined);
    stopAndShifted.mockImplementation(async (id: string) => ({ stop: { id }, shifted: [] }));
    trackerChanged.mockResolvedValue([{ id: STOP_ID }]);
  });

  it("registers every write tool, none accepting a forkId", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("toggle_stop_pin");
    expect(names).toEqual(
      expect.arrayContaining([
        "create_trip",
        "update_trip",
        "set_hard_end_date",
        "add_stop",
        "update_stop",
        "delete_stop",
        "move_stop",
        "set_stop_nights",
        "set_stop_dates",
        "set_stop_pinned",
        "make_stop_rough",
        "set_stop_notes",
        "firm_up_trip",
        "assign_stop_to_chapter",
        "set_surprise",
        "reveal_surprise",
      ]),
    );
    for (const t of tools) {
      const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("forkId");
    }
  });

  it("update_trip schema has no roughMonth", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const updateTripTool = tools.find((t) => t.name === "update_trip")!;
    const props = (updateTripTool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).not.toContain("roughMonth");
  });

  it("create_trip calls createTrip with a single argument, no cover files", async () => {
    createTrip.mockResolvedValue({ success: true, tripId: "t1", href: "/trips/t1" });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "create_trip", arguments: { name: "Japan", homeCurrency: "USD" } });
    expect(r.isError).toBeFalsy();
    expect(createTrip).toHaveBeenCalledTimes(1);
    expect(createTrip.mock.calls[0]).toHaveLength(1);
    expect(createTrip).toHaveBeenCalledWith(expect.objectContaining({ name: "Japan", homeCurrency: "USD" }));
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ trip: { id: "t1", name: "Japan" } });
  });

  it("create_trip forwards homeTimezone and describes the default", async () => {
    createTrip.mockResolvedValue({ success: true, tripId: "t1", href: "/trips/t1" });
    const c = await connectTestClient();
    const tool = (await c.listTools()).tools.find((t) => t.name === "create_trip")!;
    const props = (tool.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
    expect(Object.keys(props)).toContain("homeTimezone");
    expect(props.homeTimezone.description).toMatch(/where the Home base is/i);
    await c.callTool({ name: "create_trip", arguments: { name: "Oz", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: "Australia/Brisbane" } });
    expect(createTrip).toHaveBeenCalledWith(expect.objectContaining({ homeName: "Brisbane", homeTimezone: "Australia/Brisbane" }));
  });

  it("create_trip surfaces createTrip's error for an invalid homeTimezone", async () => {
    createTrip.mockResolvedValue({ success: false, errors: { homeTimezone: ["Pick a timezone from the list."] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "create_trip", arguments: { name: "Oz", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: "Mars/Olympus" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain("Pick a timezone from the list.");
  });

  describe("update_trip (PATCH)", () => {
    it("says a Home timezone change keeps Home-end times as local times (F5)", async () => {
      const c = await connectTestClient();
      const tool = (await c.listTools()).tools.find((t) => t.name === "update_trip")!;
      expect(tool.description).toMatch(/homeTimezone/);
      expect(tool.description).toMatch(/keeps? .*local time/i);
      const tz = (tool.inputSchema as { properties: Record<string, { description?: string }> }).properties.homeTimezone;
      expect(tz.description).toMatch(/local time/i);
    });

    it("forwards only the fields passed", async () => {
      updateTrip.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_trip", arguments: { tripId: TRIP_ID, name: "New name" } });
      expect(updateTrip).toHaveBeenCalledWith(TRIP_ID, { name: "New name" });
      expect(tripFindUnique).not.toHaveBeenCalled();
    });

    it("with homeTimezone forwards it to updateTrip", async () => {
      updateTrip.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({
        name: "update_trip",
        arguments: { tripId: TRIP_ID, homeTimezone: "Australia/Brisbane" },
      });
      expect(updateTrip).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ homeTimezone: "Australia/Brisbane" }),
      );
    });

    it("surfaces updateTrip's validation error for an invalid homeTimezone", async () => {
      updateTrip.mockResolvedValue({
        success: false,
        errors: { homeTimezone: ["Pick a timezone from the list."] },
      });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "update_trip",
        arguments: { tripId: TRIP_ID, homeTimezone: "Mars/Olympus" },
      });
      expect(updateTrip).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ homeTimezone: "Mars/Olympus" }),
      );
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Pick a timezone from the list.");
    });
  });

  it("set_hard_end_date accepts a null hardEndDate", async () => {
    setTripHardEndDate.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "set_hard_end_date", arguments: { tripId: TRIP_ID, hardEndDate: null } });
    expect(setTripHardEndDate).toHaveBeenCalledWith(TRIP_ID, null);
  });

  it("delete_stop description is permanent, not restorable", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const deleteStopTool = tools.find((t) => t.name === "delete_stop")!;
    expect(deleteStopTool.description?.toLowerCase()).toContain("permanent");
    expect(deleteStopTool.description?.toLowerCase()).not.toContain("restore");
  });

  it("add_stop with both dates builds a scheduled StopInput and never passes a forkId", async () => {
    createStop.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_stop",
      arguments: {
        tripId: TRIP_ID,
        name: "Rome",
        countryCode: "it",
        arriveDate: "2026-05-01",
        departDate: "2026-05-04",
        timezone: "Europe/Rome",
      },
    });
    expect(createStop).toHaveBeenCalledTimes(1);
    const call = createStop.mock.calls[0];
    expect(call).toHaveLength(4);
    expect(call[0]).toBe(TRIP_ID);
    expect(call[1]).toEqual(
      expect.objectContaining({
        mode: "scheduled",
        arriveDate: "2026-05-01",
        departDate: "2026-05-04",
        timezone: "Europe/Rome",
      }),
    );
    expect(call[2]).toBeUndefined();
    expect(call[3]).toBeNull();
  });

  it("add_stop without dates builds a rough StopInput", async () => {
    createStop.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_stop",
      arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", nights: 3 },
    });
    const call = createStop.mock.calls[0];
    expect(call[1]).toEqual(expect.objectContaining({ mode: "rough", nights: 3 }));
    expect(call[2]).toBeUndefined();
  });

  it("add_stop leaves an omitted timezone unchosen, so createStop takes it from the place's point (F3)", async () => {
    createStop.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_stop",
      arguments: { tripId: TRIP_ID, name: "Brisbane", countryCode: "au", arriveDate: "2026-05-01", departDate: "2026-05-04" },
    });
    const call = createStop.mock.calls[0];
    expect((call[1] as { timezone: string }).timezone).toBe("UTC");
  });

  it("add_stop passes afterStopId through as the 4th argument", async () => {
    createStop.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_stop",
      arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", nights: 2, afterStopId: "s0" },
    });
    expect(createStop.mock.calls[0][3]).toBe("s0");
  });

  it("add_stop with neither nights nor dates is a tool error, not a call with nights: undefined", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "add_stop", arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain("nights");
    expect(createStop).not.toHaveBeenCalled();
  });

  describe("update_stop (PATCH)", () => {
    it("checks the Stop is real-plan, then forwards only the fields passed", async () => {
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, notes: "new notes" } });
      expect(updateStop).toHaveBeenCalledWith(STOP_ID, { notes: "new notes" });
    });

    it("a non-member's stop id returns NOT_FOUND_TEXT and does not call updateStop", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow());
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, notes: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateStop).not.toHaveBeenCalled();
    });

    it("a made-up stop id returns the same NOT_FOUND_TEXT", async () => {
      stopFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: "nope", notes: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateStop).not.toHaveBeenCalled();
    });
  });

  it("delete_stop previews before deleting, and returns both", async () => {
    const order: string[] = [];
    previewStopDeletion.mockImplementation(async () => {
      order.push("preview");
      return { success: true, preview: { accommodations: [], unpaidCosts: [], attachmentCount: 0, noteCount: 0 } };
    });
    deleteStop.mockImplementation(async () => {
      order.push("delete");
      return { success: true };
    });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "delete_stop", arguments: { stopId: STOP_ID } });
    expect(order).toEqual(["preview", "delete"]);
    expect(r.isError).toBeFalsy();
    const body = JSON.parse((r.content as { text: string }[])[0].text);
    expect(body.preview).toEqual({ accommodations: [], unpaidCosts: [], attachmentCount: 0, noteCount: 0 });
    expect(body.deleted).toBe(STOP_ID);
  });

  it("delete_stop does not delete when the preview itself fails", async () => {
    previewStopDeletion.mockResolvedValue({
      success: false,
      errors: { _: ["Only the trip owner can preview a stop deletion."] },
    });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "delete_stop", arguments: { stopId: STOP_ID } });
    expect(r.isError).toBe(true);
    expect(deleteStop).not.toHaveBeenCalled();
  });

  it("move_stop, set_stop_nights, set_stop_dates, make_stop_rough, set_stop_notes, firm_up_trip and assign_stop_to_chapter call their actions", async () => {
    moveStop.mockResolvedValue({ success: true });
    setStopNights.mockResolvedValue({ success: true });
    setStopDates.mockResolvedValue({ success: true });
    makeStopRough.mockResolvedValue({ success: true });
    setStopNotes.mockResolvedValue({ success: true });
    firmUpTrip.mockResolvedValue({ success: true });
    assignStopToChapter.mockResolvedValue({ success: true });

    const c = await connectTestClient();

    await c.callTool({ name: "move_stop", arguments: { stopId: STOP_ID, direction: "up" } });
    expect(moveStop).toHaveBeenCalledWith(STOP_ID, "up");

    await c.callTool({ name: "set_stop_nights", arguments: { stopId: STOP_ID, nights: 5 } });
    expect(setStopNights).toHaveBeenCalledWith(STOP_ID, 5);

    await c.callTool({ name: "set_stop_dates", arguments: { stopId: STOP_ID, arriveDate: "2026-05-01", departDate: "2026-05-04" } });
    expect(setStopDates).toHaveBeenCalledWith(STOP_ID, { arriveDate: "2026-05-01", departDate: "2026-05-04" });

    await c.callTool({ name: "make_stop_rough", arguments: { stopId: STOP_ID } });
    expect(makeStopRough).toHaveBeenCalledWith(STOP_ID);

    await c.callTool({ name: "set_stop_notes", arguments: { stopId: STOP_ID, notes: "Great view" } });
    expect(setStopNotes).toHaveBeenCalledWith(STOP_ID, "Great view");

    await c.callTool({ name: "firm_up_trip", arguments: { tripId: TRIP_ID } });
    expect(firmUpTrip).toHaveBeenCalledWith(TRIP_ID, undefined);

    await c.callTool({ name: "assign_stop_to_chapter", arguments: { stopId: STOP_ID, chapterId: null } });
    expect(assignStopToChapter).toHaveBeenCalledWith(STOP_ID, null);
  });

  it("set_stop_dates refuses a date that matches the format but is not a calendar date, and never calls the action", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({
      name: "set_stop_dates",
      arguments: { stopId: STOP_ID, arriveDate: "2026-02-30", departDate: "2026-03-04" },
    });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toMatch(/real calendar date/);
    expect(setStopDates).not.toHaveBeenCalled();
  });

  it("surfaces an action's field errors as a readable tool error, not success", async () => {
    stopFindUnique.mockResolvedValue(roughStopRow());
    updateStop.mockResolvedValue({ success: false, errors: { name: ["Required"] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, notes: "x" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain("name: Required");
  });
  describe("add_stop never drops an accepted field", () => {
    const LONE = "Pass both arriveDate and departDate to schedule a Stop.";
    const errText = (r: Awaited<ReturnType<Awaited<ReturnType<typeof connectTestClient>>["callTool"]>>) =>
      (r.content as { text: string }[])[0].text;

    it("add_stop with a lone arriveDate is a tool error", async () => {
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "add_stop",
        arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", nights: 2, arriveDate: "2026-05-01" },
      });
      expect(r.isError).toBe(true);
      expect(errText(r)).toContain(LONE);
      expect(createStop).not.toHaveBeenCalled();
    });

    it("add_stop with a lone departDate is a tool error, not a misleading nights error", async () => {
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "add_stop",
        arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", departDate: "2026-05-04" },
      });
      expect(r.isError).toBe(true);
      expect(errText(r)).toContain(LONE);
      expect(createStop).not.toHaveBeenCalled();
    });

    it("add_stop with a timezone for a rough Stop is a tool error", async () => {
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "add_stop",
        arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", nights: 2, timezone: "Europe/Rome" },
      });
      expect(r.isError).toBe(true);
      expect(errText(r)).toContain("timezone");
      expect(createStop).not.toHaveBeenCalled();
    });

    it("add_stop with nights that don't match the dates is a tool error", async () => {
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "add_stop",
        arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", nights: 5, arriveDate: "2026-05-01", departDate: "2026-05-04" },
      });
      expect(r.isError).toBe(true);
      expect(errText(r)).toContain("nights");
      expect(createStop).not.toHaveBeenCalled();
    });

    it("add_stop with nights that match the dates is accepted", async () => {
      createStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "add_stop",
        arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", nights: 3, arriveDate: "2026-05-01", departDate: "2026-05-04" },
      });
      expect(r.isError).toBeFalsy();
      expect(createStop.mock.calls[0][1]).toEqual(expect.objectContaining({ mode: "scheduled", arriveDate: "2026-05-01", departDate: "2026-05-04" }));
    });
  });

  describe("set_stop_pinned", () => {
    it("toggles when the requested state differs, and returns the new state", async () => {
      stopFindUnique.mockResolvedValue({ tripId: TRIP_ID, pinned: false });
      toggleStopPin.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_stop_pinned", arguments: { stopId: STOP_ID, pinned: true } });
      expect(r.isError).toBeFalsy();
      expect(toggleStopPin).toHaveBeenCalledWith(STOP_ID);
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ stop: { id: STOP_ID, name: "Rome" } });
    });

    it("does not toggle when the Stop is already in the requested state", async () => {
      stopFindUnique.mockResolvedValue({ tripId: TRIP_ID, pinned: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_stop_pinned", arguments: { stopId: STOP_ID, pinned: true } });
      expect(r.isError).toBeFalsy();
      expect(toggleStopPin).not.toHaveBeenCalled();
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ stop: { id: STOP_ID, name: "Rome" } });
    });

    it("surfaces the action's error, e.g. pinning a rough Stop", async () => {
      stopFindUnique.mockResolvedValue({ tripId: TRIP_ID, pinned: false });
      toggleStopPin.mockResolvedValue({ success: false, errors: { pinned: ["Only a stop with dates can be pinned."] } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_stop_pinned", arguments: { stopId: STOP_ID, pinned: true } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Only a stop with dates can be pinned.");
    });

    it("a non-member's stop id is NOT_FOUND_TEXT and nothing is toggled", async () => {
      stopFindUnique.mockResolvedValue({ tripId: TRIP_ID, pinned: false });
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_stop_pinned", arguments: { stopId: STOP_ID, pinned: true } });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(toggleStopPin).not.toHaveBeenCalled();
    });
  });

  describe("real plan only: a Fork's row reads as not found", () => {
    // A Fork-owned row exists, but only a query not scoped to forkId: null finds it.
    const forkOnly = (row: Record<string, unknown>) => ({ where }: { where: { forkId?: unknown } }) =>
      Promise.resolve(where.forkId === null ? null : row);

    const cases: [string, Record<string, unknown>, () => unknown][] = [
      ["update_stop", { stopId: "fork-stop", notes: "x" }, () => updateStop],
      ["delete_stop", { stopId: "fork-stop" }, () => deleteStop],
      ["move_stop", { stopId: "fork-stop", direction: "up" }, () => moveStop],
      ["set_stop_nights", { stopId: "fork-stop", nights: 2 }, () => setStopNights],
      ["set_stop_dates", { stopId: "fork-stop", arriveDate: "2026-05-01", departDate: "2026-05-04" }, () => setStopDates],
      ["set_stop_pinned", { stopId: "fork-stop", pinned: true }, () => toggleStopPin],
      ["make_stop_rough", { stopId: "fork-stop" }, () => makeStopRough],
      ["set_stop_notes", { stopId: "fork-stop", notes: "x" }, () => setStopNotes],
      ["assign_stop_to_chapter", { stopId: "fork-stop", chapterId: null }, () => assignStopToChapter],
      ["add_stop", { tripId: TRIP_ID, afterStopId: "fork-stop", name: "Rome", countryCode: "it", nights: 2 }, () => createStop],
    ];

    for (const [tool, args, action] of cases) {
      it(`${tool} with a Fork's stop id is NOT_FOUND_TEXT and calls no action`, async () => {
        stopFindUnique.mockImplementation(forkOnly(roughStopRow({ pinned: false })));
        const c = await connectTestClient();
        const r = await c.callTool({ name: tool, arguments: args });
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
        expect(action()).not.toHaveBeenCalled();
        expect(previewStopDeletion).not.toHaveBeenCalled();
      });
    }

    it("assign_stop_to_chapter with a Fork's chapter id is NOT_FOUND_TEXT", async () => {
      chapterFindUnique.mockImplementation(forkOnly({ tripId: TRIP_ID }));
      const c = await connectTestClient();
      const r = await c.callTool({ name: "assign_stop_to_chapter", arguments: { stopId: STOP_ID, chapterId: "fork-chap" } });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(assignStopToChapter).not.toHaveBeenCalled();
    });

    it("a non-member's stop id on a pass-through tool is NOT_FOUND_TEXT", async () => {
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "move_stop", arguments: { stopId: STOP_ID, direction: "up" } });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(moveStop).not.toHaveBeenCalled();
    });
  });

  describe("set_surprise and reveal_surprise (Surprise, ADR 0051)", () => {
    it("set_surprise checks the real-plan Stop, then calls setSurprise with the chosen Travellers", async () => {
      setSurprise.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_surprise", arguments: { kind: "STOP", id: STOP_ID, forUserIds: ["u-sam"] } });
      expect(r.isError).toBeFalsy();
      expect(stopFindUnique).toHaveBeenCalledWith({ where: { id: STOP_ID, forkId: null }, select: { tripId: true } });
      expect(setSurprise).toHaveBeenCalledWith({ kind: "STOP", id: STOP_ID, forIds: ["u-sam"] });
      expect(stopFindUnique.mock.invocationCallOrder[0]!).toBeLessThan(setSurprise.mock.invocationCallOrder[0]!);
    });

    it("set_surprise on a thing to do checks the real-plan Item and leaves who is surprised to the default", async () => {
      setSurprise.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "set_surprise", arguments: { kind: "ITEM", id: "item-1" } });
      expect(itemFindUnique).toHaveBeenCalledWith({ where: { id: "item-1", forkId: null }, select: { tripId: true } });
      expect(setSurprise).toHaveBeenCalledWith({ kind: "ITEM", id: "item-1", forIds: undefined });
    });

    it("reveal_surprise checks the real-plan row, then calls revealSurprise", async () => {
      revealSurprise.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "reveal_surprise", arguments: { kind: "ITEM", id: "item-1" } });
      expect(r.isError).toBeFalsy();
      expect(itemFindUnique).toHaveBeenCalledWith({ where: { id: "item-1", forkId: null }, select: { tripId: true } });
      expect(revealSurprise).toHaveBeenCalledWith({ kind: "ITEM", id: "item-1" });
    });

    it("a row on a What-if plan (or not there) reads as not found and neither action runs", async () => {
      stopFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const set = await c.callTool({ name: "set_surprise", arguments: { kind: "STOP", id: STOP_ID } });
      const reveal = await c.callTool({ name: "reveal_surprise", arguments: { kind: "STOP", id: STOP_ID } });
      for (const r of [set, reveal]) {
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      }
      expect(setSurprise).not.toHaveBeenCalled();
      expect(revealSurprise).not.toHaveBeenCalled();
    });

    // Live Surprise columns planned by u-cam for u1, the acting Traveller:
    // the real guard beneath requireRealPlanRow refuses u1 with notFound().
    const surprisedBy = { surprisePlannerId: "u-cam", surpriseForIds: JSON.stringify(["u1"]), surpriseRevealedAt: null };

    it("set_surprise on a Stop the acting Traveller is surprised by reads as not found and setSurprise never runs", async () => {
      stopFindUnique.mockResolvedValue({ ...roughStopRow(), id: STOP_ID, ...surprisedBy });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_surprise", arguments: { kind: "STOP", id: STOP_ID, forUserIds: ["u-x"] } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(setSurprise).not.toHaveBeenCalled();
    });

    it("reveal_surprise on an item the acting Traveller is surprised by reads as not found and revealSurprise never runs", async () => {
      itemFindUnique.mockResolvedValue({ id: "item-1", tripId: TRIP_ID, stopId: null, date: null, stop: null, ...surprisedBy });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "reveal_surprise", arguments: { kind: "ITEM", id: "item-1" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(revealSurprise).not.toHaveBeenCalled();
    });

    it("passes the action's refusal through as a tool error", async () => {
      revealSurprise.mockResolvedValue({ success: false, errors: { _: ["Only the planner can reveal this surprise."] } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "reveal_surprise", arguments: { kind: "STOP", id: STOP_ID } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe("Couldn't do that: Only the planner can reveal this surprise.");
    });
  });

  describe("writes return the row (F6)", () => {
    const body = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

    it("set_stop_dates returns the Stop, the Stops it pushed and the action's conflicts, not { success }", async () => {
      stopFindUnique.mockResolvedValue({ tripId: TRIP_ID });
      setStopDates.mockResolvedValue({ success: true, conflicts: [{ stopId: "prev" }], changed: [{ id: "next" }], payload: { big: true } });
      stopAndShifted.mockResolvedValue({ stop: { id: STOP_ID }, shifted: [{ id: "next" }] });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_stop_dates", arguments: { stopId: STOP_ID, arriveDate: "2027-06-01", departDate: "2027-06-04" } });
      expect(trackerStart).toHaveBeenCalledWith(TRIP_ID);
      expect(trackerStart.mock.invocationCallOrder[0]).toBeLessThan(setStopDates.mock.invocationCallOrder[0]);
      expect(body(r)).toEqual({ stop: { id: STOP_ID }, shifted: [{ id: "next" }], conflicts: [{ stopId: "prev" }] });
    });

    it("the tracker starts only after the tool's own access check", async () => {
      stopFindUnique.mockResolvedValue({ tripId: TRIP_ID });
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, name: "X" } });
      expect(requireTripAccess.mock.invocationCallOrder[0]).toBeLessThan(trackerStart.mock.invocationCallOrder[0]);
    });

    it("add_stop checks Trip access before the snapshot, and reads back the new Stop", async () => {
      createStop.mockResolvedValue({ success: true, id: "new-stop" });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "add_stop", arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", nights: 2 } });
      expect(requireTripAccess).toHaveBeenCalledWith(TRIP_ID);
      expect(requireTripAccess.mock.invocationCallOrder[0]).toBeLessThan(trackerStart.mock.invocationCallOrder[0]);
      expect(trackerStart.mock.invocationCallOrder[0]).toBeLessThan(createStop.mock.invocationCallOrder[0]);
      expect(body(r)).toEqual({ stop: { id: "new-stop" }, shifted: [] });
    });

    it("an add_stop refused by its input checks takes no snapshot", async () => {
      const c = await connectTestClient();
      const r = await c.callTool({ name: "add_stop", arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it" } });
      expect(r.isError).toBe(true);
      expect(trackerStart).not.toHaveBeenCalled();
    });

    it("a refused write takes no snapshot and reads nothing back", async () => {
      stopFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: "fork-stop", name: "X" } });
      expect(r.isError).toBe(true);
      expect(trackerStart).not.toHaveBeenCalled();
      expect(stopAndShifted).not.toHaveBeenCalled();
    });

    it("firm_up_trip returns every Stop it dated", async () => {
      requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
      firmUpTrip.mockResolvedValue({ success: true, conflicts: [] });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "firm_up_trip", arguments: { tripId: TRIP_ID } }))).toEqual({ stops: [{ id: STOP_ID }] });
      expect(requireTripAccess.mock.invocationCallOrder[0]).toBeLessThan(trackerStart.mock.invocationCallOrder[0]);
    });

    it("set_surprise on an ITEM returns the Item as it now stands", async () => {
      itemFindUnique.mockResolvedValue({ tripId: TRIP_ID });
      setSurprise.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "set_surprise", arguments: { kind: "ITEM", id: "item-1" } }))).toEqual({ item: { id: "item-1", title: "Dinner" } });
    });

    it("update_trip returns the Trip summary", async () => {
      updateTrip.mockResolvedValue({ success: true, slug: "japan" });
      const c = await connectTestClient();
      expect(body(await c.callTool({ name: "update_trip", arguments: { tripId: TRIP_ID, name: "Japan" } }))).toEqual({ trip: { id: TRIP_ID, name: "Japan" } });
    });
  });
});
