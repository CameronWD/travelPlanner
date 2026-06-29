import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HardEndDateControl } from "./hard-end-date-control";

const setMock = vi.fn();
vi.mock("@/server/actions/trips", () => ({
  setTripHardEndDate: (...args: unknown[]) => setMock(...args),
}));

describe("HardEndDateControl", () => {
  beforeEach(() => setMock.mockReset().mockResolvedValue({ success: true }));

  it("shows a 'Set hard end date' affordance when unset", () => {
    render(<HardEndDateControl tripId="t1" hardEndDate={null} startDate="2026-07-01" />);
    expect(screen.getByRole("button", { name: /set hard end date/i })).toBeInTheDocument();
  });

  it("shows the date and saves an edit", async () => {
    render(<HardEndDateControl tripId="t1" hardEndDate="2026-07-15" startDate="2026-07-01" />);
    fireEvent.click(screen.getByRole("button", { name: /edit hard end date/i }));
    const input = screen.getByLabelText(/hard end date/i, { selector: "input" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-20" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(setMock).toHaveBeenCalledWith("t1", "2026-07-20"));
  });

  it("clears the date", async () => {
    render(<HardEndDateControl tripId="t1" hardEndDate="2026-07-15" startDate="2026-07-01" />);
    fireEvent.click(screen.getByRole("button", { name: /edit hard end date/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    await waitFor(() => expect(setMock).toHaveBeenCalledWith("t1", null));
  });
});
