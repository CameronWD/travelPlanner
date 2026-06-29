import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MakeItFit } from "./make-it-fit";
import type { FitStop } from "@/lib/make-it-fit";

const setStopNights = vi.fn();
const deleteStop = vi.fn();
vi.mock("@/server/actions/stops", () => ({
  setStopNights: (...a: unknown[]) => setStopNights(...a),
  deleteStop: (...a: unknown[]) => deleteStop(...a),
}));

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

  it("drops a stop via deleteStop", async () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    const dropRome = await screen.findByRole("button", { name: /drop rome/i });
    fireEvent.click(dropRome);
    await waitFor(() => expect(deleteStop).toHaveBeenCalledWith("a"));
  });
});
