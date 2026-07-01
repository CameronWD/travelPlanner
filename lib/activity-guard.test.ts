import { afterEach, describe, expect, it, vi } from "vitest";

const { recordActivityMock } = vi.hoisted(() => ({
  recordActivityMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }));

import { recordPlanActivity } from "./activity-guard";

afterEach(() => {
  vi.clearAllMocks();
});

const INPUT = {
  tripId: "trip-1",
  verb: "CREATED" as const,
  entityType: "STOP" as const,
  entityId: "stop-1",
  entityLabel: "London",
};

describe("recordPlanActivity", () => {
  it("calls recordActivity when forkId is null (real plan)", async () => {
    await recordPlanActivity(null, INPUT);
    expect(recordActivityMock).toHaveBeenCalledOnce();
    expect(recordActivityMock).toHaveBeenCalledWith(INPUT);
  });

  it("calls recordActivity when forkId is undefined (real plan)", async () => {
    await recordPlanActivity(undefined, INPUT);
    expect(recordActivityMock).toHaveBeenCalledOnce();
  });

  it("does NOT call recordActivity when forkId is a non-null string (fork edit)", async () => {
    await recordPlanActivity("fork-abc", INPUT);
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("does NOT call recordActivity for any non-null forkId", async () => {
    await recordPlanActivity("fork-xyz", { ...INPUT, verb: "UPDATED" });
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});
