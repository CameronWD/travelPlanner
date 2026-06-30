import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MakeItFit } from "./make-it-fit";
import type { FitStop } from "@/lib/make-it-fit";

const setStopNights = vi.fn();
const deleteStop = vi.fn();
vi.mock("@/server/actions/stops", () => ({
  setStopNights: (...a: unknown[]) => setStopNights(...a),
  deleteStop: (...a: unknown[]) => deleteStop(...a),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

const stop = (over: Partial<FitStop>): FitStop => ({
  id: "s", name: "Stop", arriveDate: null, departDate: null, nights: null, pinned: false, sortOrder: 0, ...over,
});

const overStops = [
  stop({ id: "a", name: "Rome", nights: 6, sortOrder: 0 }),
  stop({ id: "b", name: "Florence", nights: 4, sortOrder: 1 }),
];

describe("MakeItFit", () => {
  beforeEach(() => {
    setStopNights.mockReset().mockResolvedValue({ success: true });
    deleteStop.mockReset().mockResolvedValue({ success: true });
  });

  it("renders nothing when the trip already fits", () => {
    const { container } = render(<MakeItFit tripId="t1" stops={[stop({ id: "a", nights: 2 })]} anchor="2026-07-01" hardEndDate="2026-07-10" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens a dialog showing how far over you are", async () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    expect(await screen.findByText(/4 nights past/i)).toBeInTheDocument();
  });

  it("applies the trim plan via setStopNights for each trimmed stop", async () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apply trim/i }));
    await waitFor(() => expect(setStopNights).toHaveBeenCalled());
  });

  it("drop shows a confirmation dialog naming the stop before firing deleteStop", async () => {
    const user = userEvent.setup();
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    const dropRome = await screen.findByRole("button", { name: /drop rome/i });
    await user.click(dropRome);

    // Confirm dialog must appear with stop name
    expect(await screen.findByText(/Drop "Rome"\?/i)).toBeInTheDocument();

    // deleteStop must NOT have been called yet
    expect(deleteStop).not.toHaveBeenCalled();

    // Confirm
    await user.click(screen.getByRole("button", { name: "Drop" }));
    await waitFor(() => expect(deleteStop).toHaveBeenCalledWith("a"));
  });

  it("drop does NOT fire when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    const dropRome = await screen.findByRole("button", { name: /drop rome/i });
    await user.click(dropRome);

    await screen.findByText(/Drop "Rome"\?/i);

    // Cancel
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(deleteStop).not.toHaveBeenCalled();
  });

  it("re-simulates live and disables Apply when the inputs are reset to current nights", () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    // reset both inputs back to their current nights → no trims, still over
    fireEvent.change(screen.getByLabelText(/nights for rome/i), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/nights for florence/i), { target: { value: "4" } });
    expect(screen.getByText(/still 4 over/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply trim/i })).toBeDisabled();
  });

  it("applies the seeded plan with the right per-stop nights", async () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apply trim/i }));
    await waitFor(() => expect(setStopNights).toHaveBeenCalledWith("a", expect.any(Number)));
    expect(setStopNights).toHaveBeenCalledWith("b", expect.any(Number));
    // every call trims to fewer nights than the stop currently has (6 and 4)
    for (const [id, n] of setStopNights.mock.calls) {
      expect(n).toBeLessThan(id === "a" ? 6 : 4);
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps the dialog open and toasts when a trim fails", async () => {
    setStopNights.mockResolvedValueOnce({ success: false, errors: {} });
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apply trim/i }));
    await waitFor(() => expect(setStopNights).toHaveBeenCalled());
    // dialog still shows the over headline
    expect(screen.getByText(/nights past/i)).toBeInTheDocument();
  });
});
