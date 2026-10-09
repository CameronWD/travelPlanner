import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const saveTravelNumber = vi.fn();
vi.mock("@/server/actions/traveller-details", () => ({ get saveTravelNumber() { return saveTravelNumber; } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { TravellerDetailsList } from "./traveller-details-list";

const alice = { id: "u1", name: "Alice", image: null, email: null };
const bob = { id: "u2", name: "Bob", image: null, email: null };

beforeEach(() => saveTravelNumber.mockReset().mockResolvedValue({ success: true }));

describe("TravellerDetailsList", () => {
  it("lists each Traveller's filled-in details, omitting blanks, and says when there are none", () => {
    render(
      <TravellerDetailsList
        tripId="t1"
        currentUserId="u1"
        rows={[
          { userId: "u1", user: alice, travelNumber: "+39 333 1", details: { mobile: "0400", emergencyName: "Mum", emergencyPhone: "0411", bankDetails: null } },
          { userId: "u2", user: bob, travelNumber: null, details: null },
        ]}
      />,
    );
    const a = within(screen.getByRole("listitem", { name: "Alice" }));
    expect(a.getByText("0400")).toBeInTheDocument();
    expect(a.getByText("Mum · 0411")).toBeInTheDocument();
    expect(a.queryByText(/Bank details/)).toBeNull();
    const b = within(screen.getByRole("listitem", { name: "Bob" }));
    expect(b.getByText("No details yet")).toBeInTheDocument();
  });

  it("the viewer's row has the travel number field and an Edit on Account link; others are read-only", async () => {
    render(
      <TravellerDetailsList
        tripId="t1"
        currentUserId="u1"
        rows={[
          { userId: "u1", user: alice, travelNumber: null, details: null },
          { userId: "u2", user: bob, travelNumber: "+1 555", details: null },
        ]}
      />,
    );
    const a = within(screen.getByRole("listitem", { name: "Alice" }));
    expect(a.getByRole("link", { name: "Edit on Account" }).getAttribute("href")).toBe("/account");
    expect(a.getByText("The number you'll have on this trip: an eSIM or local SIM.")).toBeInTheDocument();
    await userEvent.type(a.getByLabelText("Travel number"), "+39 333 9");
    await userEvent.click(a.getByRole("button", { name: "Save travel number" }));
    expect(saveTravelNumber).toHaveBeenCalledWith("t1", "+39 333 9");
    const b = within(screen.getByRole("listitem", { name: "Bob" }));
    expect(b.getByText("+1 555")).toBeInTheDocument();
    expect(b.queryByLabelText("Travel number")).toBeNull();
  });
});
