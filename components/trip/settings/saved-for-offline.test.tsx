import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedForOffline } from "./saved-for-offline";
import { OfflineWarmer } from "@/components/offline-warmer";
import { beginWarm, finishWarm, getStatus, resetOfflineStatus } from "@/lib/offline-status";

// Same stubs as components/offline-warmer.test.tsx: the "Save again" test
// mounts the real warmer beside the row to prove the click re-runs the warm.
function stubNavigator({ onLine, hasController }: { onLine: boolean; hasController: boolean }) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: hasController ? { controller: { postMessage: vi.fn() } } : { controller: null },
  });
}

function stubIdleCallbackSync() {
  const win = window as unknown as Record<string, unknown>;
  const original = win.requestIdleCallback;
  win.requestIdleCallback = (cb: () => void) => {
    cb();
    return 0;
  };
  return () => {
    if (original === undefined) delete win.requestIdleCallback;
    else win.requestIdleCallback = original;
  };
}

describe("SavedForOffline", () => {
  let restoreIdleCb: () => void;

  beforeEach(() => {
    resetOfflineStatus();
    window.localStorage.clear();
    restoreIdleCb = stubIdleCallbackSync();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreIdleCb();
  });

  it("says Not saved yet when the warm never ran (no SW, dev)", () => {
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    expect(screen.getByRole("button", { name: "Save again" })).toBeEnabled();
  });

  it("says Saving… with the button busy while a warm runs", () => {
    beginWarm("t1");
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    const button = screen.getByRole("button", { name: "Save again" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("says Saved for offline · <relative time> from the stored timestamp", () => {
    window.localStorage.setItem("teepee.offline.savedAt.t1", String(Date.now() - 5 * 60_000));
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · 5m ago");
    expect(screen.getByRole("button", { name: "Save again" })).toBeEnabled();
  });

  it("follows the store: a finished warm flips Not saved yet to Saved for offline · just now", () => {
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    act(() => finishWarm("t1", Date.now()));
    expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · just now");
  });

  it("Save again re-runs the warm: every path is fetched again and the row passes through Saving…", async () => {
    const user = userEvent.setup();
    stubNavigator({ onLine: true, hasController: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <OfflineWarmer tripId="t1" paths={["/a", "/b"]} />
        <SavedForOffline tripId="t1" />
      </>,
    );
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Save again" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · just now"));
  });
});
