import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { REVIEW_POLL_MS, ReviewPoller } from "./review-poller";

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("ReviewPoller (R11: refresh while a Review runs)", () => {
  it("refreshes every 10 seconds while active", () => {
    expect(REVIEW_POLL_MS).toBe(10_000);
    render(<ReviewPoller active />);
    vi.advanceTimersByTime(9_999);
    expect(router.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(router.refresh).toHaveBeenCalledTimes(3);
  });
  it("does nothing when inactive, and stops when it turns inactive or unmounts", () => {
    const { rerender, unmount } = render(<ReviewPoller active={false} />);
    vi.advanceTimersByTime(30_000);
    expect(router.refresh).not.toHaveBeenCalled();
    rerender(<ReviewPoller active />);
    vi.advanceTimersByTime(10_000);
    rerender(<ReviewPoller active={false} />);
    vi.advanceTimersByTime(30_000);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    rerender(<ReviewPoller active />);
    unmount();
    vi.advanceTimersByTime(30_000);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("skips a tick while the tab is hidden", () => {
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<ReviewPoller active />);
    vi.advanceTimersByTime(10_000);
    expect(router.refresh).not.toHaveBeenCalled();
    spy.mockReturnValue("visible");
    vi.advanceTimersByTime(10_000);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
