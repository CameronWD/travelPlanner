import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ toast }));

import { REVIEW_FAILED_TITLE, REVIEW_POLL_MS, ReviewPoller } from "./review-poller";
import { watchReview } from "./watched-reviews";

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
  toast.mockReset();
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

describe("ReviewPoller toast (final wave I2: say why a watched run failed)", () => {
  const BUSY = "Claude was busy, so this Review stopped. Start it again in a few minutes.";

  it("toasts the stored reason once when the run it saw running turns FAILED", () => {
    const { rerender } = render(<ReviewPoller active runningId="rv-1" latestRun={{ id: "rv-1", status: "RUNNING", error: null }} />);
    expect(toast).not.toHaveBeenCalled();
    rerender(<ReviewPoller active={false} runningId={null} latestRun={{ id: "rv-1", status: "FAILED", error: BUSY }} />);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: REVIEW_FAILED_TITLE, description: BUSY });
    // A later refresh with the same history doesn't toast again.
    rerender(<ReviewPoller active={false} runningId={null} latestRun={{ id: "rv-1", status: "FAILED", error: BUSY }} />);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("toasts a run this tab started that failed before the poller ever saw it running", () => {
    watchReview("rv-2");
    render(<ReviewPoller active={false} runningId={null} latestRun={{ id: "rv-2", status: "FAILED", error: BUSY }} />);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: BUSY }));
  });

  it("stays quiet for an old failure in the history, and for a watched run that finished", () => {
    render(<ReviewPoller active={false} runningId={null} latestRun={{ id: "rv-old", status: "FAILED", error: BUSY }} />);
    const { rerender } = render(<ReviewPoller active runningId="rv-3" latestRun={{ id: "rv-3", status: "RUNNING", error: null }} />);
    rerender(<ReviewPoller active={false} runningId={null} latestRun={{ id: "rv-3", status: "DONE", error: null }} />);
    expect(toast).not.toHaveBeenCalled();
  });
});
