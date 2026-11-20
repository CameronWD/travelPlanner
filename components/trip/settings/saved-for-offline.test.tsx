import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

import { SavedForOffline } from "./saved-for-offline";
import { OfflineWarmer } from "@/components/offline-warmer";
import { beginWarm, finishWarm, forgetOfflineSaves, getStatus, recordFileShortfall, resetOfflineStatus } from "@/lib/offline-status";
import { toast } from "@/components/ui/use-toast";

// Same stubs as components/offline-warmer.test.tsx: the "Save again" test
// mounts the real warmer beside the row to prove the click re-runs the warm.
function stubNavigator({ onLine, hasController }: { onLine: boolean; hasController: boolean }) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      controller: hasController ? { postMessage: vi.fn() } : null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
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

  it("says Not saved yet when the warm never ran", () => {
    // A controller is stubbed here purely so this test's own concern (the
    // label) isn't entangled with the no-controller disabled state, which
    // gets its own test below.
    stubNavigator({ onLine: true, hasController: true });
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
    stubNavigator({ onLine: true, hasController: true });
    window.localStorage.setItem("teepee.offline.savedAt.t1", String(Date.now() - 5 * 60_000));
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · 5m ago");
    expect(screen.getByRole("button", { name: "Save again" })).toBeEnabled();
  });

  it("follows the store: a finished warm flips Not saved yet to Saved for offline · just now", () => {
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    act(() => finishWarm("t1", { total: 2, saved: 2, pagesFailed: 0 }, Date.now()));
    expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · just now");
  });

  it("says how much was saved when a run came up short", () => {
    stubNavigator({ onLine: true, hasController: true });
    finishWarm("t1", { total: 46, saved: 40, pagesFailed: 6 }, Date.now() - 2 * 60 * 60_000);
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved 40 of 46 · 2h ago");
    expect(screen.getByRole("button", { name: "Save again" })).toBeEnabled();
  });

  it("a file-only shortfall reads short with the time that run finished", () => {
    stubNavigator({ onLine: true, hasController: true });
    window.localStorage.setItem("teepee.offline.savedAt.t1", String(Date.now() - 5 * 60 * 60_000));
    finishWarm("t1", { total: 46, saved: 45, pagesFailed: 0 }, Date.now() - 60 * 60_000);
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved 45 of 46 · 1h ago");
    expect(screen.getByRole("button", { name: "Save again" })).toBeEnabled();
  });

  it("never says 0 of 0", () => {
    stubNavigator({ onLine: true, hasController: true });
    finishWarm("t1", { total: 0, saved: 0, pagesFailed: 0 }, Date.now());
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).not.toHaveTextContent("0 of 0");
    expect(screen.getByRole("status")).toHaveTextContent("Saved for offline");
  });

  it("Save again re-runs the warm: every path is fetched again and the row passes through Saving…", async () => {
    const user = userEvent.setup();
    stubNavigator({ onLine: true, hasController: true });
    const fetchMock = vi.fn().mockImplementation(async () => new Response("", { status: 200 }));
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

  it("Save again while offline runs no fetch and leaves the status as it was", async () => {
    stubNavigator({ onLine: false, hasController: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <>
        <OfflineWarmer tripId="t1" paths={["/trips/t1"]} />
        <SavedForOffline tripId="t1" />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    await userEvent.click(screen.getByRole("button", { name: "Save again" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    expect(getStatus("t1").state).not.toBe("saving");
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "You’re offline. Plan changes need a connection.",
      }),
    );
  });

  it("disables Save again and shows a hint when there is no service-worker controller", () => {
    stubNavigator({ onLine: true, hasController: false });
    render(<SavedForOffline tripId="t1" />);
    const button = screen.getByRole("button", { name: "Save again" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Offline saving needs the installed app.")).toBeInTheDocument();
  });

  it("goes back to Not saved yet when sign-out forgets the save", () => {
    stubNavigator({ onLine: true, hasController: true });
    finishWarm("t1", { total: 3, saved: 3, pagesFailed: 0 });
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved for offline");
    act(() => forgetOfflineSaves());
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
  });

  it("reads Saved N of M after a later run lost a file", () => {
    stubNavigator({ onLine: true, hasController: true });
    finishWarm("t1", { total: 12, saved: 12, pagesFailed: 0 });
    render(<SavedForOffline tripId="t1" />);
    act(() => recordFileShortfall("t1", { total: 2, saved: 1 }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved 11 of 12");
  });

  describe("after a refresh that failed on a dead connection", () => {
    const THREE_HOURS = 3 * 60 * 60_000;

    it("every page still held from the earlier save: reads as it did before, with the earlier time", () => {
      stubNavigator({ onLine: true, hasController: true });
      finishWarm("t1", { total: 45, saved: 45, pagesFailed: 0 }, Date.now() - THREE_HOURS);
      finishWarm("t1", { total: 45, saved: 45, pagesFailed: 33 });
      render(<SavedForOffline tripId="t1" />);
      expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · 3h ago");
      expect(getStatus("t1").pagesFailed).toBe(true);
    });

    it("some pages with no copy at all: reads Saved N of M with the run's time", () => {
      stubNavigator({ onLine: true, hasController: true });
      finishWarm("t1", { total: 45, saved: 45, pagesFailed: 0 }, Date.now() - THREE_HOURS);
      finishWarm("t1", { total: 45, saved: 40, pagesFailed: 33 });
      render(<SavedForOffline tripId="t1" />);
      expect(screen.getByRole("status")).toHaveTextContent("Saved 40 of 45 · just now");
    });

    it("a first run that failed entirely: never reads Saved for offline", () => {
      stubNavigator({ onLine: true, hasController: true });
      finishWarm("t1", { total: 45, saved: 0, pagesFailed: 45 });
      render(<SavedForOffline tripId="t1" />);
      expect(screen.getByRole("status")).toHaveTextContent("Saved 0 of 45");
      expect(screen.getByRole("status")).not.toHaveTextContent("Saved for offline");
    });

    it("a first run whose pages were all older copies: still not Saved for offline", () => {
      stubNavigator({ onLine: true, hasController: true });
      finishWarm("t1", { total: 45, saved: 45, pagesFailed: 45 });
      render(<SavedForOffline tripId="t1" />);
      expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    });
  });
});
