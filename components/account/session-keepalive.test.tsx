import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionKeepalive } from "@/components/account/session-keepalive";

const STAMP_KEY = "teepee.session.keepaliveAt";
const HOUR = 60 * 60 * 1000;

const fetchMock = vi.fn();

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-01T09:00:00Z"));
  localStorage.clear();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SessionKeepalive", () => {
  it("posts to /api/auth-keepalive once on mount", async () => {
    render(<SessionKeepalive />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth-keepalive", { method: "POST" });
  });

  it("does not post again within 24 hours, on a remount or when the tab comes back", async () => {
    const first = render(<SessionKeepalive />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();

    vi.setSystemTime(Date.now() + 23 * HOUR);
    render(<SessionKeepalive />);
    await act(async () => {
      setVisibility("hidden");
      setVisibility("visible");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts when the tab becomes visible once the stored stamp is older than 24 hours", async () => {
    localStorage.setItem(STAMP_KEY, String(Date.now()));
    render(<SessionKeepalive />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 25 * HOUR);
    await act(async () => {
      setVisibility("hidden");
      setVisibility("visible");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("keeps no stamp after a failed post, so the next visit tries again, and stays silent", async () => {
    const errorSpy = vi.spyOn(console, "error");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<SessionKeepalive />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      setVisibility("hidden");
      setVisibility("visible");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
