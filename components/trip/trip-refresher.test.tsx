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

function returnToApp(afterMs: number) {
  act(() => {
    vi.advanceTimersByTime(afterMs);
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("TripRefresher", () => {
  it("refreshes when the app is visible again after more than five minutes", () => {
    render(<TripRefresher />);
    returnToApp(6 * 60 * 1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves a quick return alone", () => {
    render(<TripRefresher />);
    returnToApp(4 * 60 * 1000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the connection comes back", () => {
    render(<TripRefresher />);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes when a refresh is requested", () => {
    render(<TripRefresher />);
    act(() => requestTripRefresh());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("drops a wanted refresh while offline", () => {
    setOnline(false);
    render(<TripRefresher />);
    act(() => requestTripRefresh());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("holds a wanted refresh while a dialog is open and runs it once the dialog is gone", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    render(<TripRefresher />);
    act(() => requestTripRefresh());
    expect(refresh).not.toHaveBeenCalled();
    dialog.remove();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("drops a held refresh when the connection is lost before the dialog closes", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    render(<TripRefresher />);
    act(() => requestTripRefresh());
    setOnline(false);
    dialog.remove();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing after unmount", () => {
    const { unmount } = render(<TripRefresher />);
    unmount();
    act(() => {
      requestTripRefresh();
      window.dispatchEvent(new Event("online"));
    });
    returnToApp(6 * 60 * 1000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
