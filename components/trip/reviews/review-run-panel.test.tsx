import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const startReview = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/reviews", () => ({ startReview: (...a: unknown[]) => startReview(...a) }));
const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => toastMock(...a) }));
vi.mock("@/lib/tz", async (orig) => ({ ...(await orig<typeof import("@/lib/tz")>()), deviceTimeZone: () => "Australia/Brisbane" }));

import { ReviewRunPanel, START_FAILED } from "./review-run-panel";
import { takeWatchedReview } from "./watched-reviews";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] }); // Date only, so userEvent's timers stay real
  vi.setSystemTime(new Date("2026-10-18T00:00:00Z")); // Sunday, Brisbane
});
afterEach(() => vi.useRealTimers());

const renderPanel = (state: Parameters<typeof ReviewRunPanel>[0]["state"]) =>
  render(<ReviewRunPanel tripId="t1" state={state} fallbackTimeZone="UTC" />);

describe("ReviewRunPanel (R12)", () => {
  it("Off: renders nothing", () => {
    const { container } = renderPanel({ kind: "hidden" });
    expect(container).toBeEmptyDOMElement();
  });

  it("ready: Standard Review starts a Standard run and refreshes", async () => {
    startReview.mockResolvedValue({ success: true, reviewId: "r9" });
    renderPanel({ kind: "ready" });
    await userEvent.click(screen.getByRole("button", { name: "Standard Review" }));
    expect(startReview).toHaveBeenCalledWith("t1", "STANDARD");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    // Watched, so a run that fails before the poller sees it still gets its toast (final wave I2).
    expect(takeWatchedReview("r9")).toBe(true);
  });

  it("re-enables the button once the post-start refresh settles (controller fix round 1, item 3)", async () => {
    // router.refresh() now runs inside startTransition's async callback
    // (React 19 keeps isPending true across its awaits), with the `finally`
    // that clears `pending` living inside that same callback — not a
    // separate effect, and not before the transition is handed its work.
    // A synchronous mock settles too fast for RTL/jsdom to observe the
    // mid-flight window itself; this pins the mechanism's end state: the
    // button is not left disabled forever once the transition resolves.
    startReview.mockResolvedValue({ success: true, reviewId: "r9" });
    renderPanel({ kind: "ready" });
    const btn = screen.getByRole("button", { name: "Standard Review" });
    await userEvent.click(btn);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("ready: Deep Review starts a Deep run", async () => {
    startReview.mockResolvedValue({ success: true, reviewId: "r9" });
    renderPanel({ kind: "ready" });
    await userEvent.click(screen.getByRole("button", { name: "Deep Review" }));
    expect(startReview).toHaveBeenCalledWith("t1", "DEEP");
  });

  it("a refusal says the server's reason and does not refresh", async () => {
    startReview.mockResolvedValue({ success: false, errors: { _: ["A Review is already running on this trip."] } });
    renderPanel({ kind: "ready" });
    await userEvent.click(screen.getByRole("button", { name: "Standard Review" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "A Review is already running on this trip." })));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("a rejection says START_FAILED", async () => {
    startReview.mockRejectedValue(new Error("network"));
    renderPanel({ kind: "ready" });
    await userEvent.click(screen.getByRole("button", { name: "Deep Review" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: START_FAILED })));
  });

  it("not set up: both buttons disabled, and says so", () => {
    renderPanel({ kind: "not-configured" });
    expect(screen.getByRole("button", { name: "Standard Review" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deep Review" })).toBeDisabled();
    expect(screen.getByText("Reviews are not set up")).toBeInTheDocument();
  });

  it("busy: both disabled while one runs on the Trip", () => {
    renderPanel({ kind: "busy" });
    expect(screen.getByRole("button", { name: "Standard Review" })).toBeDisabled();
    expect(screen.getByText("A Review is already running on this trip.")).toBeInTheDocument();
  });

  it("capped: one disabled button naming the day, in the device's zone", () => {
    renderPanel({ kind: "capped", nextAvailableAt: "2026-10-22T01:00:00.000Z" });
    expect(screen.getByRole("button", { name: "Next Review available Thursday" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Standard Review" })).toBeNull();
  });
});
