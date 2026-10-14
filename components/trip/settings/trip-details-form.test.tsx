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

const replaceMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
  usePathname: () => "/trips/old-name/settings",
}));

describe("TripDetailsForm", () => {
  beforeEach(() => {
    updateMock.mockReset().mockResolvedValue({ success: true });
    replaceMock.mockReset();
    refreshMock.mockReset();
  });

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

  it("draws Round trip with the kit Checkbox, not the browser's native box (LA-199)", () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{ name: "Trip", startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "", homeCurrency: "AUD", roundTrip: true }}
      />,
    );
    const box = screen.getByRole("checkbox", { name: /nudge me to book a flight home/i });
    expect(box).toHaveAttribute("name", "roundTrip");
    expect(box).toBeChecked();
    expect(box.className).toMatch(/\bsr-only\b/); // the primitive hides the native control…
    const drawn = box.nextElementSibling!; // …and draws its own 24px square
    expect(drawn.className).toMatch(/\bsize-6\b/);
    expect(drawn.className).toMatch(/\bborder-2\b/);
    expect(drawn.className).toMatch(/\bpeer-checked:bg-primary\b/);
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
      const toggle = screen.getByRole("switch", { name: /what-if plans/i });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(screen.getByText("Keep what-if plans beside the real plan. Off by default.")).toBeInTheDocument();

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
      const toggle = screen.getByRole("switch", { name: /what-if plans/i });
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
      const toggle = screen.getByRole("switch", { name: /what-if plans/i });
      await userEvent.click(toggle);
      expect(await screen.findByText("Nope")).toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-checked", "false");
    });
  });

  it("after a rename, moves the address bar to the new slug and refreshes the shell (ADR 0064)", async () => {
    updateMock.mockResolvedValueOnce({ success: true, slug: "new-name" });
    render(<TripDetailsForm tripId="t1" defaultValues={{ name: "New name", startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "", homeCurrency: "AUD" }} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/trips/new-name/settings"));
    expect(refreshMock).toHaveBeenCalled();
  });
  it("does not navigate when the slug is unchanged", async () => {
    updateMock.mockResolvedValueOnce({ success: true, slug: "old-name" });
    render(<TripDetailsForm tripId="t1" defaultValues={{ name: "Old name", startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "", homeCurrency: "AUD" }} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

// Task 5: Home base timezone picker (spec 2026-10-14)
describe("Home base timezone picker", () => {
  it("renders Home base timezone with Australia/Brisbane selected when the Home base has a saved zone", () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{
          name: "Trip",
          startDate: "",
          endDate: "",
          hardEndDate: "",
          homeCurrency: "AUD",
          homeName: "Gold Coast",
          homeTimezone: "Australia/Brisbane",
        }}
      />,
    );
    const picker = screen.getByRole("combobox", { name: /home base timezone/i });
    expect(picker).toHaveTextContent(/Brisbane/i);
  });

  it("shows no Home base timezone field when the Home base is empty, and reveals it once a Home base is typed", async () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{
          name: "Trip",
          startDate: "",
          endDate: "",
          hardEndDate: "",
          homeCurrency: "AUD",
          homeName: "",
        }}
      />,
    );
    expect(screen.queryByRole("combobox", { name: /home base timezone/i })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/home base/i), "Sydney");

    expect(screen.getByRole("combobox", { name: /home base timezone/i })).toBeInTheDocument();
  });

  it("submits the picked Home base timezone when the Traveller changed the picker", async () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{
          name: "Trip",
          startDate: "",
          endDate: "",
          hardEndDate: "",
          homeCurrency: "AUD",
          homeName: "Gold Coast",
          homeTimezone: "",
        }}
      />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: /home base timezone/i }));
    await userEvent.click(await screen.findByRole("option", { name: /Brisbane/i }));

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", expect.objectContaining({ homeTimezone: "Australia/Brisbane" })),
    );
  });

  it("submits an empty homeTimezone when the Home base is renamed but the picker itself is untouched", async () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{
          name: "Trip",
          startDate: "",
          endDate: "",
          hardEndDate: "",
          homeCurrency: "AUD",
          homeName: "Gold Coast",
          homeTimezone: "Australia/Brisbane",
        }}
      />,
    );

    const homeBaseInput = screen.getByLabelText(/^home base$/i);
    await userEvent.clear(homeBaseInput);
    await userEvent.type(homeBaseInput, "Vienna");

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", expect.objectContaining({ homeName: "Vienna", homeTimezone: "" })),
    );
  });
});
