import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  findManyMock,
  findUniqueMock,
  createMock,
  updateMock,
  deleteManyMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  findManyMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: {
      findMany: findManyMock,
      findUnique: findUniqueMock,
      create: createMock,
      update: updateMock,
      deleteMany: deleteManyMock,
    },
  },
}));

import { listDevices, reconcileDevice, removeDeviceById } from "@/server/actions/devices";

const NOW = new Date("2026-09-17T10:00:00.000Z");
const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "sub-1",
  userId: "user-1",
  endpoint: "https://web.push.apple.com/AAA",
  p256dh: "p",
  auth: "a",
  timezone: "Australia/Brisbane",
  label: "iPhone",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-09-17T09:59:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  // Clear queued once-values too: a leftover mockResolvedValueOnce survives
  // clearAllMocks and makes the NEXT test order-dependent (see follow-up 8).
  findUniqueMock.mockReset();
  findManyMock.mockReset();
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

describe("reconcileDevice", () => {
  it("checks the user first", async () => {
    findUniqueMock.mockResolvedValue(row());
    await reconcileDevice({ endpoint: "https://web.push.apple.com/AAA", keys: { p256dh: "p", auth: "a" } });
    expect(requireUserMock).toHaveBeenCalled();
  });

  it("reports a known device without writing when nothing changed", async () => {
    findUniqueMock.mockResolvedValue(row());
    const result = await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Australia/Brisbane",
    });
    expect(result).toEqual({ known: true, healed: false });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("writes when the timezone has moved", async () => {
    findUniqueMock.mockResolvedValue(row());
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Europe/Vienna",
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timezone: "Europe/Vienna" }),
      }),
    );
  });

  it("writes when lastSeenAt has gone stale enough to touch", async () => {
    findUniqueMock.mockResolvedValue(
      row({ lastSeenAt: new Date("2026-09-17T00:00:00.000Z") }),
    );
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Australia/Brisbane",
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastSeenAt: NOW }),
      }),
    );
  });

  // This is the self-heal: the browser holds a live subscription the server
  // has never seen (or has lost). Recreating it silently is the whole point —
  // the Traveller already granted permission on this Device.
  it("recreates a missing row and reports healed", async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await reconcileDevice({
      endpoint: "https://web.push.apple.com/BBB",
      keys: { p256dh: "p2", auth: "a2" },
      timezone: "Australia/Brisbane",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
    });
    expect(result).toEqual({ known: true, healed: true });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          endpoint: "https://web.push.apple.com/BBB",
          label: "iPhone",
          timezone: "Australia/Brisbane",
        }),
      }),
    );
  });

  // A row belonging to somebody else must never be silently reassigned by
  // whoever happens to be signed in on that machine.
  it("refuses to adopt another user's row", async () => {
    findUniqueMock.mockResolvedValue(row({ userId: "user-2" }));
    const result = await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
    });
    expect(result).toEqual({ known: false, healed: false });
    expect(updateMock).not.toHaveBeenCalled();
  });

  // The label is a one-time capture. Re-deriving it on every visit would let a
  // browser update quietly rewrite history.
  it("never overwrites an existing label", async () => {
    findUniqueMock.mockResolvedValue(row({ timezone: "Europe/Vienna" }));
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Australia/Brisbane",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    const data = updateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("label");
  });

  // `readLocalDeviceState` coalesces missing key material to
  // `{ p256dh: "", auth: "" }` rather than null, so this is a real shape a
  // caller can send — and it must never overwrite a good stored key pair
  // with an unusable one, which would permanently and silently break that
  // Device's push.
  it("never overwrites stored keys with empty ones on an otherwise-triggered write", async () => {
    findUniqueMock.mockResolvedValue(row({ timezone: "Europe/Vienna", p256dh: "good-p", auth: "good-a" }));
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "", auth: "" },
      timezone: "Australia/Brisbane", // forces the write via zoneMoved
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const data = updateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("p256dh");
    expect(data).not.toHaveProperty("auth");
  });

  it("still refreshes usable keys alongside a triggered write", async () => {
    findUniqueMock.mockResolvedValue(row({ timezone: "Europe/Vienna", p256dh: "old-p", auth: "old-a" }));
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "new-p", auth: "new-a" },
      timezone: "Australia/Brisbane",
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ p256dh: "new-p", auth: "new-a" }),
      }),
    );
  });

  // Half a key pair is as unusable as none — a push service needs both to
  // encrypt anything.
  it("treats a half-empty key pair as unusable too", async () => {
    findUniqueMock.mockResolvedValue(row({ timezone: "Europe/Vienna", p256dh: "good-p", auth: "good-a" }));
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "new-p", auth: "" },
      timezone: "Australia/Brisbane",
    });
    const data = updateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("p256dh");
    expect(data).not.toHaveProperty("auth");
  });

  // A self-heal that can't actually produce a working Device is worse than
  // no self-heal — it would look confirmed (a server row exists) while
  // remaining permanently unreachable. Better to report unknown and let a
  // later reconcile, or an explicit Enable, try again with real keys.
  it("refuses to self-heal a missing row when the reported keys are unusable", async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await reconcileDevice({
      endpoint: "https://web.push.apple.com/BBB",
      keys: { p256dh: "", auth: "" },
      timezone: "Australia/Brisbane",
    });
    expect(result).toEqual({ known: false, healed: false });
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("listDevices", () => {
  it("marks the caller's own device and flags stale ones", async () => {
    findManyMock.mockResolvedValue([
      row(),
      row({
        id: "sub-2",
        endpoint: "https://web.push.apple.com/OLD",
        label: "Mac",
        lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ]);

    const devices = await listDevices("https://web.push.apple.com/AAA");

    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ id: "sub-1", isThisDevice: true, stale: false });
    expect(devices[1]).toMatchObject({ id: "sub-2", isThisDevice: false, stale: true });
  });

  // The endpoint is a capability URL. It may travel to the browser that owns
  // it and nowhere else, so it must not appear in a list rendered to a page.
  it("never returns endpoints or keys", async () => {
    findManyMock.mockResolvedValue([row()]);
    const devices = await listDevices(null);
    expect(devices[0]).not.toHaveProperty("endpoint");
    expect(devices[0]).not.toHaveProperty("p256dh");
    expect(devices[0]).not.toHaveProperty("auth");
  });

  it("marks nothing as this device when the caller has no subscription", async () => {
    findManyMock.mockResolvedValue([row()]);
    const devices = await listDevices(null);
    expect(devices[0].isThisDevice).toBe(false);
  });
});

describe("removeDeviceById", () => {
  // Scoped to the caller. One Traveller must never be able to remove the
  // other's device by guessing an id.
  it("deletes only the caller's own row", async () => {
    deleteManyMock.mockResolvedValue({ count: 1 });
    const result = await removeDeviceById("sub-1");
    expect(result).toEqual({ ok: true });
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { id: "sub-1", userId: "user-1" },
    });
  });

  it("reports failure rather than throwing into the error boundary", async () => {
    deleteManyMock.mockRejectedValue(new Error("db down"));
    const result = await removeDeviceById("sub-1");
    expect(result).toEqual({ ok: false, error: "Couldn't remove that device." });
  });
});
