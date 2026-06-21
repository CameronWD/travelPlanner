/**
 * Tests for server/actions/ai.ts
 *
 * Mocks:
 *   - lib/guards (requireTripAccess)
 *   - lib/db (stop, item, trip queries)
 *   - lib/ai (the three exported functions)
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
  parseBookingConfirmationMock,
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
  parseBookingConfirmationMock: vi.fn(),
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
  parseBookingConfirmation: parseBookingConfirmationMock,
  isAiConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findUnique: stopFindUniqueMock },
    item: { findMany: itemFindManyMock },
    trip: { findUnique: tripFindUniqueMock },
  },
}));

import {
  aiSuggestActivities,
  aiDraftPackingList,
  aiParseBooking,
} from "./ai";

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
      ok: false,
      reason: "error",
      message: "Stop not found in this trip",
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
      ok: false,
      reason: "error",
      message: "Stop not found in this trip",
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

  it("forwards the lib result", async () => {
    stopFindUniqueMock.mockResolvedValue({
      id: "stop-1",
      name: "Rome",
      country: null,
      tripId: "trip-1",
    });
    itemFindManyMock.mockResolvedValue([]);
    const expected = { ok: true as const, data: { suggestions: [{ title: "Forum", category: "SIGHTSEEING" as const, note: "Ruins" }] } };
    suggestActivitiesMock.mockResolvedValue(expected);

    const result = await aiSuggestActivities("trip-1", "stop-1");

    expect(result).toEqual(expected);
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

    expect(result).toEqual({ ok: false, reason: "disabled" });
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

  it("returns error when trip not found", async () => {
    tripFindUniqueMock.mockResolvedValue(null);

    const result = await aiDraftPackingList("trip-99");

    expect(result).toEqual({
      ok: false,
      reason: "error",
      message: "Trip not found",
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

  it("forwards the lib result", async () => {
    tripFindUniqueMock.mockResolvedValue({
      name: "Test",
      startDate: "2025-01-01",
      endDate: "2025-01-07",
      stops: [],
    });
    const expected = { ok: true as const, data: { items: ["Passport", "Sunscreen"] } };
    draftPackingListMock.mockResolvedValue(expected);

    const result = await aiDraftPackingList("trip-1");

    expect(result).toEqual(expected);
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

    expect(result).toEqual({ ok: false, reason: "disabled" });
  });
});

// ---------------------------------------------------------------------------
// aiParseBooking
// ---------------------------------------------------------------------------

describe("aiParseBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
  });

  it("calls requireTripAccess with the trip id", async () => {
    parseBookingConfirmationMock.mockResolvedValue({
      ok: true,
      data: { kind: "unknown" },
    });

    await aiParseBooking("trip-1", "confirmation text");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
  });

  it("forwards text to parseBookingConfirmation", async () => {
    parseBookingConfirmationMock.mockResolvedValue({
      ok: true,
      data: { kind: "unknown" },
    });

    await aiParseBooking("trip-1", "my booking text here");

    expect(parseBookingConfirmationMock).toHaveBeenCalledWith({
      text: "my booking text here",
    });
  });

  it("forwards the lib result", async () => {
    const expected = {
      ok: true as const,
      data: {
        kind: "transport" as const,
        transport: {
          mode: "FLIGHT",
          from: "LHR",
          to: "CDG",
          dep: "2025-06-01T10:00:00Z",
          arr: "2025-06-01T12:00:00Z",
          reference: "AB123",
        },
      },
    };
    parseBookingConfirmationMock.mockResolvedValue(expected);

    const result = await aiParseBooking("trip-1", "flight details...");

    expect(result).toEqual(expected);
  });

  it("returns disabled when the lib returns disabled", async () => {
    parseBookingConfirmationMock.mockResolvedValue({ ok: false, reason: "disabled" });

    const result = await aiParseBooking("trip-1", "some text");

    expect(result).toEqual({ ok: false, reason: "disabled" });
  });
});
