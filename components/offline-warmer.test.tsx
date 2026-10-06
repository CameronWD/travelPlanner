import { it, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { render, act } from "@testing-library/react";
import { OfflineWarmer } from "./offline-warmer";
import { getStatus, requestWarm, resetOfflineStatus, subscribe } from "@/lib/offline-status";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubNavigator({
  onLine,
  hasController,
}: {
  onLine: boolean;
  hasController: boolean;
}) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => onLine,
  });

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: hasController
      ? { controller: { postMessage: vi.fn() } }
      : { controller: null },
  });
}

// Stub requestIdleCallback to invoke the callback synchronously so we don't
// need timers — this makes the deferred-fetch tests deterministic without
// fake timer setup.
function stubIdleCallbackSync() {
  const win = window as unknown as Record<string, unknown>;
  const original = win.requestIdleCallback;
  win.requestIdleCallback = (cb: () => void) => {
    cb();
    return 0;
  };
  return () => {
    if (original === undefined) {
      delete win.requestIdleCallback;
    } else {
      win.requestIdleCallback = original;
    }
  };
}

function stubConnection(connection: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OfflineWarmer", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let restoreIdleCb: () => void;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    restoreIdleCb = stubIdleCallbackSync();
    resetOfflineStatus();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreIdleCb();
    stubConnection(undefined);
  });

  it("renders nothing (null)", () => {
    stubNavigator({ onLine: true, hasController: true });
    const { container } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    expect(container.firstChild).toBeNull();
  });

  it("calls fetch once per path when online with an active SW controller", async () => {
    stubNavigator({ onLine: true, hasController: true });
    render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);

    // requestIdleCallback was stubbed synchronous, but the warm() fn is async
    // (it awaits each fetch). Wait for all microtasks to drain.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock).toHaveBeenCalledWith("/a", { cache: "no-store" });
    expect(fetchMock).toHaveBeenCalledWith("/b", { cache: "no-store" });
  });

  it("does NOT fetch when navigator.onLine is false", async () => {
    stubNavigator({ onLine: false, hasController: true });
    render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);

    // Allow any pending microtasks to drain, then assert no calls.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT fetch when there is no SW controller", async () => {
    stubNavigator({ onLine: true, hasController: false });
    render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);

    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports saving while the fetches run and saved with a timestamp when they finish", async () => {
    stubNavigator({ onLine: true, hasController: true });
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { release = () => r(new Response(null, { status: 200 })); }));

    render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);

    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saving"));
    release();
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(getStatus("t1").savedAt).toEqual(expect.any(Number));
    expect(window.localStorage.getItem("teepee.offline.savedAt.t1")).not.toBeNull();
  });

  it("leaves the status idle when there is no SW controller (dev): Not saved yet", async () => {
    stubNavigator({ onLine: true, hasController: false });
    render(<OfflineWarmer tripId="t1" paths={["/a"]} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(getStatus("t1")).toMatchObject({ state: "idle", savedAt: null });
  });

  it("re-runs every fetch when requestWarm() is called for its trip (Save again)", async () => {
    stubNavigator({ onLine: true, hasController: true });
    render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => requestWarm("t1"));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
  });

  it("does not restart the warm when re-rendered with a new array of the same paths", async () => {
    stubNavigator({ onLine: true, hasController: true });
    const { rerender } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Watch every status change across the re-render: a restarted warm would
    // flip back through "saving" (the begin/cancel-or-finish pair this guards
    // against), even if it settled back on "saved" before we got to assert.
    const observedStates: string[] = [];
    const unsubscribe = subscribe(() => observedStates.push(getStatus("t1").state));

    // A fresh array instance, same contents — e.g. a server layout re-render.
    rerender(<OfflineWarmer tripId="t1" paths={["/a", "/b"].slice()} />);
    await new Promise((r) => setTimeout(r, 0));
    unsubscribe();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(observedStates).not.toContain("saving");
  });

  it("a new path list inside the 6 hours fetches only the new file, not the pages", async () => {
    stubNavigator({ onLine: true, hasController: true });
    // The pages are really cached (the fresh save is verified against the cache).
    vi.stubGlobal("caches", { match: vi.fn(async (p: string) => (p === "/a" ? new Response("") : undefined)) });
    const { rerender } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    rerender(<OfflineWarmer tripId="t1" paths={["/a", "/api/attachments/new"]} />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/attachments/new", { cache: "no-store" });
  });

  it("skips an already-cached Attachment route but still fetches a fresh path", async () => {
    stubNavigator({ onLine: true, hasController: true });
    const matchMock = vi.fn(async (p: string) =>
      p === "/api/attachments/abc" ? new Response("") : undefined,
    );
    vi.stubGlobal("caches", { match: matchMock });

    render(<OfflineWarmer tripId="t1" paths={["/api/attachments/abc", "/fresh"]} />);

    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/fresh", { cache: "no-store" });
  });

  it("still re-fetches a cached PAGE path (e.g. Summary) — only attachments/cover skip on cache hit", async () => {
    stubNavigator({ onLine: true, hasController: true });
    // Every path answers as already cached — if the warmer only guarded
    // attachment/cover routes, a page path like /trips/t1/summary must still
    // be fetched so "Save again" actually refreshes it.
    const matchMock = vi.fn(async () => new Response(""));
    vi.stubGlobal("caches", { match: matchMock });

    render(<OfflineWarmer tripId="t1" paths={["/trips/t1/summary", "/api/attachments/abc"]} />);

    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/trips/t1/summary", { cache: "no-store" });
  });

  it("a warm cut short by unmount does not leave the status stuck on saving", async () => {
    stubNavigator({ onLine: true, hasController: true });
    fetchMock.mockImplementation(() => new Promise<Response>(() => {})); // never resolves
    const { unmount } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saving"));

    unmount();

    expect(getStatus("t1").state).toBe("idle");
  });

  describe("once per few hours (spec 2026-10-06 §A)", () => {
    const HOUR = 60 * 60 * 1000;

    it("skips the pages when the last full save is under 6 hours old, but still fetches an uncached file", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async (p: string) => (p === "/trips/t1/plan" ? new Response("") : undefined)) });
      const savedAt = Date.now() - HOUR;
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(savedAt));

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan", "/api/attachments/new"]} />);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/attachments/new", { cache: "no-store" }));
      expect(fetchMock).not.toHaveBeenCalledWith("/trips/t1/plan", expect.anything());
      expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt });
    });

    it("warms the pages anyway when the save is fresh but the pages are gone from the cache (spec 2026-10-06 §T)", async () => {
      // A new worker's activate, sign-out's CLEAR_CACHE or browser eviction
      // can empty the cache while localStorage still says "saved an hour ago".
      stubNavigator({ onLine: true, hasController: true });
      const matchMock = vi.fn(async () => undefined);
      vi.stubGlobal("caches", { match: matchMock });
      const savedAt = Date.now() - HOUR;
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(savedAt));

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/trips/t1/plan"]} />);

      await vi.waitFor(() => expect(getStatus("t1").savedAt).toBeGreaterThan(savedAt));
      expect(matchMock).toHaveBeenCalledWith("/trips/t1");
      expect(fetchMock).toHaveBeenCalledWith("/trips/t1", { cache: "no-store" });
      expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" });
    });

    it("does not fetch the pages when the save is fresh and the first page is cached", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async (p: string) => (p === "/trips/t1" ? new Response("") : undefined)) });
      const savedAt = Date.now() - HOUR;
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(savedAt));

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/trips/t1/plan"]} />);

      await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getStatus("t1").savedAt).toBe(savedAt);
    });

    it("warms the pages anyway when the save is fresh but there is no Cache API to check", async () => {
      stubNavigator({ onLine: true, hasController: true });
      const savedAt = Date.now() - HOUR;
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(savedAt));
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" }));
    });

    it("warms the pages again once the last save is 6 hours old", async () => {
      stubNavigator({ onLine: true, hasController: true });
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(Date.now() - 7 * HOUR));
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" }));
    });

    it("Save again warms the pages even inside the 6 hours", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => new Response("")) });
      const savedAt = Date.now() - HOUR;
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(savedAt));
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => requestWarm("t1"));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" }));
      await vi.waitFor(() => expect(getStatus("t1").savedAt).toBeGreaterThan(savedAt));
    });

    it("skips the automatic warm on a Save-Data connection", async () => {
      stubNavigator({ onLine: true, hasController: true });
      stubConnection({ saveData: true });
      render(<OfflineWarmer tripId="t1" paths={["/a", "/api/attachments/x"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getStatus("t1").state).toBe("idle");
    });

    it("skips the automatic warm on 2G", async () => {
      stubNavigator({ onLine: true, hasController: true });
      stubConnection({ effectiveType: "2g" });
      render(<OfflineWarmer tripId="t1" paths={["/a"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still runs Save again on a constrained connection (an explicit request)", async () => {
      stubNavigator({ onLine: true, hasController: true });
      stubConnection({ saveData: true });
      render(<OfflineWarmer tripId="t1" paths={["/a"]} />);
      await new Promise((r) => setTimeout(r, 0));
      act(() => requestWarm("t1"));
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/a", { cache: "no-store" }));
    });
  });
});
