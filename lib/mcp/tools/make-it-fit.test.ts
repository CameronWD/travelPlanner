import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, stopFindMany, tripFindUnique, getTripProjection, setStopNights, deleteStop } = vi.hoisted(
  () => ({
    requireTripAccess: vi.fn(),
    stopFindMany: vi.fn(),
    tripFindUnique: vi.fn(),
    getTripProjection: vi.fn(),
    setStopNights: vi.fn(),
    deleteStop: vi.fn(),
  }),
);

vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/db", () => ({ db: { stop: { findMany: stopFindMany }, trip: { findUnique: tripFindUnique } } }));
vi.mock("@/server/actions/stops", () => ({ getTripProjection, setStopNights, deleteStop }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";

const TRIP_ID = "trip-1";
const notFoundErr = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

const fitStop = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "stop-1",
  name: "Rome",
  arriveDate: "2026-05-01",
  departDate: "2026-05-04",
  nights: null,
  pinned: false,
  sortOrder: 0,
  ...overrides,
});

describe("make-it-fit tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    tripFindUnique.mockResolvedValue({ startDate: "2026-05-01" });
  });

  it("registers both tools, read and write", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["make_it_fit_preview", "make_it_fit_apply"]));
    const apply = tools.find((t) => t.name === "make_it_fit_apply")!;
    expect(apply.annotations).toMatchObject({ destructiveHint: true });
    expect(apply.description).toContain("Confirm with the person before calling this.");
  });

  describe("make_it_fit_preview", () => {
    it("returns { fits: true } when the plan is not over", async () => {
      stopFindMany.mockResolvedValue([fitStop()]);
      getTripProjection.mockResolvedValue({
        projectedEnd: "2026-05-04",
        hardEndDate: "2026-05-10",
        deadline: { kind: "hard-end", date: "2026-05-10" },
      });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "make_it_fit_preview", arguments: { tripId: TRIP_ID } });
      expect(r.isError).toBeFalsy();
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ fits: true });
    });

    it("returns a trim plan and drop candidates when over the deadline", async () => {
      const stops = [
        fitStop({ id: "stop-1", name: "Rome", arriveDate: "2026-05-01", departDate: "2026-05-06", pinned: false, sortOrder: 0 }),
        fitStop({ id: "stop-2", name: "Florence", arriveDate: "2026-05-06", departDate: "2026-05-09", pinned: false, sortOrder: 1 }),
      ];
      stopFindMany.mockResolvedValue(stops);
      getTripProjection.mockResolvedValue({
        projectedEnd: "2026-05-09",
        hardEndDate: "2026-05-07",
        deadline: { kind: "hard-end", date: "2026-05-07" },
      });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "make_it_fit_preview", arguments: { tripId: TRIP_ID } });
      expect(r.isError).toBeFalsy();
      const out = JSON.parse((r.content as { text: string }[])[0].text);
      expect(out.nightsOver).toBe(2);
      expect(out.projectedEnd).toBe("2026-05-09");
      expect(out.deadline).toEqual({ kind: "hard-end", date: "2026-05-07" });
      expect(out.trim).toBeDefined();
      expect(out.drop).toBeDefined();
      expect(Array.isArray(out.drop)).toBe(true);
    });

    it("a non-member's trip id returns NOT_FOUND_TEXT", async () => {
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "make_it_fit_preview", arguments: { tripId: TRIP_ID } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
    });
  });

  describe("make_it_fit_apply", () => {
    it("errors when both trims and dropStopId are given, calling neither action", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, trims: [{ stopId: "stop-1", nights: 2 }], dropStopId: "stop-1" },
      });
      expect(r.isError).toBe(true);
      expect(setStopNights).not.toHaveBeenCalled();
      expect(deleteStop).not.toHaveBeenCalled();
    });

    it("errors when neither trims nor dropStopId are given", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "make_it_fit_apply", arguments: { tripId: TRIP_ID } });
      expect(r.isError).toBe(true);
      expect(setStopNights).not.toHaveBeenCalled();
      expect(deleteStop).not.toHaveBeenCalled();
    });

    it("a foreign stopId in trims returns NOT_FOUND_TEXT and calls no action", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, trims: [{ stopId: "not-in-this-trip", nights: 2 }] },
      });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(setStopNights).not.toHaveBeenCalled();
    });

    it("a foreign dropStopId returns NOT_FOUND_TEXT and calls no action", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, dropStopId: "not-in-this-trip" },
      });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(deleteStop).not.toHaveBeenCalled();
    });

    it("a made-up stopId returns the same NOT_FOUND_TEXT as a non-member one", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      const c = await connectTestClient();
      const madeUp = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, dropStopId: "totally-made-up-id" },
      });
      requireTripAccess.mockRejectedValue(notFoundErr());
      const nonMember = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, dropStopId: "stop-1" },
      });
      expect((madeUp.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect((nonMember.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
    });

    it("applies trims in order, stopping at the first failure and reporting what applied", async () => {
      stopFindMany.mockResolvedValue([
        fitStop({ id: "stop-1" }),
        fitStop({ id: "stop-2" }),
        fitStop({ id: "stop-3" }),
      ]);
      setStopNights.mockResolvedValueOnce({ success: true });
      setStopNights.mockResolvedValueOnce({ success: false, errors: { nights: ["Nights must be between 0 and 366"] } });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: {
          tripId: TRIP_ID,
          trims: [
            { stopId: "stop-1", nights: 1 },
            { stopId: "stop-2", nights: 2 },
            { stopId: "stop-3", nights: 3 },
          ],
        },
      });
      expect(setStopNights).toHaveBeenCalledTimes(2);
      expect(setStopNights).toHaveBeenNthCalledWith(1, "stop-1", 1);
      expect(setStopNights).toHaveBeenNthCalledWith(2, "stop-2", 2);
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("stop-2");
    });

    it("applies every trim in order when all succeed", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" }), fitStop({ id: "stop-2" })]);
      setStopNights.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: {
          tripId: TRIP_ID,
          trims: [
            { stopId: "stop-1", nights: 1 },
            { stopId: "stop-2", nights: 2 },
          ],
        },
      });
      expect(r.isError).toBeFalsy();
      expect(setStopNights).toHaveBeenCalledTimes(2);
    });

    it("drops the stop via deleteStop", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      deleteStop.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "make_it_fit_apply", arguments: { tripId: TRIP_ID, dropStopId: "stop-1" } });
      expect(r.isError).toBeFalsy();
      expect(deleteStop).toHaveBeenCalledWith("stop-1");
    });

    it("a pinned stopId in trims errors and calls no action (app never offers a Pinned Stop to trim)", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1", pinned: true })]);
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, trims: [{ stopId: "stop-1", nights: 2 }] },
      });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Pinned Stop");
      expect(setStopNights).not.toHaveBeenCalled();
    });

    it("a pinned dropStopId errors and calls no action (app never offers a Pinned Stop to drop)", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1", pinned: true })]);
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, dropStopId: "stop-1" },
      });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Pinned Stop");
      expect(deleteStop).not.toHaveBeenCalled();
    });

    it("a pinned stopId later in the list is still caught before any setStopNights call", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1", pinned: false }), fitStop({ id: "stop-2", pinned: true })]);
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: {
          tripId: TRIP_ID,
          trims: [
            { stopId: "stop-1", nights: 1 },
            { stopId: "stop-2", nights: 1 },
          ],
        },
      });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Pinned Stop");
      expect(setStopNights).not.toHaveBeenCalled();
    });

    // The dialog's manual per-stop Input is min={0} with no re-clamp before
    // applyTrim (make-it-fit.tsx ~243): a 0-night trim is a real, reachable
    // choice in the app, not something below some enforced floor.
    it("accepts a 0-night trim, matching the app's own manual trim input", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      setStopNights.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, trims: [{ stopId: "stop-1", nights: 0 }] },
      });
      expect(r.isError).toBeFalsy();
      expect(setStopNights).toHaveBeenCalledWith("stop-1", 0);
    });

    it("rejects a negative trim as a schema error", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "make_it_fit_apply",
        arguments: { tripId: TRIP_ID, trims: [{ stopId: "stop-1", nights: -1 }] },
      });
      expect(r.isError).toBe(true);
      expect(setStopNights).not.toHaveBeenCalled();
    });
  });
});
