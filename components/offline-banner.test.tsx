import { it, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { OfflineBanner } from "./offline-banner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setOnline(onLine: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => onLine,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OfflineBanner", () => {
  beforeEach(() => {
    // Start each test online
    setOnline(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when online on mount", () => {
    setOnline(true);
    const { queryByRole } = render(<OfflineBanner />);
    expect(queryByRole("status")).toBeNull();
  });

  it("appears with offline text after an offline event", async () => {
    setOnline(true);
    const { queryByRole, getByRole } = render(<OfflineBanner />);

    // Flip to offline then dispatch the event
    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });

    const banner = getByRole("status");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toMatch(/offline/i);
    expect(banner.textContent).toMatch(/saved trip/i);
    // A Feedback note queues and sends itself later (ADR 0041), so the banner
    // must not claim that every change needs a connection.
    expect(banner.textContent).toMatch(/plan changes need a connection/i);
    expect(banner.textContent).toMatch(/feedback/i);

    // Keep the compiler happy
    void queryByRole;
  });

  it("disappears after a subsequent online event", async () => {
    setOnline(true);
    const { queryByRole } = render(<OfflineBanner />);

    // Go offline
    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => {
      expect(queryByRole("status")).not.toBeNull();
    });

    // Come back online
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(queryByRole("status")).toBeNull();
    });
  });
});
