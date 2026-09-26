import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripDetailsForm } from "./trip-details-form";

const updateMock = vi.fn();
const setForksEnabledMock = vi.fn();
vi.mock("@/server/actions/trips", () => ({
  updateTrip: (...args: unknown[]) => updateMock(...args),
  setForksEnabled: (...args: unknown[]) => setForksEnabledMock(...args),
}));

describe("TripDetailsForm", () => {
  beforeEach(() => updateMock.mockReset().mockResolvedValue({ success: true }));

  it("submits the hard end date along with the other fields", async () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{ name: "Trip", startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "2026-07-15", homeCurrency: "AUD" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", expect.objectContaining({ hardEndDate: "2026-07-15" })),
    );
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("submits an empty hard end date when cleared", async () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{ name: "Trip", startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "", homeCurrency: "AUD" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith("t1", expect.objectContaining({ hardEndDate: "" }));
  });

  it("submits home base name and round-trip toggle", async () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{ name: "Europe", startDate: "", endDate: "", hardEndDate: "", homeCurrency: "AUD", homeName: "", roundTrip: true }}
      />,
    );
    await userEvent.type(screen.getByLabelText(/home base/i), "Sydney");
    await userEvent.click(screen.getByRole("checkbox", { name: /nudge me to book a flight home/i })); // toggle off
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", expect.objectContaining({ homeName: "Sydney", roundTrip: false }))
    );
  });

  describe("Plan variants switch", () => {
    beforeEach(() => setForksEnabledMock.mockReset().mockResolvedValue({ success: true }));

    it("is off by default and turning it on calls setForksEnabled(tripId, true)", async () => {
      render(
        <TripDetailsForm
          tripId="t1"
          defaultValues={{ name: "Trip", startDate: "", endDate: "", hardEndDate: "", homeCurrency: "AUD" }}
        />,
      );
      const toggle = screen.getByRole("switch", { name: /plan variants/i });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(screen.getByText("Keep what-if versions of the plan side by side. Off by default.")).toBeInTheDocument();

      await userEvent.click(toggle);

      await waitFor(() => expect(setForksEnabledMock).toHaveBeenCalledWith("t1", true));
      expect(updateMock).not.toHaveBeenCalled();
      await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    });

    it("turning it off calls setForksEnabled(tripId, false)", async () => {
      render(
        <TripDetailsForm
          tripId="t1"
          defaultValues={{ name: "Trip", startDate: "", endDate: "", hardEndDate: "", homeCurrency: "AUD", forksEnabled: true }}
        />,
      );
      const toggle = screen.getByRole("switch", { name: /plan variants/i });
      expect(toggle).toHaveAttribute("aria-checked", "true");
      await userEvent.click(toggle);
      await waitFor(() => expect(setForksEnabledMock).toHaveBeenCalledWith("t1", false));
    });

    it("reverts the switch and shows the error when the action fails", async () => {
      setForksEnabledMock.mockResolvedValue({ success: false, errors: { _: ["Nope"] } });
      render(
        <TripDetailsForm
          tripId="t1"
          defaultValues={{ name: "Trip", startDate: "", endDate: "", hardEndDate: "", homeCurrency: "AUD" }}
        />,
      );
      const toggle = screen.getByRole("switch", { name: /plan variants/i });
      await userEvent.click(toggle);
      expect(await screen.findByText("Nope")).toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-checked", "false");
    });
  });
});
