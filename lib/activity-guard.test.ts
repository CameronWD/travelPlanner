import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Prisma, Stop } from "@prisma/client";
import type { db } from "@/lib/db";

const { recordActivityMock } = vi.hoisted(() => ({
  recordActivityMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/activity-record", () => ({ recordActivity: recordActivityMock }));

import { auditedUpdate, recordPlanActivity, recordUpdate, type AuditedDelegate } from "./activity-guard";

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

type NotedRow = { id: string; tripId: string; name: string; notes: string | null };

describe("auditedUpdate", () => {
  it("auditedUpdate reads, updates and records the diff on the real plan", async () => {
    const delegate = {
      findUnique: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome", notes: null }),
      update: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome", notes: "Pasta" }),
    };
    const { before, after } = await auditedUpdate<NotedRow, { notes: string }>("STOP", delegate, "s1", { notes: "Pasta" }, null);
    expect(delegate.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { notes: "Pasta" } });
    expect(before?.notes).toBeNull();
    expect(after.notes).toBe("Pasta");
    expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
      tripId: "t1", verb: "UPDATED", entityType: "STOP", entityId: "s1", entityLabel: "Rome",
    }));
  });

  it("auditedUpdate records the field diff", async () => {
    const delegate = {
      findUnique: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome", country: null }),
      update: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome", country: "Italy" }),
    };
    await auditedUpdate("STOP", delegate, "s1", { country: "Italy" }, null);
    expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
      changes: [expect.objectContaining({ field: "country" })],
    }));
  });

  it("auditedUpdate on a Fork writes but records nothing", async () => {
    const delegate = { findUnique: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome" }), update: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Roma" }) };
    await auditedUpdate("STOP", delegate, "s1", { name: "Roma" }, "fork-1");
    expect(delegate.update).toHaveBeenCalled();
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("a failed update records nothing", async () => {
    const delegate = { findUnique: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome" }), update: vi.fn().mockRejectedValue(new Error("P2025")) };
    await expect(auditedUpdate("STOP", delegate, "s1", {}, null)).rejects.toThrow("P2025");
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("db delegates fit AuditedDelegate", () => {
    expectTypeOf<typeof db.stop>().toMatchTypeOf<AuditedDelegate<Stop, Prisma.StopUpdateInput>>();
  });
});

describe("recordUpdate", () => {
  it("recordUpdate records the diff of a built after", async () => {
    await recordUpdate("CHAPTER", { tripId: "t1", plan: null, entityId: "c1", before: { name: "North" }, after: { name: "North", startDate: "2026-11-02" } });
    expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "CHAPTER", entityLabel: "North", verb: "UPDATED", entityId: "c1",
      changes: [expect.objectContaining({ field: "startDate" })],
    }));
  });

  it("recordUpdate on a Fork records nothing", async () => {
    await recordUpdate("CHAPTER", { tripId: "t1", plan: "fork-1", entityId: "c1", before: { name: "North" }, after: { name: "South" } });
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});
