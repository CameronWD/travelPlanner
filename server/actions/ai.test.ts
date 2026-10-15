/**
 * Tests for server/actions/ai.ts
 *
 * Mocks:
 *   - lib/guards (requireTripAccess)
 *   - lib/db (stop, item, trip queries)
 *   - lib/ai (the two exported functions)
 *   - next/cache (revalidatePath — not used by ai actions but needed by guards mock)
 *
 * Each action is access-checked (requireTripAccess) and delegates to the lib.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireTripAccessMock,
  suggestActivitiesMock,
  draftPackingListMock,
  stopFindUniqueMock,
  itemFindManyMock,
  tripFindUniqueMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  suggestActivitiesMock: vi.fn(),
  draftPackingListMock: vi.fn(),
  stopFindUniqueMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
}));

vi.mock("@/lib/ai", () => ({
  suggestActivities: suggestActivitiesMock,
  draftPackingList: draftPackingListMock,
  isAiConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findUnique: stopFindUniqueMock },
    item: { findMany: itemFindManyMock },
    trip: { findUnique: tripFindUniqueMock },
  },
}));

// Surprise (ADR 0051): the gate and the visibility loader are tested on
// their own; here they are stubs whose calls and fragments we pin.
const { requireOutsideSurpriseMock, loadSurpriseVisibilityMock } = vi.hoisted(() => ({
  requireOutsideSurpriseMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
}));
vi.mock("@/lib/surprise-guard", () => ({ requireOutsideSurprise: requireOutsideSurpriseMock }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import {
  aiSuggestActivities,
  aiDraftPackingList,
} from "./ai";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

// ---------------------------------------------------------------------------
// aiSuggestActivities
// ---------------------------------------------------------------------------

describe("aiSuggestActivities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    requireOutsideSurpriseMock.mockResolvedValue(null);
    loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
  });

  it("Surprise: refuses a surprised Traveller (notFound) before reading the Stop or asking the AI", async () => {
    requireOutsideSurpriseMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(aiSuggestActivities("trip-1", "stop-1")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("user-1", { stopId: "stop-1" });
    expectAccessCheckedBeforeWrite(requireTripAccessMock, requireOutsideSurpriseMock);
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
    expect(itemFindManyMock).not.toHaveBeenCalled();
    expect(suggestActivitiesMock).not.toHaveBeenCalled();
  });

  it("Surprise: the existing-titles read carries the Item fragment, so a Surprise Item's title never reaches the prompt", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ viewerId: "user-1" }));
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", name: "Rome", country: "Italy", tripId: "trip-1" });
    itemFindManyMock.mockResolvedValue([]);
    suggestActivitiesMock.mockResolvedValue({ ok: true, data: { suggestions: [] } });

    await aiSuggestActivities("trip-1", "stop-1");

    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("trip-1", "user-1");
    expect(itemFindManyMock).toHaveBeenCalledWith({
      where: { tripId: "trip-1", stopId: "stop-1", forkId: null, ...MARKER_WHERE.item },
      select: { title: true },
    });
  });

  it("calls requireTripAccess with the trip id", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      name: "Paris",
      country: "France",
      tripId: "trip-1",
    });
    itemFindManyMock.mockResolvedValue([]);
    suggestActivitiesMock.mockResolvedValue({ ok: true, data: { suggestions: [] } });

    await aiSuggestActivities("trip-1", "stop-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
  });

  it("returns error when stop not found", async () => {
    stopFindUniqueMock.mockResolvedValue(null);

    const result = await aiSuggestActivities("trip-1", "stop-99");

    expect(result).toEqual({
      success: false,
      code: "error",
      errors: { _: ["Stop not found in this trip"] },
    });
    expect(suggestActivitiesMock).not.toHaveBeenCalled();
  });

  it("returns error when stop belongs to a different trip", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      name: "London",
      country: "UK",
      tripId: "trip-other",
    });

    const result = await aiSuggestActivities("trip-1", "stop-1");

    expect(result).toEqual({
      success: false,
      code: "error",
      errors: { _: ["Stop not found in this trip"] },
    });
  });

  it("calls suggestActivities with stop details and existing titles", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      name: "Rome",
      country: "Italy",
      tripId: "trip-1",
    });
    itemFindManyMock.mockResolvedValue([
      { title: "Colosseum" },
      { title: "Vatican" },
    ]);
    suggestActivitiesMock.mockResolvedValue({ ok: true, data: { suggestions: [] } });

    await aiSuggestActivities("trip-1", "stop-1");

    expect(suggestActivitiesMock).toHaveBeenCalledWith({
      stopName: "Rome",
      country: "Italy",
      existingTitles: ["Colosseum", "Vatican"],
    });
  });

  it("scopes existing-item dedup read to real plan (forkId: null)", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      name: "Paris",
      country: "France",
      tripId: "trip-1",
    });
    itemFindManyMock.mockResolvedValue([]);
    suggestActivitiesMock.mockResolvedValue({ ok: true, data: { suggestions: [] } });

    await aiSuggestActivities("trip-1", "stop-1");

    expect(itemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: "trip-1", stopId: "stop-1", forkId: null }),
      }),
    );
  });

  it("converts the lib's successful result into an ActionResult", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      name: "Rome",
      country: null,
      tripId: "trip-1",
    });
    itemFindManyMock.mockResolvedValue([]);
    const libResult = { ok: true as const, data: { suggestions: [{ title: "Forum", category: "SIGHTSEEING" as const, note: "Ruins" }] } };
    suggestActivitiesMock.mockResolvedValue(libResult);

    const result = await aiSuggestActivities("trip-1", "stop-1");

    expect(result).toEqual({ success: true, data: libResult.data });
  });

  it("returns disabled when the lib returns disabled", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      name: "Tokyo",
      country: "Japan",
      tripId: "trip-1",
    });
    itemFindManyMock.mockResolvedValue([]);
    suggestActivitiesMock.mockResolvedValue({ ok: false, reason: "disabled" });

    const result = await aiSuggestActivities("trip-1", "stop-1");

    expect(result).toEqual({
      success: false,
      code: "disabled",
      errors: { _: ["AI features are not configured."] },
    });
  });
});

// ---------------------------------------------------------------------------
// aiDraftPackingList
// ---------------------------------------------------------------------------

describe("aiDraftPackingList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
  });

  it("calls requireTripAccess with the trip id", async () => {
    tripFindUniqueMock.mockResolvedValue({
      name: "Euro Trip",
      startDate: "2025-06-01",
      endDate: "2025-06-14",
      stops: [],
    });
    draftPackingListMock.mockResolvedValue({ ok: true, data: { items: [] } });

    await aiDraftPackingList("trip-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
  });

  it("reads only the real plan's Stops (their names are outside any Surprise)", async () => {
    tripFindUniqueMock.mockResolvedValue({ name: "Euro Trip", startDate: null, endDate: null, stops: [] });
    draftPackingListMock.mockResolvedValue({ ok: true, data: { items: [] } });

    await aiDraftPackingList("trip-1");

    expect(tripFindUniqueMock.mock.calls[0][0].select.stops).toEqual({
      where: { forkId: null },
      orderBy: { sortOrder: "asc" },
      select: { name: true, country: true },
    });
  });

  it("returns error when trip not found", async () => {
    tripFindUniqueMock.mockResolvedValue(null);

    const result = await aiDraftPackingList("trip-99");

    expect(result).toEqual({
      success: false,
      code: "error",
      errors: { _: ["Trip not found"] },
    });
    expect(draftPackingListMock).not.toHaveBeenCalled();
  });

  it("calls draftPackingList with trip details and stops", async () => {
    tripFindUniqueMock.mockResolvedValue({
      name: "Summer Trip",
      startDate: "2025-07-01",
      endDate: "2025-07-21",
      stops: [
        { name: "Barcelona", country: "Spain" },
        { name: "Lisbon", country: "Portugal" },
      ],
    });
    draftPackingListMock.mockResolvedValue({ ok: true, data: { items: [] } });

    await aiDraftPackingList("trip-1");

    expect(draftPackingListMock).toHaveBeenCalledWith({
      tripName: "Summer Trip",
      stops: [
        { name: "Barcelona", country: "Spain" },
        { name: "Lisbon", country: "Portugal" },
      ],
      startDate: "2025-07-01",
      endDate: "2025-07-21",
    });
  });

  it("converts the lib's successful result into an ActionResult", async () => {
    tripFindUniqueMock.mockResolvedValue({
      name: "Test",
      startDate: "2025-01-01",
      endDate: "2025-01-07",
      stops: [],
    });
    const libResult = { ok: true as const, data: { items: ["Passport", "Sunscreen"] } };
    draftPackingListMock.mockResolvedValue(libResult);

    const result = await aiDraftPackingList("trip-1");

    expect(result).toEqual({ success: true, data: libResult.data });
  });

  it("returns disabled when the lib returns disabled", async () => {
    tripFindUniqueMock.mockResolvedValue({
      name: "Test",
      startDate: "2025-01-01",
      endDate: "2025-01-07",
      stops: [],
    });
    draftPackingListMock.mockResolvedValue({ ok: false, reason: "disabled" });

    const result = await aiDraftPackingList("trip-1");

    expect(result).toEqual({
      success: false,
      code: "disabled",
      errors: { _: ["AI features are not configured."] },
    });
  });
});
