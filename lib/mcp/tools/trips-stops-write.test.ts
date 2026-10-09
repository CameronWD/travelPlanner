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
// The rest of the server (reads.ts, trips-read.ts) touches these only when
// their own tools are *called*; stubbing keeps buildMcpServer's full
// registration side-effect-free here without reproducing every property.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn(), requireTripAccess: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));

import { connectTestClient } from "../test-client";

const TRIP_ID = "trip-1";
const STOP_ID = "stop-1";

describe("trip and stop write tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers every write tool, none accepting a forkId", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const names = tools.map((t) => t.name);
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
        "toggle_stop_pin",
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

  it("update_trip calls updateTrip(tripId, input)", async () => {
    updateTrip.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "update_trip", arguments: { tripId: TRIP_ID, name: "Japan", homeCurrency: "USD" } });
    expect(updateTrip).toHaveBeenCalledWith(TRIP_ID, expect.objectContaining({ name: "Japan", homeCurrency: "USD" }));
  });

  it("set_hard_end_date accepts a null hardEndDate", async () => {
    setTripHardEndDate.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "set_hard_end_date", arguments: { tripId: TRIP_ID, hardEndDate: null } });
    expect(setTripHardEndDate).toHaveBeenCalledWith(TRIP_ID, null);
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

  it("update_stop calls updateStop(stopId, input)", async () => {
    updateStop.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, name: "Rome", countryCode: "it", nights: 2 } });
    expect(updateStop).toHaveBeenCalledWith(STOP_ID, expect.objectContaining({ mode: "rough", name: "Rome", nights: 2 }));
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

  it("move_stop, set_stop_nights, set_stop_dates, toggle_stop_pin, make_stop_rough, set_stop_notes, firm_up_trip and assign_stop_to_chapter call their actions", async () => {
    moveStop.mockResolvedValue({ success: true });
    setStopNights.mockResolvedValue({ success: true });
    setStopDates.mockResolvedValue({ success: true });
    toggleStopPin.mockResolvedValue({ success: true });
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

    await c.callTool({ name: "toggle_stop_pin", arguments: { stopId: STOP_ID } });
    expect(toggleStopPin).toHaveBeenCalledWith(STOP_ID);

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
    updateStop.mockResolvedValue({ success: false, errors: { name: ["Required"] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "update_stop", arguments: { stopId: STOP_ID, name: "Rome", countryCode: "it", nights: 2 } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain("name: Required");
  });
});
