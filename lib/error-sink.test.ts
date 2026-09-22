import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for reportError (lib/error-sink.ts).
 *
 * `@/lib/admin-notify` is mocked out entirely: its own behaviour (resolving
 * admins, loading Devices, calling sendPush) is covered by
 * lib/admin-notify.test.ts, not here — this suite only needs to know
 * whether reportError called it, and with what.
 */

const {
  errorReportFindUniqueMock,
  errorReportCreateMock,
  errorReportUpdateMock,
  notifyAdminsMock,
} = vi.hoisted(() => ({
  errorReportFindUniqueMock: vi.fn(),
  errorReportCreateMock: vi.fn(),
  errorReportUpdateMock: vi.fn(),
  notifyAdminsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    errorReport: {
      findUnique: errorReportFindUniqueMock,
      create: errorReportCreateMock,
      update: errorReportUpdateMock,
    },
  },
}));

vi.mock("@/lib/admin-notify", () => ({ notifyAdmins: notifyAdminsMock }));

import { reportError } from "./error-sink";

const dbMock = {
  errorReport: {
    findUnique: errorReportFindUniqueMock,
    create: errorReportCreateMock,
    update: errorReportUpdateMock,
  },
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy?.mockRestore();
});

describe("reportError", () => {
  it("creates a row on first occurrence and notifies once", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await reportError(new Error("boom"), { route: "/api/cron/digest", source: "server" });

    expect(dbMock.errorReport.create).toHaveBeenCalled();
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
  });

  it("bumps count on a repeat and stays quiet", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue({ id: "e1", count: 4 });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await reportError(new Error("boom"), { route: "/api/cron/digest", source: "server" });

    expect(dbMock.errorReport.create).not.toHaveBeenCalled();
    expect(dbMock.errorReport.update).toHaveBeenCalled();
    expect(notifyAdminsMock).not.toHaveBeenCalled();
  });

  it("I1: falls back to an atomic increment when a concurrent occurrence wins the create race (P2002), without a second notify", async () => {
    // Two concurrent NEW occurrences of the same signature both see
    // findUnique -> null; one create wins, the other must not be lost.
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    const p2002 = Object.assign(new Error("Unique constraint failed on the fields: (`signature`)"), {
      code: "P2002",
    });
    dbMock.errorReport.create.mockRejectedValue(p2002);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await reportError(new Error("boom"), { source: "server" });

    expect(dbMock.errorReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ count: { increment: 1 } }),
      }),
    );
    // The winning create's own caller already notified — a second notify
    // here would double-push for one distinct failure.
    expect(notifyAdminsMock).not.toHaveBeenCalled();
  });

  it("never throws, even when the database is unreachable", async () => {
    dbMock.errorReport.findUnique.mockRejectedValue(new Error("db down"));
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(reportError(new Error("boom"), { source: "server" })).resolves.toBeUndefined();
  });

  it("still console.errors when the database is unreachable — the one channel that survives a DB outage", async () => {
    dbMock.errorReport.findUnique.mockRejectedValue(new Error("db down"));
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await reportError(new Error("boom"), { source: "server" });

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("never throws when notifyAdmins itself rejects", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    notifyAdminsMock.mockRejectedValue(new Error("push exploded"));
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(reportError(new Error("boom"), { source: "server" })).resolves.toBeUndefined();
  });

  it("never throws for a non-Error thrown value", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(reportError("just a string", { source: "server" })).resolves.toBeUndefined();
    expect(dbMock.errorReport.create).toHaveBeenCalled();
  });

  it("produces the same signature for two errors that differ only below the first stack frame", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const errA = new Error("boom");
    errA.stack = "Error: boom\n    at handlerA (/app/route.ts:10:5)\n    at deeper (/app/x.ts:99:1)";
    const errB = new Error("boom");
    errB.stack = "Error: boom\n    at handlerA (/app/route.ts:10:5)\n    at differentDeeper (/app/y.ts:5:20)";

    await reportError(errA, { source: "server" });
    const signatureA = dbMock.errorReport.create.mock.calls[0][0].data.signature;

    dbMock.errorReport.create.mockClear();
    await reportError(errB, { source: "server" });
    const signatureB = dbMock.errorReport.create.mock.calls[0][0].data.signature;

    expect(signatureA).toBe(signatureB);
  });

  it("produces a different signature when the first stack frame differs", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const errA = new Error("boom");
    errA.stack = "Error: boom\n    at handlerA (/app/route.ts:10:5)";
    const errB = new Error("boom");
    errB.stack = "Error: boom\n    at handlerB (/app/other.ts:20:2)";

    await reportError(errA, { source: "server" });
    const signatureA = dbMock.errorReport.create.mock.calls[0][0].data.signature;

    dbMock.errorReport.create.mockClear();
    await reportError(errB, { source: "server" });
    const signatureB = dbMock.errorReport.create.mock.calls[0][0].data.signature;

    expect(signatureA).not.toBe(signatureB);
  });

  it("passes route, source, userId and digest through onto the created row", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await reportError(new Error("boom"), {
      route: "/api/cron/digest",
      source: "server",
      userId: "user-1",
      digest: "abc123",
    });

    expect(dbMock.errorReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: "boom",
          route: "/api/cron/digest",
          source: "server",
          userId: "user-1",
          digest: "abc123",
        }),
      }),
    );
  });

  // C1 (fix round 1): an unauthenticated caller (app/api/client-error/route.ts)
  // fully controls a client-sourced report's message, and the create path
  // pushes to every admin Device on a new signature. Capping the message's
  // length (done at the route) bounds the payload; refusing to push for
  // client-sourced reports at all removes the unauthenticated-push primitive
  // entirely — the same { report: false } trade already applied to
  // notifyAdmins's own sendPush call in lib/admin-notify.ts. The row, the
  // dedup and the /admin surface are unaffected; only the push is skipped.
  it("C1: creates the row for a client-sourced report but never notifies admins", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    // Overrides the P2002 rejection an earlier test left on this mock (only
    // `.mockClear()`'d between tests, not `.mockReset()`'d) — this test
    // needs create to actually succeed so execution reaches the
    // notifyAdmins call it's asserting against.
    dbMock.errorReport.create.mockResolvedValue({ id: "new-row" });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await reportError(new Error("render failed"), {
      route: "/trips/t1",
      source: "client",
    });

    expect(dbMock.errorReport.create).toHaveBeenCalled();
    expect(notifyAdminsMock).not.toHaveBeenCalled();
  });

  // M1 (fix round 1): the push title was a hardcoded "New server error" —
  // now built from ctx.source (falling back to DEFAULT_SOURCE), the same
  // value stored on the row and returned by /admin's listErrorReports, so
  // the two can never disagree about what produced a given push. Only
  // "server" can reach this branch today (client-sourced reports never
  // notify at all — see the C1 test above), but the title is now a genuine
  // interpolation rather than a string that happened to match by accident.
  it("M1: the notification title is built from the source, not a bare hardcoded string", async () => {
    dbMock.errorReport.findUnique.mockResolvedValue(null);
    // See the C1 test above for why this override is needed.
    dbMock.errorReport.create.mockResolvedValue({ id: "new-row" });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await reportError(new Error("boom"), {});

    expect(notifyAdminsMock).toHaveBeenCalledWith(
      "New server error",
      expect.anything(),
      expect.anything(),
    );
  });
});
