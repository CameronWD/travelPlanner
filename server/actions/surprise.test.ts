import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Surprise (CONTEXT.md): setting who is surprised, and the planner's reveal.
 * recordActivity is mocked; recordPlanActivity (lib/activity-guard) runs for
 * real so the fork-silence rule is exercised too.
 */

const {
  requireTripAccessMock,
  requireOutsideSurpriseMock,
  revalidatePathMock,
  recordActivityMock,
  stopFindUniqueMock,
  stopUpdateMock,
  itemFindUniqueMock,
  itemUpdateMock,
  tripMemberFindManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn(),
  requireOutsideSurpriseMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  recordActivityMock: vi.fn(),
  stopFindUniqueMock: vi.fn(),
  stopUpdateMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  itemUpdateMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }));
vi.mock("@/lib/surprise-guard", () => ({
  requireOutsideSurprise: requireOutsideSurpriseMock,
  surpriseRootFor: vi.fn().mockResolvedValue(null),
  surpriseRootForEntity: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db", () => ({
  db: {
    stop: { findUnique: stopFindUniqueMock, update: stopUpdateMock },
    item: { findUnique: itemFindUniqueMock, update: itemUpdateMock },
    tripMember: { findMany: tripMemberFindManyMock },
  },
}));

import { revealSurprise, setSurprise } from "./surprise";

const NOT_SURPRISE = { surprisePlannerId: null, surpriseForIds: null, surpriseRevealedAt: null };
const LIVE_BY_CAM = { surprisePlannerId: "cam", surpriseForIds: '["alex","sam"]', surpriseRevealedAt: null };

function stopRow(over: Record<string, unknown> = {}) {
  return { id: "stop-1", tripId: "trip-1", forkId: null, name: "Paris", departDate: null, timezone: "Europe/Paris", ...NOT_SURPRISE, ...over };
}
function itemRow(over: Record<string, unknown> = {}) {
  return { id: "item-1", tripId: "trip-1", forkId: null, title: "Dinner", date: null, stopId: "stop-1", stop: { timezone: "Europe/Paris" }, ...NOT_SURPRISE, ...over };
}
function signedInAs(id: string) {
  requireTripAccessMock.mockResolvedValue({ user: { id }, membership: { role: "member" } });
}

