import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_PLAN } from "@/test/fixtures/review/sample-plan";

const m = vi.hoisted(() => ({
  loadTripPlanView: vi.fn(), loadFlagRows: vi.fn(), flagsForRows: vi.fn(), loadTripProjection: vi.fn(),
  checklistItemFindMany: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { checklistItem: { findMany: m.checklistItemFindMany } } }));
vi.mock("@/lib/mcp/reads/trip-plan", () => ({ loadTripPlanView: m.loadTripPlanView }));
vi.mock("@/lib/flags-loader", () => ({ loadFlagRows: m.loadFlagRows, flagsForRows: m.flagsForRows }));
vi.mock("@/lib/trip-projection-reads", () => ({ loadTripProjection: m.loadTripProjection }));

import { todayISOInZone } from "@/lib/tz";
import { reviewChecklistsJson } from "./input-shape";
import { buildReviewInput } from "./input";

const PROJECTION = { projectedEnd: null, hardEndDate: null, deadline: null };
const ROWS = { today: "2026-10-18" };
const FLAG = { id: "f1", severity: "info", message: "Something.", targetType: "TRIP" };
const CHECKLIST_ROWS = [
  { kind: "PACKING", text: "Umbrella", done: false },
  { kind: "PRETRIP", text: "Buy the 3-day Kansai pass", done: true },
];

beforeEach(() => {
  vi.resetAllMocks();
  m.loadTripPlanView.mockResolvedValue(SAMPLE_PLAN);
  m.loadFlagRows.mockResolvedValue(ROWS);
  m.flagsForRows.mockReturnValue([FLAG]);
  m.loadTripProjection.mockResolvedValue(PROJECTION);
  m.checklistItemFindMany.mockResolvedValue(CHECKLIST_ROWS);
});

describe("buildReviewInput", () => {
  it("reads the plan and the Flags as a Share link's null viewer, on the real plan, with the Trip's today", async () => {
    const input = await buildReviewInput("trip-1");
    expect(m.loadTripPlanView).toHaveBeenCalledWith("trip-1", null);
    expect(m.loadFlagRows).toHaveBeenCalledWith("trip-1", null);
    expect(m.loadTripProjection).toHaveBeenCalledWith("trip-1");
    expect(m.flagsForRows).toHaveBeenCalledWith(ROWS, PROJECTION);
    expect(input).toMatchObject({ tripName: "Autumn in Kyoto", today: "2026-10-18", flags: [FLAG] });
  });

  it("has no Flags for a Trip without dates, and takes today from the Home base's zone", async () => {
    m.loadFlagRows.mockResolvedValue(null);
    const input = await buildReviewInput("trip-1");
    expect(m.flagsForRows).not.toHaveBeenCalled();
    expect(input.flags).toEqual([]);
    expect(input.today).toBe(todayISOInZone("Australia/Sydney"));
  });

  it("reads the trip's Packing list and Pre-trip checklist, ordered, and passes them through", async () => {
    const input = await buildReviewInput("trip-1");
    expect(m.checklistItemFindMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", kind: { in: ["PACKING", "PRETRIP"] } },
      orderBy: { sortOrder: "asc" },
      select: { kind: true, text: true, done: true },
    });
    expect(input.checklists).toBe(
      reviewChecklistsJson([
        { list: "PACKING", text: "Umbrella", ticked: false },
        { list: "PRETRIP", text: "Buy the 3-day Kansai pass", ticked: true },
      ]),
    );
  });
});
