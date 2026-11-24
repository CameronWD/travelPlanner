// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { TripRefresher } from "@/components/trip/trip-refresher";
import { requestTripRefresh } from "@/lib/trip-refresh";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

const probe = vi.fn();
const PROBE_URL = "/manifest.webmanifest";

function probeAnswers(status: number) {
  probe.mockResolvedValue({ ok: status >= 200 && status < 300, status });
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function returnToApp(afterMs: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(afterMs);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await settle();
}

async function requestAndSettle() {
  await act(async () => {
    requestTripRefresh();
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  probe.mockReset();
  probeAnswers(200);
  vi.stubGlobal("fetch", probe);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), ms);
    return controller.signal;
  });
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("TripRefresher", () => {
  it("refreshes when the app is visible again after more than five minutes", async () => {
    render(<TripRefresher />);
    await returnToApp(6 * 60 * 1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves a quick return alone", async () => {
    render(<TripRefresher />);
    await returnToApp(4 * 60 * 1000);
    expect(refresh).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });

  it("refreshes when the connection comes back", async () => {
    render(<TripRefresher />);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes when a refresh is requested", async () => {
    render(<TripRefresher />);
    await requestAndSettle();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("probes the manifest with a no-store HEAD before refreshing", async () => {
    render(<TripRefresher />);
    await requestAndSettle();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(
      PROBE_URL,
      expect.objectContaining({ method: "HEAD", cache: "no-store", signal: expect.any(AbortSignal) }),
    );
    expect(AbortSignal.timeout).toHaveBeenCalledWith(4000);
  });

  it("does not refresh when the probe fails, and tries again on the next request", async () => {
    probe.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<TripRefresher />);
    await requestAndSettle();
    expect(refresh).not.toHaveBeenCalled();
    probeAnswers(200);
    await requestAndSettle();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("does not refresh when the probe answers 503", async () => {
    probeAnswers(503);
    render(<TripRefresher />);
    await requestAndSettle();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh when the probe does not answer within four seconds", async () => {
    probe.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    render(<TripRefresher />);
    await requestAndSettle();
    await settle(3999);
    expect(refresh).not.toHaveBeenCalled();
    await settle(1);
    expect(refresh).not.toHaveBeenCalled();
    probeAnswers(200);
    await requestAndSettle();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("starts one probe and one refresh for two triggers while a probe is pending", async () => {
    let answer!: (value: { ok: boolean }) => void;
    probe.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<TripRefresher />);
    await requestAndSettle();
    await requestAndSettle();
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(probe).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true }));
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a probe that answers after unmount", async () => {
    let answer!: (value: { ok: boolean }) => void;
    probe.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { unmount } = render(<TripRefresher />);
    await requestAndSettle();
    unmount();
    await act(async () => answer({ ok: true }));
    await settle();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("drops a wanted refresh while offline", async () => {
    setOnline(false);
    render(<TripRefresher />);
    await requestAndSettle();
    expect(refresh).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });

  it("drops an answered probe when the connection was lost meanwhile", async () => {
    let answer!: (value: { ok: boolean }) => void;
    probe.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<TripRefresher />);
    await requestAndSettle();
    setOnline(false);
    await act(async () => answer({ ok: true }));
    await settle();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("holds an answered probe when a dialog opened meanwhile, and refreshes once it closes", async () => {
    let answer!: (value: { ok: boolean }) => void;
    probe.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<TripRefresher />);
    await requestAndSettle();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    await act(async () => answer({ ok: true }));
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    probeAnswers(200);
    dialog.remove();
    await settle(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("holds a wanted refresh while a dialog is open and runs it once the dialog is gone", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    render(<TripRefresher />);
    await requestAndSettle();
    expect(refresh).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    dialog.remove();
    await settle(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await settle(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("drops a held refresh when the connection is lost before the dialog closes", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    render(<TripRefresher />);
    await requestAndSettle();
    setOnline(false);
    dialog.remove();
    await settle(1000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing after unmount", async () => {
    const { unmount } = render(<TripRefresher />);
    unmount();
    await act(async () => {
      requestTripRefresh();
      window.dispatchEvent(new Event("online"));
    });
    await returnToApp(6 * 60 * 1000);
    expect(refresh).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });
});
