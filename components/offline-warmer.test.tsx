import { it, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { render } from "@testing-library/react";
import { OfflineWarmer } from "./offline-warmer";

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreIdleCb();
  });

  it("renders nothing (null)", () => {
    stubNavigator({ onLine: true, hasController: true });
    const { container } = render(<OfflineWarmer paths={["/a", "/b"]} />);
    expect(container.firstChild).toBeNull();
  });

  it("calls fetch once per path when online with an active SW controller", async () => {
    stubNavigator({ onLine: true, hasController: true });
    render(<OfflineWarmer paths={["/a", "/b"]} />);

    // requestIdleCallback was stubbed synchronous, but the warm() fn is async
    // (it awaits each fetch). Wait for all microtasks to drain.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock).toHaveBeenCalledWith("/a", { cache: "no-store" });
    expect(fetchMock).toHaveBeenCalledWith("/b", { cache: "no-store" });
  });

  it("does NOT fetch when navigator.onLine is false", async () => {
    stubNavigator({ onLine: false, hasController: true });
    render(<OfflineWarmer paths={["/a", "/b"]} />);

    // Allow any pending microtasks to drain, then assert no calls.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT fetch when there is no SW controller", async () => {
    stubNavigator({ onLine: true, hasController: false });
    render(<OfflineWarmer paths={["/a", "/b"]} />);

    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