beforeEach(() => {
  signedInAs("cam");
  requireOutsideSurpriseMock.mockResolvedValue(null);
  stopUpdateMock.mockResolvedValue({});
  itemUpdateMock.mockResolvedValue({});
  recordActivityMock.mockResolvedValue(undefined);
  tripMemberFindManyMock.mockResolvedValue([
    { user: { id: "cam", name: "Cam Williams" } },
    { user: { id: "sam", name: "Sam Lee" } },
    { user: { id: "alex", name: "Alex Ng" } },
  ]);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("setSurprise", () => {
  it("makes a plain Stop a surprise for everyone else on the Trip by default", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow());

    const result = await setSurprise({ kind: "STOP", id: "stop-1" });

    expect(result).toEqual({ success: true });
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-1" },
      data: { surprisePlannerId: "cam", surpriseForIds: '["alex","sam"]', surpriseRevealedAt: null },
    });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        verb: "UPDATED",
        entityType: "STOP",
        entityId: "stop-1",
        entityLabel: "Paris",
        surpriseOf: { type: "STOP", id: "stop-1" },
        changes: { summary: "made Paris a surprise for Sam and Alex" },
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
  });

  it("is access-checked before the write", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow());
    await setSurprise({ kind: "STOP", id: "stop-1" });
    expectAccessCheckedBeforeWrite(requireTripAccessMock, stopUpdateMock);
  });

  it("surprises only the chosen Travellers", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow());

    await setSurprise({ kind: "STOP", id: "stop-1", forIds: ["sam"] });

    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-1" },
      data: { surprisePlannerId: "cam", surpriseForIds: '["sam"]', surpriseRevealedAt: null },
    });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { summary: "made Paris a surprise for Sam" } }),
    );
  });

  it("refuses surprising yourself", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow());
    const result = await setSurprise({ kind: "STOP", id: "stop-1", forIds: ["sam", "cam"] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.forIds).toBeDefined();
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses surprising someone who is not on the Trip", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow());
    const result = await setSurprise({ kind: "STOP", id: "stop-1", forIds: ["stranger"] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.forIds).toBeDefined();
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses an empty set", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow());
    const result = await setSurprise({ kind: "STOP", id: "stop-1", forIds: [] });
    expect(result).toEqual({ success: false, errors: { forIds: ["Choose at least one Traveller."] } });
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("lets the planner change who is surprised", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow(LIVE_BY_CAM));

    const result = await setSurprise({ kind: "STOP", id: "stop-1", forIds: ["alex"] });

    expect(result).toEqual({ success: true });
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-1" },
      data: { surprisePlannerId: "cam", surpriseForIds: '["alex"]', surpriseRevealedAt: null },
    });
  });

  it("refuses anyone but the planner changing a live Surprise", async () => {
    signedInAs("sam");
    stopFindUniqueMock.mockResolvedValue(stopRow(LIVE_BY_CAM));

    const result = await setSurprise({ kind: "STOP", id: "stop-1", forIds: ["alex"] });

    expect(result).toEqual({ success: false, errors: { _: ["Only the planner can change a surprise."] } });
    expect(stopUpdateMock).not.toHaveBeenCalled();
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("refuses a Traveller surprised by the enclosing Stop making an Item inside it a Surprise", async () => {
    itemFindUniqueMock.mockResolvedValue(itemRow());
    requireOutsideSurpriseMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(setSurprise({ kind: "ITEM", id: "item-1" })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("cam", { stopId: "stop-1" });
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("makes an Item a surprise and labels the line with its title", async () => {
    itemFindUniqueMock.mockResolvedValue(itemRow());

    await setSurprise({ kind: "ITEM", id: "item-1", forIds: ["alex", "sam"] });

    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { surprisePlannerId: "cam", surpriseForIds: '["alex","sam"]', surpriseRevealedAt: null },
    });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "ITEM", surpriseOf: { type: "ITEM", id: "item-1" }, changes: { summary: "made Dinner a surprise for Alex and Sam" } }),
    );
  });

  it("records nothing for a Fork's copy (forks are silent)", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow({ forkId: "fork-1" }));
    await setSurprise({ kind: "STOP", id: "stop-1" });
    expect(stopUpdateMock).toHaveBeenCalled();
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});

describe("revealSurprise", () => {
  it("lets the planner reveal a Stop, with one unstamped line", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow(LIVE_BY_CAM));

    const result = await revealSurprise({ kind: "STOP", id: "stop-1" });

    expect(result).toEqual({ success: true });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-1" }, data: { surpriseRevealedAt: expect.any(Date) } });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityType: "STOP",
        entityId: "stop-1",
        surpriseOf: null,
        changes: { summary: "revealed the surprise in Paris" },
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1", "layout");
  });

  it("is access-checked before the write", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow(LIVE_BY_CAM));
    await revealSurprise({ kind: "STOP", id: "stop-1" });
    expectAccessCheckedBeforeWrite(requireTripAccessMock, stopUpdateMock);
  });

  it("words an Item's reveal with its title", async () => {
    itemFindUniqueMock.mockResolvedValue(itemRow(LIVE_BY_CAM));

    await revealSurprise({ kind: "ITEM", id: "item-1" });

    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "item-1" }, data: { surpriseRevealedAt: expect.any(Date) } });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "ITEM", surpriseOf: null, changes: { summary: "revealed the surprise: Dinner" } }),
    );
  });

  it("refuses anyone but the planner", async () => {
    signedInAs("alex");
    stopFindUniqueMock.mockResolvedValue(stopRow(LIVE_BY_CAM));

    const result = await revealSurprise({ kind: "STOP", id: "stop-1" });

    expect(result).toEqual({ success: false, errors: { _: ["Only the planner can reveal a surprise."] } });
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses a Stop that is not a live Surprise", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow());

    const result = await revealSurprise({ kind: "STOP", id: "stop-1" });

    expect(result).toEqual({ success: false, errors: { _: ["This isn't a surprise."] } });
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses one already revealed", async () => {
    stopFindUniqueMock.mockResolvedValue(stopRow({ ...LIVE_BY_CAM, surpriseRevealedAt: new Date("2026-01-01") }));
    const result = await revealSurprise({ kind: "STOP", id: "stop-1" });
    expect(result).toEqual({ success: false, errors: { _: ["This isn't a surprise."] } });
  });
});
