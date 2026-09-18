import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/digest", () => ({
  setDigestEnabled: vi.fn().mockResolvedValue({ ok: true }),
}));

import { setDigestEnabled } from "@/server/actions/digest";
import { TripDigestsPanel } from "./trip-digests-panel";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setDigestEnabled).mockResolvedValue({ ok: true });
});

describe("TripDigestsPanel", () => {
  it("renders every trip with its own switch, unchecked when disabled", () => {
    render(
      <TripDigestsPanel
        initial={[
          { tripId: "trip-1", tripName: "Europe Christmas 2026", enabled: false },
          { tripId: "trip-2", tripName: "Japan 2027", enabled: true },
        ]}
      />,
    );

    expect(screen.getByText("Europe Christmas 2026")).toBeInTheDocument();
    expect(screen.getByText("Japan 2027")).toBeInTheDocument();
    expect(screen.getByLabelText("Europe Christmas 2026")).not.toBeChecked();
    expect(screen.getByLabelText("Japan 2027")).toBeChecked();
  });

  it("shows the empty state for a traveller on no trips", () => {
    render(<TripDigestsPanel initial={[]} />);
    expect(screen.getByText(/you.re not on any trips yet\./i)).toBeInTheDocument();
  });

  it("saves the toggled value for the right trip", async () => {
    const user = userEvent.setup();
    render(
      <TripDigestsPanel
        initial={[
          { tripId: "trip-1", tripName: "Europe Christmas 2026", enabled: true },
          { tripId: "trip-2", tripName: "Japan 2027", enabled: true },
        ]}
      />,
    );

    await user.click(screen.getByLabelText("Japan 2027"));

    expect(setDigestEnabled).toHaveBeenCalledWith("trip-2", false);
    expect(setDigestEnabled).not.toHaveBeenCalledWith("trip-1", expect.anything());
  });

  it("rolls the switch back and explains itself when the save fails", async () => {
    vi.mocked(setDigestEnabled).mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(
      <TripDigestsPanel
        initial={[{ tripId: "trip-1", tripName: "Europe Christmas 2026", enabled: true }]}
      />,
    );

    const toggle = screen.getByLabelText("Europe Christmas 2026");
    await user.click(toggle);

    expect(await screen.findByText(/couldn't save that/i)).toBeInTheDocument();
    // Rolled back: the checkbox must not claim a state the server refused.
    expect(toggle).toBeChecked();
  });

  it("leaves an unrelated trip's switch alone when another trip's save fails", async () => {
    vi.mocked(setDigestEnabled).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(
      <TripDigestsPanel
        initial={[
          { tripId: "trip-1", tripName: "Europe Christmas 2026", enabled: true },
          { tripId: "trip-2", tripName: "Japan 2027", enabled: true },
        ]}
      />,
    );

    await user.click(screen.getByLabelText("Europe Christmas 2026"));

    await screen.findByText(/couldn't save that/i);
    expect(screen.getByLabelText("Japan 2027")).toBeChecked();
  });
});
