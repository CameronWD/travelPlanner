import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers `getDispatcherHealth` directly. Every other action file in this
 * codebase has a co-located test (devices.ts -> devices.test.ts, digest.ts ->
 * digest.test.ts); this one previously had none, so its `requireUser()` gate
 * and the exact `findUnique({ where: { id: "digest" } })` shape were only
 * exercised indirectly through account/page.test.tsx, where requireUser
 * always resolves — the "visible to any signed-in Traveller" guard was never
 * actually asserted to run.
 */

const { requireUserMock, findUniqueMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  findUniqueMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    cronHeartbeat: { findUnique: findUniqueMock },
  },
}));

import { getDispatcherHealth } from "@/server/actions/cron-health";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-10T12:00:00.000Z"));
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("getDispatcherHealth", () => {
  it("requires a signed-in user — visible account-wide, not admin-only", async () => {
    findUniqueMock.mockResolvedValue(null);
    await getDispatcherHealth();
    expect(requireUserMock).toHaveBeenCalled();
  });

  it("reads the single fixed heartbeat row by its id", async () => {
    findUniqueMock.mockResolvedValue(null);
    await getDispatcherHealth();
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: "digest" } });
  });

  it("reports a recent run as not stale", async () => {
    findUniqueMock.mockResolvedValue({
      id: "digest",
      lastRunAt: new Date("2026-12-10T10:00:00.000Z"),
    });

    const result = await getDispatcherHealth();

    expect(result).toEqual({
      lastRunAt: new Date("2026-12-10T10:00:00.000Z"),
      stale: false,
    });
  });

  it("reports an old run as stale", async () => {
    findUniqueMock.mockResolvedValue({
      id: "digest",
      lastRunAt: new Date("2026-12-01T10:00:00.000Z"),
    });

    const result = await getDispatcherHealth();

    expect(result).toEqual({
      lastRunAt: new Date("2026-12-01T10:00:00.000Z"),
      stale: true,
    });
  });

  it("treats a missing row (brand-new deployment) as never run and stale", async () => {
    findUniqueMock.mockResolvedValue(null);

    const result = await getDispatcherHealth();

    expect(result).toEqual({ lastRunAt: null, stale: true });
  });

  // Finding 3: the write in app/api/cron/digest/route.ts is wrapped in
  // try/catch on purpose; this read must be too. A missing `CronHeartbeat`
  // table (a preview deploy, or any non-Vercel host — vercel.json's
  // build-time `migrate deploy` only runs when VERCEL_ENV=production) must
  // not throw out of AccountPage's Promise.all and take the whole Devices
  // list down with it.
  it("reports never-run rather than throwing when the table read fails", async () => {
    findUniqueMock.mockRejectedValue(new Error("relation \"CronHeartbeat\" does not exist"));

    const result = await getDispatcherHealth();

    expect(result).toEqual({ lastRunAt: null, stale: true });
  });
});
