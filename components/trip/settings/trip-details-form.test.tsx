import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripDetailsForm } from "./trip-details-form";

const updateMock = vi.fn();
vi.mock("@/server/actions/trips", () => ({
  updateTrip: (...args: unknown[]) => updateMock(...args),
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
    await userEvent.click(screen.getByLabelText(/round trip/i)); // toggle off
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", expect.objectContaining({ homeName: "Sydney", roundTrip: false }))
    );
  });
});
