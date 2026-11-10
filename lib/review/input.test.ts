import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_PLAN } from "@/test/fixtures/review/sample-plan";

const m = vi.hoisted(() => ({
  loadTripPlanView: vi.fn(), loadFlagRows: vi.fn(), flagsForRows: vi.fn(), loadTripProjection: vi.fn(),
  checklistItemFindMany: vi.fn(),
  tripFindUniqueOrThrow: vi.fn(),
}));
const holidays = vi.hoisted(() => ({ loadHolidayLines: vi.fn() }));
vi.mock("@/lib/holidays/trip-days", () => holidays);
vi.mock("@/lib/db", () => ({ db: { checklistItem: { findMany: m.checklistItemFindMany }, trip: { findUniqueOrThrow: m.tripFindUniqueOrThrow } } }));
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
  { kind: "PACKING", text: "Umbrella", done: false, ownerId: null },
  { kind: "PRETRIP", text: "Buy the 3-day Kansai pass", done: true, ownerId: null },
];
const PERSONAL = { kind: "PACKING", text: "Rain jacket", done: true, ownerId: "u2" };

beforeEach(() => {
  vi.resetAllMocks();
  m.loadTripPlanView.mockResolvedValue(SAMPLE_PLAN);
  m.loadFlagRows.mockResolvedValue(ROWS);
  m.flagsForRows.mockReturnValue([FLAG]);
  m.loadTripProjection.mockResolvedValue(PROJECTION);
  m.checklistItemFindMany.mockResolvedValue(CHECKLIST_ROWS);
  m.tripFindUniqueOrThrow.mockResolvedValue({ packingListsOpen: true });
  holidays.loadHolidayLines.mockResolvedValue(new Map());
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

  it("carries the public holidays on the Trip's dates, as date and lines", async () => {
    holidays.loadHolidayLines.mockResolvedValue(new Map([["2026-11-02", ["Culture Day (Japan): public holiday, expect closures"]]]));
    const input = await buildReviewInput("trip-1");
    const dates = holidays.loadHolidayLines.mock.calls[0][1] as string[];
    expect(dates[0]).toBe(SAMPLE_PLAN.trip.startDate);
    expect(dates.at(-1)).toBe(SAMPLE_PLAN.trip.endDate);
    expect(input.publicHolidays).toEqual([{ date: "2026-11-02", lines: ["Culture Day (Japan): public holiday, expect closures"] }]);
  });

  it("reads the trip's Packing list and Pre-trip checklist, ordered, and passes them through", async () => {
    const input = await buildReviewInput("trip-1");
    expect(m.checklistItemFindMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", kind: { in: ["PACKING", "PRETRIP"] } },
      orderBy: { sortOrder: "asc" },
      select: { kind: true, text: true, done: true, ownerId: true },
    });
    expect(input.checklists).toBe(
      reviewChecklistsJson([
        { list: "PACKING", text: "Umbrella", ticked: false },
        { list: "PRETRIP", text: "Buy the 3-day Kansai pass", ticked: true },
      ]),
    );
  });

  it("an Open Trip's Review sees personal Packing items too", async () => {
    m.checklistItemFindMany.mockResolvedValue([...CHECKLIST_ROWS, PERSONAL]);
    const input = await buildReviewInput("trip-1");
    expect(input.checklists).toContain("Rain jacket");
  });

  it("a Private Trip's Review sees Shared Packing and Pre-trip only", async () => {
    m.tripFindUniqueOrThrow.mockResolvedValue({ packingListsOpen: false });
    m.checklistItemFindMany.mockResolvedValue([...CHECKLIST_ROWS, PERSONAL]);
    const input = await buildReviewInput("trip-1");
    expect(input.checklists).toBe(
      reviewChecklistsJson([
        { list: "PACKING", text: "Umbrella", ticked: false },
        { list: "PRETRIP", text: "Buy the 3-day Kansai pass", ticked: true },
      ]),
    );
  });
});
