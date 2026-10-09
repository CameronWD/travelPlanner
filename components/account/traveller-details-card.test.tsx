import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const saveTravellerDetails = vi.fn();
vi.mock("@/server/actions/traveller-details", () => ({
  get saveTravellerDetails() { return saveTravellerDetails; },
}));

import { TravellerDetailsForm } from "./traveller-details-card";

beforeEach(() => saveTravellerDetails.mockReset().mockResolvedValue({ success: true }));

const EMPTY = { mobile: null, emergencyName: null, emergencyPhone: null, bankDetails: null };

describe("TravellerDetailsForm", () => {
  it("shows the four fields with their helper lines, prefilled", () => {
    render(<TravellerDetailsForm initial={{ ...EMPTY, mobile: "0400 000 000", bankDetails: "BSB 000-000" }} />);
    expect(screen.getByLabelText("Mobile")).toHaveValue("0400 000 000");
    expect(screen.getByLabelText("Emergency contact name")).toHaveValue("");
    expect(screen.getByLabelText("Emergency contact number")).toHaveValue("");
    expect(screen.getByLabelText("Bank details")).toHaveValue("BSB 000-000");
    expect(screen.getByText("Fellow travellers see this; a share link only if its Contact details dial is on.")).toBeInTheDocument();
    expect(screen.getAllByText("Only the people on your trips ever see this.")).toHaveLength(2);
    expect(screen.getByText("Only the people on your trips ever see this, never a share link.")).toBeInTheDocument();
    expect(screen.queryByText(/Never on a share link/)).toBeNull();
  });

  it("saves what was typed and says so", async () => {
    render(<TravellerDetailsForm initial={EMPTY} />);
    await userEvent.type(screen.getByLabelText("Mobile"), "0400 111 222");
    await userEvent.type(screen.getByLabelText("Emergency contact name"), "Mum");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(saveTravellerDetails).toHaveBeenCalledWith({ mobile: "0400 111 222", emergencyName: "Mum", emergencyPhone: "", bankDetails: "" });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("shows a field error from the action", async () => {
    saveTravellerDetails.mockResolvedValue({ success: false, errors: { bankDetails: ["String must contain at most 500 character(s)"] } });
    render(<TravellerDetailsForm initial={EMPTY} />);
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText(/at most 500/)).toBeInTheDocument();
    expect(screen.getByLabelText("Bank details")).toHaveAttribute("aria-invalid", "true");
  });

  it("clears Saved. when a re-save fails", async () => {
    render(<TravellerDetailsForm initial={EMPTY} />);
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    saveTravellerDetails.mockResolvedValue({ success: false, errors: { bankDetails: ["String must contain at most 500 character(s)"] } });
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText(/at most 500/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
