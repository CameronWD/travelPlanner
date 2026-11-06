import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  after: vi.fn(),
  refresh: vi.fn(),
  hasServerKey: vi.fn(() => true),
  importFails: false,
  venues: vi.fn(),
}));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("@/lib/google-fetch", () => ({ hasServerKey: m.hasServerKey }));
vi.mock("./refresh", () => ({ refreshTripTravelTimes: m.refresh }));
vi.mock("@/lib/venue-status/refresh", () => ({ refreshVenueStatuses: m.venues }));

import { afterEach } from "vitest";
import { scheduleTravelTimes } from "./schedule";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}


beforeEach(() => {
  vi.clearAllMocks();
  m.hasServerKey.mockReturnValue(true);
  m.venues.mockReset();
  m.refresh.mockReset();
  m.after.mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("scheduleTravelTimes", () => {
  it("defers the refresh until after the response", async () => {
    m.refresh.mockResolvedValue(undefined);
    scheduleTravelTimes("t1");
    expect(m.after).toHaveBeenCalledTimes(1);
    expect(m.refresh).not.toHaveBeenCalled();
    await m.after.mock.calls[0][0]();
    expect(m.refresh).toHaveBeenCalledWith("t1");
  });

  it("Review Focus 1: a write storm shares one run and re-runs once after it", async () => {
    const first = deferred();
    m.refresh.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);

    for (let i = 0; i < 5; i++) scheduleTravelTimes("t1");
    const [startsTheRun, ...duringIt] = m.after.mock.calls.map(([cb]) => cb);
    const runs = [startsTheRun()];
    await vi.waitFor(() => expect(m.refresh).toHaveBeenCalledTimes(1));
    runs.push(...duringIt.map((cb) => cb()));
    await new Promise((r) => setTimeout(r, 10));
    expect(m.refresh).toHaveBeenCalledTimes(1);

    first.resolve();
    await Promise.all(runs);
    expect(m.refresh).toHaveBeenCalledTimes(2);

    scheduleTravelTimes("t1");
    await m.after.mock.calls.at(-1)![0]();
    expect(m.refresh).toHaveBeenCalledTimes(3);
  });

  it("a coalesced travel-times rerun happens before the single venue re-check", async () => {
    const order: string[] = [];
    const first = deferred();
    m.refresh.mockImplementationOnce(async () => { await first.promise; order.push("travel"); }).mockImplementation(async () => void order.push("travel"));
    m.venues.mockImplementation(async () => void order.push("venues"));
    scheduleTravelTimes("t1");
    scheduleTravelTimes("t1");
    const [a, b] = m.after.mock.calls.map(([cb]) => cb);
    const runs = [a()];
    await vi.waitFor(() => expect(m.refresh).toHaveBeenCalledTimes(1));
    runs.push(b());
    first.resolve();
    await Promise.all(runs);
    expect(order).toEqual(["travel", "travel", "venues"]);
  });

  it("re-checks venue statuses in the same pass, after the travel times", async () => {
    const order: string[] = [];
    m.refresh.mockImplementation(async () => void order.push("travel"));
    m.venues.mockImplementation(async () => void order.push("venues"));
    scheduleTravelTimes("t1");
    expect(m.after).toHaveBeenCalledTimes(1);
    await m.after.mock.calls[0][0]();
    expect(order).toEqual(["travel", "venues"]);
    expect(m.venues).toHaveBeenCalledWith("t1");
  });

  it("a failing venue re-check is swallowed and never blocks the travel times", async () => {
    m.venues.mockRejectedValue(new Error("nope"));
    m.refresh.mockResolvedValue(undefined);
    scheduleTravelTimes("t1");
    await expect(m.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(m.refresh).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("[venue-status] refresh failed for trip t1:", "nope");
  });

  it("keyless: no venue re-check either", () => {
    m.hasServerKey.mockReturnValue(false);
    scheduleTravelTimes("t1");
    expect(m.after).not.toHaveBeenCalled();
    expect(m.venues).not.toHaveBeenCalled();
  });

  it("different Trips run side by side", async () => {
    const first = deferred();
    m.refresh.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    scheduleTravelTimes("t1");
    scheduleTravelTimes("t2");
    const runs = m.after.mock.calls.map(([cb]) => cb());
    await vi.waitFor(() => expect(m.refresh.mock.calls).toEqual([["t1"], ["t2"]]));
    first.resolve();
    await Promise.all(runs);
  });

  it("a failing refresh is swallowed and frees the Trip for the next schedule", async () => {
    m.refresh.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    scheduleTravelTimes("t1");
    await expect(m.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("[travel-times] refresh failed for trip t1:", "boom");
    scheduleTravelTimes("t1");
    await m.after.mock.calls[1][0]();
    expect(m.refresh).toHaveBeenCalledTimes(2);
  });

  it("outside a request (after throws) it does nothing and never throws", () => {
    m.after.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    expect(() => scheduleTravelTimes("t1")).not.toThrow();
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it("keyless: nothing is scheduled", () => {
    m.hasServerKey.mockReturnValue(false);
    scheduleTravelTimes("t1");
    expect(m.after).not.toHaveBeenCalled();
  });
});

describe("scheduleTravelTimes when the refresh module fails to load", () => {
  it("does not keep the failed import: the next schedule loads it again", async () => {
    vi.resetModules();
    let loads = 0;
    vi.doMock("./refresh", () => {
      loads++;
      if (m.importFails) throw new Error("module failed to load");
      return { refreshTripTravelTimes: m.refresh };
    });
    m.importFails = true;
    const fresh = await import("./schedule");
    m.refresh.mockResolvedValue(undefined);
    fresh.scheduleTravelTimes("t9");
    await expect(m.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(m.refresh).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);

    m.importFails = false;
    fresh.scheduleTravelTimes("t9");
    await m.after.mock.calls[1][0]();
    expect(m.refresh).toHaveBeenCalledWith("t9");
    expect(loads).toBe(2);
  });
});
