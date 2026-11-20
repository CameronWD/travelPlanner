// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dayOffsetFrom,
  forgetUsage,
  openMode,
  phaseNow,
  recordUsageAction,
  recordUsageDayChange,
  recordUsageMoreRow,
  recordUsageScreen,
  recordUsageSwipe,
  resetUsageForTests,
  sendUsageOnce,
  setUsageTrip,
  startUsage,
} from "./client";
import { parseUsageBatch } from "./validate";

const KEY = "teepee.usage.v1";
const NOW = new Date("2026-12-01T12:00:00Z");
const TRIP = { tripId: "it-usage-trip", startDate: "2026-12-01", endDate: "2026-12-10", zone: "Etc/UTC" };

let visibility: DocumentVisibilityState = "visible";
let online = true;
let fetchMock: ReturnType<typeof vi.fn>;
let sentAt: number[];

const ok = (body: unknown = { recording: true }) => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number) => new Response(null, { status: code });

function raw(): { u: string; r: Record<string, unknown>[] } | null {
  const value = window.localStorage.getItem(KEY);
  return value === null ? null : JSON.parse(value);
}

function stored(): { u: string; r: Record<string, unknown>[] } | null {
  vi.advanceTimersByTime(2_000);
  const raw = window.localStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
}

function sentBatch(call = 0): Record<string, unknown>[] {
  return JSON.parse(fetchMock.mock.calls[call][1].body).records;
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

function search(n = 1) {
  for (let i = 0; i < n; i++) {
    recordUsageAction("search-opened");
    vi.setSystemTime(Date.now() + 1);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  resetUsageForTests();
  visibility = "visible";
  online = true;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
  sentAt = [];
  fetchMock = vi.fn(async () => {
    sentAt.push(Date.now());
    return ok();
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  resetUsageForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the queue", () => {
  it("keeps the newest 500 records", () => {
    startUsage("it-usage-a");
    search(501);
    const r = stored()!.r;
    expect(r).toHaveLength(500);
    expect(r[0].at).toBe(NOW.getTime() + 1);
  });

  it("with localStorage throwing, records queue in memory, cap at 500 and still send", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => {
      startUsage("it-usage-a");
      search(501);
    }).not.toThrow();
    for (let i = 0; i < 7; i++) await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(sentBatch(0)[0].at).toBe(NOW.getTime() + 1);
    expect([0, 1, 2, 3, 4].map((i) => sentBatch(i).length)).toEqual([100, 100, 100, 100, 100]);
  });

  it("a quota error part-way falls back to memory without losing the queue", async () => {
    startUsage("it-usage-a");
    search(3);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    search(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sentBatch()).toHaveLength(5);
  });

  it("corrupted JSON in the key reads as an empty queue", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(() => startUsage("it-usage-a")).not.toThrow();
    search();
    expect(stored()).toMatchObject({ u: "it-usage-a", r: [{ action: "search-opened" }] });
  });

  it.each([["[]"], ['{"u":5,"r":[]}'], ['{"u":"it-usage-a","r":"x"}'], ["null"]])("a wrong shape (%s) reads as empty", (raw) => {
    window.localStorage.setItem(KEY, raw);
    startUsage("it-usage-a");
    expect(stored()).toEqual({ u: "it-usage-a", r: [] });
  });

  it("start writes the user even with nothing queued", () => {
    startUsage("it-usage-a");
    expect(stored()).toEqual({ u: "it-usage-a", r: [] });
  });

  it("startUsage for another user clears the stored queue", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ u: "it-usage-a", r: [{ action: "search-opened", at: 1, mode: "desktop" }] }));
    startUsage("it-usage-b");
    expect(stored()).toEqual({ u: "it-usage-b", r: [] });
  });

  it("records made before start join the queue at start", () => {
    search(2);
    expect(stored()).toBeNull();
    startUsage("it-usage-a");
    expect(stored()!.r).toHaveLength(2);
  });

  it("forgetUsage removes the key and stops recording", () => {
    startUsage("it-usage-a");
    search();
    forgetUsage();
    search();
    expect(stored()).toBeNull();
  });
});

