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

  it("restarts the warm when re-rendered with a different path list", async () => {
    stubNavigator({ onLine: true, hasController: true });
    const { rerender } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    rerender(<OfflineWarmer tripId="t1" paths={["/a", "/c"]} />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/a", { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/c", { cache: "no-store" });
  });

  it("skips paths caches.match already answers", async () => {
    stubNavigator({ onLine: true, hasController: true });
    const matchMock = vi.fn(async (p: string) => (p === "/cached" ? new Response("") : undefined));
    vi.stubGlobal("caches", { match: matchMock });

    render(<OfflineWarmer tripId="t1" paths={["/cached", "/fresh"]} />);

    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/fresh", { cache: "no-store" });
  });

  it("a warm cut short by unmount does not leave the status stuck on saving", async () => {
    stubNavigator({ onLine: true, hasController: true });
    fetchMock.mockImplementation(() => new Promise<Response>(() => {})); // never resolves
    const { unmount } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saving"));

    unmount();

    expect(getStatus("t1").state).toBe("idle");
  });
});
