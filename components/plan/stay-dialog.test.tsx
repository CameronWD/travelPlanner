import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// CardActionCluster / CostEditor pull in server actions (next-auth) — stub them.
vi.mock("@/server/actions/costs", () => ({ createCost: vi.fn(), updateCost: vi.fn(), deleteCost: vi.fn() }));
vi.mock("@/server/actions/notes", () => ({ addNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: vi.fn(), deleteAttachment: vi.fn() }));

import { StayDialog, type StayDetailAccommodation, type StayDialogProps } from "./stay-dialog";
import { formatMoney } from "@/lib/money";

const ROME = { arriveDate: "2026-12-15", departDate: "2026-12-20" }; // 5 nights

const cost = (over = {}) => ({
  id: "c1", costMinor: 54000, paidMinor: 54000, currency: "EUR", rateToHome: null, paidAt: new Date("2026-10-01"),
  dueDate: null, ownerType: "ACCOMMODATION", ownerId: "a1", label: null, category: null, settlement: "BEFORE", ...over,
});

const ARTEMIDE: StayDetailAccommodation = {
  id: "a1",
  stopId: "r",
  name: "Hotel Artemide",
  address: "Via Nazionale 22, Roma",
  checkIn: "2026-12-15",
  checkOut: "2026-12-18",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  confirmation: "ART-881",
  notes: "Late check-in desk\nAsk for a quiet room",
  lat: 41.9,
  lng: 12.49,
  costs: [cost()],
  attachments: [
    { id: "f1", filename: "artemide.pdf", mime: "application/pdf", size: 10, url: "/api/attachments/f1", uploadedById: "u1", createdAt: new Date("2026-06-01") },
  ],
  noteThread: [],
};

// No address, no booking ref, no cost, no notes (FB-09: no map link without an address).
const TRASTEVERE: StayDetailAccommodation = {
  id: "a2", stopId: "r", name: "Trastevere flat", address: null, checkIn: "2026-12-18", checkOut: "2026-12-20",
  checkInTime: null, checkOutTime: null, confirmation: null, notes: null, lat: 41.88, lng: 12.47, costs: [],
};

function renderDialog(over: Partial<StayDialogProps> = {}) {
  const props: StayDialogProps = {
    open: true, onOpenChange: vi.fn(), stopName: "Rome", stop: ROME, stays: [ARTEMIDE], selectedId: "a1",
    homeCurrency: "AUD", tripId: "trip-1", currentUserId: "u1", onEdit: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn(), ...over,
  };
  render(<StayDialog {...props} />);
  return props;
}