describe("persisting", () => {
  it("recording touches no storage; one coalesced write follows", () => {
    startUsage("it-usage-a");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    search(50);
    recordUsageScreen({ screen: "trips", ms: 10, saved: false, dayOffset: null, trip: null });
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(raw()!.r).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(raw()!.r).toHaveLength(51);
  });

  it("uses requestIdleCallback where it exists, once per idle period", () => {
    const idle: (() => void)[] = [];
    vi.stubGlobal("requestIdleCallback", (cb: () => void, opts: { timeout: number }) => {
      expect(opts.timeout).toBe(2_000);
      return idle.push(cb);
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    startUsage("it-usage-a");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    search(5);
    expect(idle).toHaveLength(1);
    idle[0]();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(raw()!.r).toHaveLength(5);
    search();
    expect(idle).toHaveLength(2);
  });

  it.each([["hide"], ["pagehide"]])("a %s writes at once", (event) => {
    startUsage("it-usage-a");
    online = false;
    search(3);
    if (event === "hide") setVisibility("hidden");
    else window.dispatchEvent(new Event("pagehide"));
    expect(raw()!.r).toHaveLength(3);
  });

  it("the cap holds in memory and in storage before and after a write", () => {
    startUsage("it-usage-a");
    search(600);
    expect(raw()!.r).toEqual([]);
    vi.advanceTimersByTime(2_000);
    const r = raw()!.r;
    expect(r).toHaveLength(500);
    expect(r[0].at).toBe(NOW.getTime() + 100);
    search(10);
    vi.advanceTimersByTime(2_000);
    expect(raw()!.r).toHaveLength(500);
    expect(raw()!.r[0].at).toBe(NOW.getTime() + 110);
  });
});

describe("flushing", () => {
  it("sends nothing before 30 s, then one keepalive batch of at most 100", async () => {
    startUsage("it-usage-a");
    search(150);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/usage");
    expect(init).toMatchObject({ method: "POST", keepalive: true, referrerPolicy: "no-referrer", headers: { "content-type": "application/json" } });
    expect(sentBatch()).toHaveLength(100);
    expect(stored()!.r).toHaveLength(50);
  });

  it("sends nothing when the queue is empty", async () => {
    startUsage("it-usage-a");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushes on hide, then sends nothing while hidden", async () => {
    startUsage("it-usage-a");
    search();
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    search();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not start the interval in a hidden tab", async () => {
    visibility = "hidden";
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushes on pagehide", async () => {
    startUsage("it-usage-a");
    search();
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends nothing offline, and flushes when the connection returns", async () => {
    startUsage("it-usage-a");
    search();
    online = false;
    await vi.advanceTimersByTimeAsync(90_000);
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchMock).not.toHaveBeenCalled();
    online = true;
    window.dispatchEvent(new Event("online"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends one batch at a time", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("AbortController", undefined);
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("online"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up on a send after 15 s and backs off", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      sentAt.push(Date.now());
      return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    });
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(sentAt.map((t) => Math.round((t - NOW.getTime()) / 1000))).toEqual([30, 90]);
  });

  it("backs off 60, 120, 240, 300, 300 s after failures; the hide flush and online wait too; a 200 resets to 30 s", async () => {
    fetchMock.mockImplementation(async () => {
      sentAt.push(Date.now());
      return status(503);
    });
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(1_020_000);
    expect(sentAt.map((t) => Math.round((t - NOW.getTime()) / 1000))).toEqual([30, 90, 210, 450, 750, 1050]);
    expect(stored()!.r).toHaveLength(1);

    fetchMock.mockImplementation(async () => {
      sentAt.push(Date.now());
      return ok();
    });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sentAt).toHaveLength(7);
    expect(stored()!.r).toHaveLength(0);
    search();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sentAt).toHaveLength(8);
  });

  it.each([[429], [500], [502]])("a %s keeps the records and backs off", async (code) => {
    fetchMock.mockResolvedValue(status(code));
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored()!.r).toHaveLength(1);
  });

  it("a network error keeps the records and backs off", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored()!.r).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a 200 whose body read is aborted keeps the batch, backs off and keeps recording", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      redirected: false,
      json: () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")),
    });
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored()!.r).toHaveLength(1);
    search();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBatch(1)).toHaveLength(2);
  });

  it("a 200 removes only the records it sent", async () => {
    let answer!: (res: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    startUsage("it-usage-a");
    search(2);
    await vi.advanceTimersByTimeAsync(30_000);
    recordUsageAction("more-opened");
    answer(ok());
    await vi.advanceTimersByTimeAsync(0);
    expect(stored()!.r).toEqual([expect.objectContaining({ action: "more-opened" })]);
  });

  it.each([[400], [413], [404]])("a %s drops that batch only and is not retried", async (code) => {
    fetchMock.mockResolvedValueOnce(status(code));
    startUsage("it-usage-a");
    search(150);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(stored()!.r).toHaveLength(50);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBatch(1)).toHaveLength(50);
  });

  const holds: [string, () => unknown][] = [
    ["a 401", () => status(401)],
    ["a 403", () => status(403)],
    ["a 200 whose body is not JSON", () => new Response("<html>sign in</html>", { status: 200 })],
    ["a 200 that is not the endpoint's answer", () => ok({ ok: true })],
    ["a followed redirect", () => ({ ok: true, status: 200, redirected: true, json: async () => ({ recording: true }) })],
  ];

  it.each(holds)("%s keeps every record and sends nothing more in this document", async (_, answer) => {
    let reply!: () => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => (reply = () => resolve(answer()))));
    startUsage("it-usage-a");
    search(150);
    await vi.advanceTimersByTimeAsync(30_000);
    recordUsageAction("more-opened");
    reply();
    await vi.advanceTimersByTimeAsync(0);
    expect(raw()).toMatchObject({ u: "it-usage-a" });
    expect(raw()!.r).toHaveLength(151);
    expect(vi.getTimerCount()).toBe(0);
    search();
    startUsage("it-usage-a");
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(raw()!.r).toHaveLength(151);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after a 401, the next page load sends the records for the same account", async () => {
    fetchMock.mockResolvedValueOnce(status(401));
    startUsage("it-usage-a");
    search(3);
    await vi.advanceTimersByTimeAsync(30_000);
    resetUsageForTests();
    startUsage("it-usage-a");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBatch(1)).toHaveLength(3);
    expect(raw()!.r).toEqual([]);
  });

  it("after a 401, the next page load discards the records for another account", async () => {
    fetchMock.mockResolvedValueOnce(status(401));
    startUsage("it-usage-a");
    search(3);
    await vi.advanceTimersByTimeAsync(30_000);
    resetUsageForTests();
    startUsage("it-usage-b");
    expect(raw()).toEqual({ u: "it-usage-b", r: [] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recording off empties the queue and stops recording for this document", async () => {
    fetchMock.mockResolvedValue(ok({ recording: false }));
    startUsage("it-usage-a");
    search(150);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(stored()!.r).toEqual([]);
    search();
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stored()!.r).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("startUsage twice installs one set of listeners", async () => {
    startUsage("it-usage-a");
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("one account per queue", () => {
  it("a stored queue of another account is discarded at start, never sent", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ u: "it-usage-a", r: [{ action: "search-opened", at: NOW.getTime(), mode: "desktop" }] }));
    startUsage("it-usage-b");
    recordUsageAction("more-opened");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBatch()).toEqual([expect.objectContaining({ action: "more-opened" })]);
  });

  it("records in memory are cleared when the account changes", async () => {
    startUsage("it-usage-a");
    search(2);
    startUsage("it-usage-b");
    recordUsageAction("more-opened");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sentBatch()).toEqual([expect.objectContaining({ action: "more-opened" })]);
    expect(raw()).toEqual({ u: "it-usage-b", r: [] });
  });

  it("when another tab signs in as someone else, this one stops and never overwrites or sends", async () => {
    startUsage("it-usage-a");
    search(2);
    window.localStorage.setItem(KEY, JSON.stringify({ u: "it-usage-b", r: [] }));
    vi.advanceTimersByTime(2_000);
    search();
    await vi.advanceTimersByTimeAsync(120_000);
    window.dispatchEvent(new Event("pagehide"));
    expect(raw()).toEqual({ u: "it-usage-b", r: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("when another tab signs out, this one stops", async () => {
    startUsage("it-usage-a");
    search();
    window.localStorage.removeItem(KEY);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(raw()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a queue persisted before another tab signed in is not sent by this one", async () => {
    startUsage("it-usage-a");
    search(3);
    vi.advanceTimersByTime(2_000);
    window.localStorage.setItem(KEY, JSON.stringify({ u: "it-usage-b", r: [] }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("what a record holds", () => {
  it("an action carries the Trip on screen and its phase today", () => {
    startUsage("it-usage-a");
    setUsageTrip(TRIP);
    recordUsageAction("day-map-opened");
    expect(stored()!.r).toEqual([{ action: "day-map-opened", at: NOW.getTime(), mode: "desktop", tripId: "it-usage-trip", phase: "travelling" }]);
  });

  it("the share link opened never carries a Trip", () => {
    startUsage("it-usage-a");
    setUsageTrip(TRIP);
    recordUsageAction("share-link-opened");
    expect(stored()!.r[0]).toEqual({ action: "share-link-opened", at: NOW.getTime(), mode: "desktop" });
  });

  it("a day change carries how and the day's offset from today in the Trip's zone", () => {
    startUsage("it-usage-a");
    setUsageTrip(TRIP);
    recordUsageDayChange("chip", "2026-12-03");
    recordUsageDayChange("keyboard", null);
    expect(stored()!.r).toEqual([
      expect.objectContaining({ action: "day-changed", detail: "chip", dayOffset: 2 }),
      expect.not.objectContaining({ dayOffset: expect.anything() }),
    ]);
  });

  it("never attaches a day offset to a record that lost its Trip", () => {
    startUsage("it-usage-a");
    const unphased = { ...TRIP, startDate: "not-a-date", endDate: null };
    setUsageTrip(unphased);
    recordUsageDayChange("chip", "2026-12-03");
    recordUsageScreen({ screen: "day", ms: null, saved: false, dayOffset: 2, trip: unphased });
    expect(stored()!.r).toEqual([
      { action: "day-changed", detail: "chip", at: NOW.getTime(), mode: "desktop" },
      { screen: "day", at: NOW.getTime(), mode: "desktop" },
    ]);
  });

  it("a screen carries its time to appear, saved copy and the Day's offset, omitting what it lacks", () => {
    startUsage("it-usage-a");
    recordUsageScreen({ screen: "day", ms: 412.6, saved: true, dayOffset: -2, trip: TRIP });
    recordUsageScreen({ screen: "plan", ms: null, saved: false, dayOffset: 3, trip: TRIP });
    recordUsageScreen({ screen: "trips", ms: 999_999, saved: false, dayOffset: null, trip: null });
    expect(stored()!.r).toEqual([
      { screen: "day", at: NOW.getTime(), mode: "desktop", tripId: "it-usage-trip", phase: "travelling", ms: 413, saved: true, dayOffset: -2 },
      { screen: "plan", at: NOW.getTime(), mode: "desktop", tripId: "it-usage-trip", phase: "travelling" },
      { screen: "trips", at: NOW.getTime(), mode: "desktop" },
    ]);
  });

  it("records nothing for a detail that does not fit, an unknown More row or a swipe that stayed put", () => {
    startUsage("it-usage-a");
    setUsageTrip(TRIP);
    recordUsageAction("review-started", "swipe");
    recordUsageAction("review-started");
    recordUsageAction("search-opened", "deep");
    recordUsageMoreRow("Nope");
    recordUsageMoreRow("toString");
    recordUsageSwipe("2026-12-02", "2026-12-02");
    recordUsageSwipe(null, "2026-12-02");
    expect(stored()!.r).toEqual([]);
  });

  it("records a More row by its label and a swipe onto another day", () => {
    startUsage("it-usage-a");
    setUsageTrip(TRIP);
    recordUsageMoreRow("Files");
    recordUsageSwipe("2026-12-02", "2026-12-01");
    expect(stored()!.r).toEqual([
      expect.objectContaining({ action: "more-row-chosen", detail: "files" }),
      expect.objectContaining({ action: "day-changed", detail: "swipe", dayOffset: 1 }),
    ]);
  });

  it("every record it builds is one the server keeps", () => {
    startUsage("it-usage-a");
    recordUsageScreen({ screen: "trips", ms: 120, saved: false, dayOffset: null, trip: null });
    recordUsageScreen({ screen: "whats-new", ms: null, saved: false, dayOffset: null, trip: null });
    recordUsageAction("search-opened");
    recordUsageAction("share-link-opened");
    setUsageTrip(TRIP);
    recordUsageScreen({ screen: "day", ms: 0, saved: true, dayOffset: 4, trip: TRIP });
    recordUsageScreen({ screen: "more", ms: 120_000, saved: false, dayOffset: null, trip: TRIP });
    recordUsageDayChange("swipe", "2026-12-05");
    recordUsageDayChange("arrow", null);
    recordUsageMoreRow("Share");
    recordUsageAction("review-started", "standard");
    recordUsageAction("attachment-opened");
    setUsageTrip({ ...TRIP, startDate: null, endDate: null, zone: "Not/AZone" });
    recordUsageAction("directions-tapped");
    const records = stored()!.r;
    expect(records).toHaveLength(12);
    expect(parseUsageBatch(JSON.parse(JSON.stringify({ records })), Date.now())!.records).toHaveLength(12);
  });

  it("openMode reads a coarse pointer and the installed app, once per document", () => {
    expect(openMode()).toBe("desktop");
    const matchMedia = vi.fn((q: string) => ({ matches: q === "(pointer: coarse)" }));
    vi.stubGlobal("matchMedia", matchMedia);
    resetUsageForTests();
    expect(openMode()).toBe("phone-browser");
    matchMedia.mockImplementation(() => ({ matches: true }));
    expect(openMode()).toBe("phone-browser");
    resetUsageForTests();
    expect(openMode()).toBe("phone-app");
    const broken = vi.fn(() => {
      throw new Error("no");
    });
    vi.stubGlobal("matchMedia", broken);
    resetUsageForTests();
    expect(openMode()).toBe("desktop");
    expect(openMode()).toBe("desktop");
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it("after the first call for a zone, a record call reads no media query, builds no formatter and touches no storage", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal("matchMedia", matchMedia);
    startUsage("it-usage-a");
    setUsageTrip(TRIP);
    recordUsageDayChange("chip", "2026-12-03");
    vi.advanceTimersByTime(2_000);
    matchMedia.mockClear();
    const formats = vi.spyOn(Intl, "DateTimeFormat");
    const storage = [vi.spyOn(Storage.prototype, "getItem"), vi.spyOn(Storage.prototype, "setItem"), vi.spyOn(Storage.prototype, "removeItem")];

    vi.setSystemTime(NOW.getTime() + 5);
    recordUsageDayChange("arrow", "2026-12-04");
    recordUsageSwipe("2026-12-05", "2026-12-04");
    recordUsageAction("day-map-opened");
    recordUsageScreen({ screen: "day", ms: 20, saved: false, dayOffset: 3, trip: TRIP });

    expect(matchMedia).not.toHaveBeenCalled();
    expect(formats).not.toHaveBeenCalled();
    for (const spy of storage) expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(raw()!.r.slice(1)).toEqual([
      expect.objectContaining({ action: "day-changed", detail: "arrow", dayOffset: 3, at: NOW.getTime() + 5, mode: "phone-app" }),
      expect.objectContaining({ action: "day-changed", detail: "swipe", dayOffset: 4 }),
      expect.objectContaining({ action: "day-map-opened", tripId: "it-usage-trip", phase: "travelling" }),
      expect.objectContaining({ screen: "day", dayOffset: 3 }),
    ]);
  });

  it("phaseNow and dayOffsetFrom read the device's clock", () => {
    expect(phaseNow(TRIP)).toBe("travelling");
    expect(phaseNow({ startDate: null, endDate: null, zone: "Etc/UTC" })).toBe("sketching");
    expect(dayOffsetFrom("2026-11-29", "Etc/UTC")).toBe(-2);
    expect(dayOffsetFrom("2026-12-02", "Pacific/Kiritimati")).toBe(0);
    expect(dayOffsetFrom("2031-01-01", "Etc/UTC")).toBeNull();
    expect(dayOffsetFrom("not a date", "Etc/UTC")).toBeNull();
  });
});

describe("sendUsageOnce", () => {
  it("sends nothing without a signed-in recorder's key", () => {
    sendUsageOnce("share-link-opened");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one record with no Trip when the key holds a user", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ u: "it-usage-a", r: [] }));
    setUsageTrip(TRIP);
    sendUsageOnce("share-link-opened");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", keepalive: true, referrerPolicy: "no-referrer" });
    expect(sentBatch()).toEqual([{ action: "share-link-opened", at: NOW.getTime(), mode: "desktop" }]);
    expect(stored()!.r).toEqual([]);
  });
});

describe("pausing every send from this browser", () => {
  it.each([
    ["a 401", () => status(401), "out"],
    ["recording off", () => ok({ recording: false }), "off"],
  ])("after %s, the Share page sends nothing until the signed-in recorder starts again", async (_, answer, flag) => {
    fetchMock.mockImplementationOnce(async () => answer());
    startUsage("it-usage-a");
    search();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(raw()).toMatchObject({ u: "it-usage-a", [flag]: true });

    resetUsageForTests();
    for (let i = 0; i < 10; i++) sendUsageOnce("share-link-opened");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetUsageForTests();
    startUsage("it-usage-a");
    expect(raw()).not.toHaveProperty(flag);
    resetUsageForTests();
    sendUsageOnce("share-link-opened");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a 401", () => status(401), "out"],
    ["recording off", () => ok({ recording: false }), "off"],
  ])("the Share page's own %s pauses it too", async (_, answer, flag) => {
    window.localStorage.setItem(KEY, JSON.stringify({ u: "it-usage-a", r: [] }));
    fetchMock.mockImplementationOnce(async () => answer());
    sendUsageOnce("share-link-opened");
    await vi.advanceTimersByTimeAsync(0);
    expect(raw()).toMatchObject({ [flag]: true });
    for (let i = 0; i < 10; i++) sendUsageOnce("share-link-opened");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a running document sends nothing once another tab has paused the queue", async () => {
    startUsage("it-usage-a");
    search(2);
    vi.advanceTimersByTime(2_000);
    window.localStorage.setItem(KEY, JSON.stringify({ ...raw(), out: true }));
    await vi.advanceTimersByTimeAsync(120_000);
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(raw()!.r).toHaveLength(2);
  });

  it("a pause survives another tab writing the queue", async () => {
    startUsage("it-usage-a");
    window.localStorage.setItem(KEY, JSON.stringify({ u: "it-usage-a", r: [], off: true }));
    search();
    vi.advanceTimersByTime(2_000);
    expect(raw()).toMatchObject({ off: true, r: [expect.objectContaining({ action: "search-opened" })] });
  });
});

describe("Usage can never break a page", () => {
  async function exercise() {
    startUsage("it-usage-a");
    setUsageTrip(TRIP);
    recordUsageScreen({ screen: "day", ms: 10, saved: false, dayOffset: 1, trip: TRIP });
    recordUsageAction("search-opened");
    recordUsageDayChange("arrow", "2026-12-02");
    recordUsageSwipe("2026-12-03", "2026-12-02");
    recordUsageMoreRow("Files");
    openMode();
    phaseNow(TRIP);
    dayOffsetFrom("2026-12-02", "Etc/UTC");
    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("online"));
    setVisibility("hidden");
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ u: "it-usage-a", r: [] }));
    } catch {}
    sendUsageOnce("share-link-opened");
    forgetUsage();
    await vi.advanceTimersByTimeAsync(400_000);
  }

  // Plain functions, not vi.fn: a vi.fn attaches its own handlers to a promise
  // it returns, which would hide a rejection the module failed to catch.
  it("nothing throws and no rejection goes unhandled with fetch, matchMedia and localStorage broken", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      for (const breakIt of [
        () => vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch"))),
        () =>
          vi.stubGlobal("fetch", () => {
            throw new TypeError("fetch is broken");
          }),
        () => vi.stubGlobal("fetch", undefined),
        () => vi.stubGlobal("fetch", () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("bad body")) })),
        () => vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 503, json: () => Promise.reject(new Error("bad body")) })),
        () => vi.stubGlobal("matchMedia", undefined),
        () =>
          vi.stubGlobal("matchMedia", () => {
            throw new Error("matchMedia is broken");
          }),
        () => {
          vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("SecurityError");
          });
          vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
          });
          vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
            throw new Error("SecurityError");
          });
        },
      ]) {
        resetUsageForTests();
        visibility = "visible";
        breakIt();
        await expect(exercise()).resolves.toBeUndefined();
        vi.restoreAllMocks();
        vi.stubGlobal("fetch", fetchMock);
      }
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("is inert while the server renders", async () => {
    vi.stubGlobal("window", undefined);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    startUsage("it-usage-a");
    setUsageTrip(TRIP);
    recordUsageScreen({ screen: "trips", ms: null, saved: false, dayOffset: null, trip: null });
    recordUsageAction("search-opened");
    recordUsageDayChange("chip", "2026-12-02");
    recordUsageMoreRow("Files");
    sendUsageOnce("share-link-opened");
    forgetUsage();
    expect(openMode()).toBe("desktop");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
