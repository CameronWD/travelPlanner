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
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { stop: { findUnique: stopFindUnique }, trip: { findUnique: tripFindUnique }, chapter: { findUnique: chapterFindUnique } },
}));
// The rest of the server (reads.ts, trips-read.ts) touches these only when
// their own tools are *called*; stubbing keeps buildMcpServer's full
// registration side-effect-free here without reproducing every property.
vi.mock("@/lib/guards", () => ({ requireTripAccess, requireUser: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));

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

const scheduledStopRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  name: "Rome",
  country: "Italy",
  countryCode: "it",
  lat: 41.9,
  lng: 12.5,
  notes: "old notes",
  nights: null,
  arriveDate: "2026-05-01",
  departDate: "2026-05-04",
  timezone: "Europe/Rome",
  chapterId: null,
  ...overrides,
});

describe("trip and stop write tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    // Real-plan pre-check default: every id names a real-plan row on TRIP_ID.
    stopFindUnique.mockResolvedValue(roughStopRow());
    chapterFindUnique.mockResolvedValue({ tripId: TRIP_ID });
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
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ tripId: "t1", href: "/trips/t1" });
  });

  describe("update_trip (PATCH)", () => {
    it("with only name keeps the other fields", async () => {
      tripFindUnique.mockResolvedValue({
        name: "Old name",
        startDate: "2026-01-01",
        endDate: "2026-01-10",
        hardEndDate: null,
        homeCurrency: "GBP",
      });
      updateTrip.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_trip", arguments: { tripId: TRIP_ID, name: "New name" } });
      expect(updateTrip).toHaveBeenCalledWith(TRIP_ID, {
        name: "New name",
        startDate: "2026-01-01",
        endDate: "2026-01-10",
        hardEndDate: undefined,
        homeCurrency: "GBP",
      });
    });

    it("with only name forwards an existing hardEndDate unchanged and leaves the home base untouched", async () => {
      // "home base" (homeName/roundTrip) is never loaded or forwarded by this
      // tool at all — updateTrip already treats an absent key on those two as
      // "leave unchanged" — so proving they're untouched is proving they're
      // simply not in the object sent to updateTrip.
      tripFindUnique.mockResolvedValue({
        name: "Old name",
        startDate: "2026-01-01",
        endDate: "2026-01-10",
        hardEndDate: "2026-01-15",
        homeCurrency: "GBP",
      });
      updateTrip.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_trip", arguments: { tripId: TRIP_ID, name: "New name" } });
      const call = updateTrip.mock.calls[0];
      expect(call[0]).toBe(TRIP_ID);
      expect(call[1]).toEqual({
        name: "New name",
        startDate: "2026-01-01",
        endDate: "2026-01-10",
        hardEndDate: "2026-01-15",
        homeCurrency: "GBP",
      });
      expect(call[1]).not.toHaveProperty("homeName");
      expect(call[1]).not.toHaveProperty("roundTrip");
    });

    it("checks trip access before using the loaded row", async () => {
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_trip", arguments: { tripId: TRIP_ID, name: "New name" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(tripFindUnique).not.toHaveBeenCalled();
      expect(updateTrip).not.toHaveBeenCalled();
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

  it("add_stop derives a timezone from countryCode when scheduled and timezone is omitted", async () => {
    createStop.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_stop",
      arguments: { tripId: TRIP_ID, name: "Rome", countryCode: "it", arriveDate: "2026-05-01", departDate: "2026-05-04" },
    });
    const call = createStop.mock.calls[0];
    expect((call[1] as { timezone: string }).timezone).toBe("Europe/Rome");
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
    it("on a rough Stop with only notes keeps chapterId and mode", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow());
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, notes: "new notes" } });
      expect(updateStop).toHaveBeenCalledWith(
        STOP_ID,
        expect.objectContaining({ mode: "rough", chapterId: "chap-1", notes: "new notes", nights: 2, name: "Rome" }),
      );
    });

    it("on a scheduled Stop with only name keeps dates and timezone", async () => {
      stopFindUnique.mockResolvedValue(scheduledStopRow());
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, name: "New name" } });
      expect(updateStop).toHaveBeenCalledWith(
        STOP_ID,
        expect.objectContaining({
          mode: "scheduled",
          name: "New name",
          arriveDate: "2026-05-01",
          departDate: "2026-05-04",
          timezone: "Europe/Rome",
        }),
      );
    });

    it("switches a scheduled Stop to rough when nights is given with no dates", async () => {
      stopFindUnique.mockResolvedValue(scheduledStopRow());
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, nights: 5 } });
      expect(updateStop).toHaveBeenCalledWith(STOP_ID, expect.objectContaining({ mode: "rough", nights: 5 }));
    });

    it("switches a rough Stop to scheduled when both dates are given", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow({ timezone: null }));
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, arriveDate: "2026-06-01", departDate: "2026-06-03" } });
      expect(updateStop).toHaveBeenCalledWith(
        STOP_ID,
        expect.objectContaining({ mode: "scheduled", arriveDate: "2026-06-01", departDate: "2026-06-03", timezone: "Europe/Rome" }),
      );
    });

    it("returns a tool error and does not call updateStop when a rough patch ends up with no nights", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow({ nights: null }));
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, notes: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("nights");
      expect(updateStop).not.toHaveBeenCalled();
    });

    it("a lone arriveDate on a rough Stop is a tool error, not a silent no-op", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, arriveDate: "2026-06-01" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Pass both arriveDate and departDate");
      expect(updateStop).not.toHaveBeenCalled();
    });

    it("a lone departDate on a rough Stop is a tool error, not a silent no-op", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, departDate: "2026-06-03" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Pass both arriveDate and departDate");
      expect(updateStop).not.toHaveBeenCalled();
    });

    it("a lone arriveDate on a scheduled Stop merges with the current departDate", async () => {
      stopFindUnique.mockResolvedValue(scheduledStopRow());
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, arriveDate: "2026-05-02" } });
      expect(updateStop).toHaveBeenCalledWith(
        STOP_ID,
        expect.objectContaining({ mode: "scheduled", arriveDate: "2026-05-02", departDate: "2026-05-04", timezone: "Europe/Rome" }),
      );
    });

    it("a lone departDate on a scheduled Stop merges with the current arriveDate", async () => {
      stopFindUnique.mockResolvedValue(scheduledStopRow());
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, departDate: "2026-05-06" } });
      expect(updateStop).toHaveBeenCalledWith(
        STOP_ID,
        expect.objectContaining({ mode: "scheduled", arriveDate: "2026-05-01", departDate: "2026-05-06", timezone: "Europe/Rome" }),
      );
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

  it("surfaces an action's field errors as a readable tool error, not success", async () => {
    stopFindUnique.mockResolvedValue(roughStopRow());
    updateStop.mockResolvedValue({ success: false, errors: { name: ["Required"] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, notes: "x" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain("name: Required");
  });
  describe("add_stop and update_stop never drop an accepted field", () => {
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

    it("update_stop with a timezone on a rough Stop is a tool error", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, timezone: "Europe/Rome" } });
      expect(r.isError).toBe(true);
      expect(errText(r)).toContain("timezone");
      expect(updateStop).not.toHaveBeenCalled();
    });

    it("update_stop with nights and a timezone that makes a scheduled Stop rough is a tool error", async () => {
      stopFindUnique.mockResolvedValue(scheduledStopRow());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, nights: 4, timezone: "Europe/Rome" } });
      expect(r.isError).toBe(true);
      expect(errText(r)).toContain("timezone");
      expect(updateStop).not.toHaveBeenCalled();
    });

    it("update_stop with a timezone on a scheduled Stop is accepted", async () => {
      stopFindUnique.mockResolvedValue(scheduledStopRow());
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, timezone: "Europe/Paris" } });
      expect(r.isError).toBeFalsy();
      expect(updateStop).toHaveBeenCalledWith(STOP_ID, expect.objectContaining({ mode: "scheduled", timezone: "Europe/Paris" }));
    });

    it("update_stop with nights that don't match both supplied dates is a tool error", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow());
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "update_stop",
        arguments: { stopId: STOP_ID, nights: 7, arriveDate: "2026-06-01", departDate: "2026-06-03" },
      });
      expect(r.isError).toBe(true);
      expect(errText(r)).toContain("nights");
      expect(updateStop).not.toHaveBeenCalled();
    });

    it("update_stop with nights that match both supplied dates is accepted", async () => {
      stopFindUnique.mockResolvedValue(roughStopRow());
      updateStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "update_stop",
        arguments: { stopId: STOP_ID, nights: 2, arriveDate: "2026-06-01", departDate: "2026-06-03" },
      });
      expect(r.isError).toBeFalsy();
      expect(updateStop).toHaveBeenCalledWith(STOP_ID, expect.objectContaining({ mode: "scheduled", arriveDate: "2026-06-01" }));
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
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ pinned: true });
    });

    it("does not toggle when the Stop is already in the requested state", async () => {
      stopFindUnique.mockResolvedValue({ tripId: TRIP_ID, pinned: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "set_stop_pinned", arguments: { stopId: STOP_ID, pinned: true } });
      expect(r.isError).toBeFalsy();
      expect(toggleStopPin).not.toHaveBeenCalled();
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ pinned: true });
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
});
