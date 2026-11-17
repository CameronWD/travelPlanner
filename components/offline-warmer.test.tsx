import { it, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { render, act } from "@testing-library/react";
import { OfflineWarmer } from "./offline-warmer";
import { currentBuildId, getStatus, requestWarm, resetOfflineStatus, subscribe } from "@/lib/offline-status";

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
    value: {
      controller: hasController ? { postMessage } : null,
      addEventListener: (type: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (type: string, cb: () => void) => listeners.delete(cb),
    },
  });
}

const listeners = new Set<() => void>();
const postMessage = vi.fn();

function installController() {
  (navigator.serviceWorker as unknown as { controller: unknown }).controller = { postMessage };
  for (const cb of [...listeners]) cb();
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

/** A save recorded under this build (what finishWarm writes). */
function markSaved(tripId: string, at: number, build: string = currentBuildId()) {
  window.localStorage.setItem(`teepee.offline.savedAt.${tripId}`, String(at));
  window.localStorage.setItem(`teepee.offline.savedBuild.${tripId}`, build);
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
    fetchMock = vi.fn().mockImplementation(async () => new Response("", { status: 200 }));
    listeners.clear();
    postMessage.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    restoreIdleCb = stubIdleCallbackSync();
    resetOfflineStatus();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/attachments/new?offline=1", { cache: "no-store" });
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

  it("fetches Attachments and the cover with the offline=1 flag, and pages without it", async () => {
    stubNavigator({ onLine: true, hasController: true });
    vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });

    render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/api/attachments/a1", "/api/trips/t1/cover?v=k"]} />);

    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/trips/t1",
      "/api/attachments/a1?offline=1",
      "/api/trips/t1/cover?v=k&offline=1",
    ]);
  });

  it("skips a file the cache already answers under its plain path", async () => {
    stubNavigator({ onLine: true, hasController: true });
    const matchMock = vi.fn(async (p: string) => (p === "/api/trips/t1/cover?v=k" ? new Response("") : undefined));
    vi.stubGlobal("caches", { match: matchMock });

    render(<OfflineWarmer tripId="t1" paths={["/api/trips/t1/cover?v=k", "/api/attachments/a1"]} />);

    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(matchMock).toHaveBeenCalledWith("/api/trips/t1/cover?v=k");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/attachments/a1?offline=1"]);
  });

  it("a warm cut short by unmount does not leave the status stuck on saving", async () => {
    stubNavigator({ onLine: true, hasController: true });
    fetchMock.mockImplementation(() => new Promise<Response>(() => {})); // never resolves
    const { unmount } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saving"));

    unmount();

    expect(getStatus("t1").state).toBe("idle");
  });

  describe("counting what was saved", () => {
    it("a rejected page and a 500 page are two page failures, and no save is stamped", async () => {
      stubNavigator({ onLine: true, hasController: true });
      fetchMock
        .mockImplementationOnce(async () => new Response("", { status: 200 }))
        .mockImplementationOnce(async () => {
          throw new TypeError("offline");
        })
        .mockImplementationOnce(async () => new Response("", { status: 500 }));

      render(<OfflineWarmer tripId="t1" paths={["/a", "/b", "/c"]} />);

      await vi.waitFor(() => expect(getStatus("t1").total).toBe(3));
      expect(getStatus("t1")).toMatchObject({ state: "saved", total: 3, saved: 1, savedAt: null });
      expect(window.localStorage.getItem("teepee.offline.savedAt.t1")).toBeNull();
    });

    it("a Trip with no Attachments has a total equal to its page count", async () => {
      stubNavigator({ onLine: true, hasController: true });
      render(<OfflineWarmer tripId="t1" paths={["/a", "/b", "/c"]} />);
      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 3, saved: 3 }));
      expect(getStatus("t1").savedAt).toEqual(expect.any(Number));
    });

    it("an already-cached file counts as saved", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async (p: string) => (p === "/api/attachments/a1" ? new Response("") : undefined)) });
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/api/attachments/a1"]} />);
      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 2, saved: 2 }));
    });

    it("a file answered with a redirect, or over the serve limit, is not saved", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
      const redirected = new Response("", { status: 200 });
      Object.defineProperty(redirected, "redirected", { value: true });
      fetchMock
        .mockImplementationOnce(async () => redirected)
        .mockImplementationOnce(async () => new Response("", { status: 413 }));
      render(<OfflineWarmer tripId="t1" paths={["/api/attachments/a1", "/api/attachments/a2"]} />);
      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 2, saved: 0 }));
    });

    it("a cached file that is a redirected response counts as missing and is fetched again", async () => {
      stubNavigator({ onLine: true, hasController: true });
      const stale = new Response("");
      Object.defineProperty(stale, "redirected", { value: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => stale) });
      render(<OfflineWarmer tripId="t1" paths={["/api/attachments/a1"]} />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/attachments/a1?offline=1", { cache: "no-store" }));
      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 1, saved: 1 }));
    });

    it("a save that lost only a file is not warmed again inside the 6 hours", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async (p: string) => (p.startsWith("/trips/") ? new Response("") : undefined)) });
      fetchMock.mockImplementation(async (url: string) => new Response("", { status: url.includes("/api/attachments/") ? 413 : 200 }));
      markSaved("t1", Date.now() - 60 * 60_000);
      window.localStorage.setItem("teepee.offline.counts.t1", JSON.stringify({ total: 2, saved: 1, at: Date.now() - 60_000, pagesFailed: false }));
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/api/attachments/big"]} />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/attachments/big?offline=1", { cache: "no-store" }));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalledWith("/trips/t1", expect.anything());
    });

    it("a first run whose only loss is a file is stamped and counted short", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
      fetchMock.mockImplementation(async (url: string) => new Response("", { status: url.includes("/api/attachments/") ? 413 : 200 }));
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/api/attachments/big"]} />);
      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 2, saved: 1, pagesFailed: false }));
      expect(getStatus("t1").savedAt).toEqual(expect.any(Number));
    });

    it("a save that lost a page is warmed again on the next open, even inside the 6 hours", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => new Response("")) });
      markSaved("t1", Date.now() - 60_000);
      window.localStorage.setItem("teepee.offline.counts.t1", JSON.stringify({ total: 4, saved: 3, at: Date.now() - 60_000, pagesFailed: true }));
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1"]} />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1", { cache: "no-store" }));
    });
  });

  describe("a browser with no service worker support", () => {
    it("mounts, does nothing and throws nothing", async () => {
      stubNavigator({ onLine: true, hasController: false });
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
      const { container } = render(<OfflineWarmer tripId="t1" paths={["/a"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(container.firstChild).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getStatus("t1").state).toBe("idle");
    });
  });

  describe("a freshly installed app", () => {
    it("warms once when the worker takes control after mount", async () => {
      stubNavigator({ onLine: true, hasController: false });
      render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => installController());

      await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not warm twice when a controller is already present at mount", async () => {
      stubNavigator({ onLine: true, hasController: true });
      render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
      await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
      act(() => installController());
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("telling the worker which Trip was opened", () => {
    it("posts the Trip's Home path on a run that fetches pages", async () => {
      stubNavigator({ onLine: true, hasController: true });
      render(<OfflineWarmer tripId="t1" paths={["/trips/rome", "/trips/rome/plan", "/api/attachments/a1"]} />);
      await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
      expect(postMessage).toHaveBeenCalledWith({ type: "LAST_TRIP", path: "/trips/rome" });
    });

    it("posts it on a run that skips the pages too", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => new Response("")) });
      markSaved("t1", Date.now() - 60_000);
      render(<OfflineWarmer tripId="t1" paths={["/trips/rome", "/trips/rome/plan"]} />);
      await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: "LAST_TRIP", path: "/trips/rome" }));
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("page scripts and styles (spec 2026-11-17 §B2)", () => {
    const page = '<link rel="stylesheet" href="/_next/static/chunks/a.css"/><script src="/_next/static/chunks/one.js" async=""></script><script src="https://cdn.example.com/_next/static/x.js"></script>';
    const serve = (pages: Record<string, string>) =>
      fetchMock.mockImplementation(async (url: string) => new Response(url in pages ? pages[url] : "", { status: 200 }));

    it("fetches the assets of a warmed page once, and counts them", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
      serve({ "/trips/t1": page, "/trips/t1/plan": page });

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/trips/t1/plan"]} />);

      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 4, saved: 4 }));
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "/trips/t1",
        "/_next/static/chunks/a.css",
        "/_next/static/chunks/one.js",
        "/trips/t1/plan",
      ]);
    });

    it("does not fetch an asset the cache already holds, but counts it", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async (p: string) => (p.endsWith(".css") ? new Response("") : undefined)) });
      serve({ "/trips/t1": page });

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1"]} />);

      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 3, saved: 3 }));
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/trips/t1", "/_next/static/chunks/one.js"]);
    });

    it("a failed asset is a page failure: counted, and no save is stamped", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
      fetchMock.mockImplementation(async (url: string) =>
        url === "/_next/static/chunks/one.js" ? new Response("", { status: 404 }) : new Response(url === "/trips/t1" ? page : "", { status: 200 }),
      );

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1"]} />);

      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 3, saved: 2, savedAt: null }));
    });

    it("fetches no assets for a file", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
      serve({ "/api/attachments/a1?offline=1": page });
      render(<OfflineWarmer tripId="t1" paths={["/api/attachments/a1"]} />);
      await vi.waitFor(() => expect(getStatus("t1")).toMatchObject({ total: 1, saved: 1 }));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("once per few hours (spec 2026-10-06 §A)", () => {
    const HOUR = 60 * 60 * 1000;

    it("skips the pages when the last full save is under 6 hours old, but still fetches an uncached file", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async (p: string) => (p === "/trips/t1/plan" ? new Response("") : undefined)) });
      const savedAt = Date.now() - HOUR;
      markSaved("t1", savedAt);

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan", "/api/attachments/new"]} />);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/attachments/new?offline=1", { cache: "no-store" }));
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
      markSaved("t1", savedAt);

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
      markSaved("t1", savedAt);

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/trips/t1/plan"]} />);

      await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getStatus("t1").savedAt).toBe(savedAt);
    });

    it("warms the pages anyway when the save is fresh but there is no Cache API to check", async () => {
      stubNavigator({ onLine: true, hasController: true });
      const savedAt = Date.now() - HOUR;
      markSaved("t1", savedAt);
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" }));
    });

    it("warms the pages again once the last save is 6 hours old", async () => {
      stubNavigator({ onLine: true, hasController: true });
      markSaved("t1", Date.now() - 7 * HOUR);
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" }));
    });

    it("Save again warms the pages even inside the 6 hours", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => new Response("")) });
      const savedAt = Date.now() - HOUR;
      markSaved("t1", savedAt);
      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => requestWarm("t1"));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" }));
      await vi.waitFor(() => expect(getStatus("t1").savedAt).toBeGreaterThan(savedAt));
    });

    it("re-warms the pages on the first open after a deploy, even inside the 6 hours (final review item 1b)", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "b2");
      vi.stubGlobal("caches", { match: vi.fn(async () => new Response("")) });
      const savedAt = Date.now() - HOUR;
      markSaved("t1", savedAt, "b1");

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1", "/trips/t1/plan"]} />);

      await vi.waitFor(() => expect(getStatus("t1").savedAt).toBeGreaterThan(savedAt));
      expect(fetchMock).toHaveBeenCalledWith("/trips/t1", { cache: "no-store" });
      expect(fetchMock).toHaveBeenCalledWith("/trips/t1/plan", { cache: "no-store" });
      expect(getStatus("t1").savedBuild).toBe("b2");
      expect(window.localStorage.getItem("teepee.offline.savedBuild.t1")).toBe("b2");
    });

    it("treats an old save with no recorded build as stale", async () => {
      stubNavigator({ onLine: true, hasController: true });
      vi.stubGlobal("caches", { match: vi.fn(async () => new Response("")) });
      const savedAt = Date.now() - HOUR;
      window.localStorage.setItem("teepee.offline.savedAt.t1", String(savedAt));

      render(<OfflineWarmer tripId="t1" paths={["/trips/t1/plan"]} />);

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