describe("StayDialog (spec 2026-10-05 §D)", () => {
  it("is the large dialog, titled for the Stop", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Staying in Rome" });
    expect(dialog.className.split(/\s+/)).toContain("sm:max-w-dialog-lg");
  });

  it("shows the selected stay as a detail view", () => {
    renderDialog();
    const detail = screen.getByTestId("stay-detail");
    expect(within(detail).getByRole("heading", { name: "Hotel Artemide" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("Via Nazionale 22, Roma");
    expect(within(detail).getByRole("link", { name: "Open Hotel Artemide in Maps" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("Check-inTue 15 Dec · 15:00");
    expect(detail).toHaveTextContent("Check-outFri 18 Dec · 11:00");
    expect(detail).toHaveTextContent("3 of 5 nights");
    expect(detail).toHaveTextContent("ART-881");
    // jest-dom's toHaveTextContent normalizes the DOM's   (the nbsp
    // Intl inserts between an alpha currency code and its amount) to a plain
    // space but leaves the expected string as-is — normalize both sides so
    // the comparison isn't sensitive to that quirk.
    expect(detail).toHaveTextContent(formatMoney(54000, "EUR").replace(/ /g, " "));
    expect(within(detail).getByText("Paid")).toBeInTheDocument();
    expect(within(detail).getByText(/Late check-in desk/).textContent).toBe("Late check-in desk\nAsk for a quiet room");
    expect(detail).toHaveTextContent("artemide.pdf");
  });

  it("Edit opens the existing form for that stay; Delete goes through onDelete", async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Hotel Artemide" }));
    expect(props.onDelete).toHaveBeenCalledWith("a1");
  });

  it("one stay: no chip row, + Add a stay sits in the footer", async () => {
    const props = renderDialog();
    expect(screen.queryByRole("group", { name: "Stays in Rome" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("several stays: opens on the chosen one, chips switch, + Add a stay ends the row", async () => {
    renderDialog({ stays: [ARTEMIDE, TRASTEVERE], selectedId: "a2" });
    const detail = () => screen.getByTestId("stay-detail");
    expect(within(detail()).getByRole("heading", { name: "Trastevere flat" })).toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Stays in Rome" });
    expect(within(chips).getByRole("button", { name: "Trastevere flat" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chips).getByRole("button", { name: "Hotel Artemide" })).toHaveAttribute("aria-pressed", "false");
    const buttons = within(chips).getAllByRole("button");
    expect(buttons[buttons.length - 1]).toHaveTextContent("+ Add a stay");

    await userEvent.click(within(chips).getByRole("button", { name: "Hotel Artemide" }));
    expect(within(detail()).getByRole("heading", { name: "Hotel Artemide" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "Hotel Artemide" })).toHaveAttribute("aria-pressed", "true");
    // Only one + Add a stay — the footer drops it when the chip row carries it.
    expect(screen.getAllByRole("button", { name: "+ Add a stay" })).toHaveLength(1);
  });

  it("a stay with no address has no map link, and unset facts don't show (FB-09)", () => {
    renderDialog({ stays: [TRASTEVERE], selectedId: "a2" });
    const detail = screen.getByTestId("stay-detail");
    expect(within(detail).queryByRole("link", { name: /in Maps/ })).toBeNull();
    expect(detail).not.toHaveTextContent("Booking reference");
    expect(detail).not.toHaveTextContent("Cost");
    expect(detail).toHaveTextContent("Check-inFri 18 Dec");
    expect(detail).toHaveTextContent("2 of 5 nights");
  });

  it("a Stop with no stays: No bed yet, ready to add one", async () => {
    const props = renderDialog({ stays: [], selectedId: null });
    expect(screen.queryByTestId("stay-detail")).toBeNull();
    expect(screen.getByTestId("stay-empty")).toHaveTextContent("No bed yet");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("an unknown selectedId (a stay deleted meanwhile) falls back to the first stay", () => {
    renderDialog({ stays: [ARTEMIDE, TRASTEVERE], selectedId: "gone" });
    expect(within(screen.getByTestId("stay-detail")).getByRole("heading", { name: "Hotel Artemide" })).toBeInTheDocument();
  });

  // R8: "+ Add a stay" from inside the stay detail view should land on the
  // new stay, not leave the view on whichever one was picked before — the
  // parent (itinerary-manager.tsx) doesn't know the new id to pass down as
  // selectedId, so the dialog itself has to notice the stays list grew.
  describe("selecting the newly added stay (R8)", () => {
    const NEW_STAY: StayDetailAccommodation = {
      id: "a3", stopId: "r", name: "Brand New B&B", address: null, checkIn: "2026-12-15", checkOut: "2026-12-20",
      checkInTime: null, checkOutTime: null, confirmation: null, notes: null, lat: null, lng: null, costs: [],
    };

    it("from an existing pick: adding a stay switches the detail view to it", () => {
      const { rerender } = render(<StayDialog {...{
        open: true, onOpenChange: vi.fn(), stopName: "Rome", stop: ROME, stays: [ARTEMIDE], selectedId: "a1",
        homeCurrency: "AUD", tripId: "trip-1", currentUserId: "u1", onEdit: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn(),
      } satisfies StayDialogProps} />);
      expect(within(screen.getByTestId("stay-detail")).getByRole("heading", { name: "Hotel Artemide" })).toBeInTheDocument();

      // The parent re-renders with the new stay appended, but — not knowing
      // its id yet when "+ Add a stay" was clicked — still passes the old
      // selectedId.
      rerender(<StayDialog {...{
        open: true, onOpenChange: vi.fn(), stopName: "Rome", stop: ROME, stays: [ARTEMIDE, NEW_STAY], selectedId: "a1",
        homeCurrency: "AUD", tripId: "trip-1", currentUserId: "u1", onEdit: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn(),
      } satisfies StayDialogProps} />);
      expect(within(screen.getByTestId("stay-detail")).getByRole("heading", { name: "Brand New B&B" })).toBeInTheDocument();
    });

    it("from No bed yet: adding the first stay opens the detail view on it", () => {
      const { rerender } = render(<StayDialog {...{
        open: true, onOpenChange: vi.fn(), stopName: "Rome", stop: ROME, stays: [], selectedId: null,
        homeCurrency: "AUD", tripId: "trip-1", currentUserId: "u1", onEdit: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn(),
      } satisfies StayDialogProps} />);
      expect(screen.getByTestId("stay-empty")).toBeInTheDocument();

      rerender(<StayDialog {...{
        open: true, onOpenChange: vi.fn(), stopName: "Rome", stop: ROME, stays: [NEW_STAY], selectedId: null,
        homeCurrency: "AUD", tripId: "trip-1", currentUserId: "u1", onEdit: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn(),
      } satisfies StayDialogProps} />);
      expect(within(screen.getByTestId("stay-detail")).getByRole("heading", { name: "Brand New B&B" })).toBeInTheDocument();
    });
  });

  it("facts pair up only from sm — one column on a phone", () => {
    renderDialog();
    const facts = screen.getByTestId("stay-facts");
    expect(facts.className).toContain("sm:grid-cols-2");
    expect(facts.className).not.toMatch(/(^|\s)grid-cols-2/);
  });

  it("more than one Cost: the CostEditor stays reachable (the form hides its inline cost then)", () => {
    renderDialog({ stays: [{ ...ARTEMIDE, costs: [cost(), cost({ id: "c2", costMinor: 1000 })] }] });
    expect(screen.getByTestId("stay-cost-editor")).toBeInTheDocument();
  });
});
