import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StayPanel, type StayPanelAccommodation } from "./stay-panel";
import { formatMoney } from "@/lib/money";

const PARIS = { arriveDate: "2026-12-10", departDate: "2026-12-14" }; // 4 nights: 10–13 Dec

const cost = (over = {}) => ({
  id: "c1", costMinor: 54000, paidMinor: null, currency: "EUR", rateToHome: null, paidAt: null,
  dueDate: null, ownerType: "ACCOMMODATION", ownerId: "acc1", label: null, category: null, settlement: "BEFORE", ...over,
});

const HOTEL: StayPanelAccommodation = {
  id: "acc1",
  stopId: "par",
  name: "Hôtel Grands Boulevards",
  address: "17 Bd Poissonnière, Paris",
  checkIn: "2026-12-11",
  checkOut: "2026-12-14",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  confirmation: "HGB-4471",
  notes: "Ring the night bell\nCode is 1234",
  lat: 48.87,
  lng: 2.35,
  costs: [cost({ paidAt: new Date("2026-10-01") })],
  attachmentCount: 2,
};

const props = (over: Partial<React.ComponentProps<typeof StayPanel>> = {}) => ({
  stop: PARIS, accommodations: [HOTEL], homeCurrency: "AUD", onOpen: vi.fn(), onAdd: vi.fn(), ...over,
});

describe("StayPanel (spec 2026-10-04 §B)", () => {
  it("a display heading: Where you're staying", () => {
    render(<StayPanel {...props()} />);
    const heading = screen.getByRole("heading", { name: "Where you’re staying" });
    expect(heading.className).toContain("font-display");
  });

  it("one block per Accommodation with every set detail", () => {
    render(<StayPanel {...props()} />);
    const block = screen.getByTestId("stay-block");
    expect(block).toHaveTextContent("Hôtel Grands Boulevards");
    expect(block).toHaveTextContent("Fri 11 Dec 15:00 → Mon 14 Dec 11:00 · 3 nights");
    expect(block).toHaveTextContent("17 Bd Poissonnière, Paris");
    expect(within(block).getByRole("link", { name: "Open Hôtel Grands Boulevards in Maps" })).toBeInTheDocument();
    expect(block).toHaveTextContent("HGB-4471");
    // Not toHaveTextContent: jest-dom normalizes the element's text (collapsing
    // the U+00A0 Intl puts between "EUR" and the amount for en-AU into a plain
    // space) but leaves the string passed to it untouched, so the two can
    // never match on this environment's ICU data. Compare the raw textContent
    // instead, which carries the same NBSP from the same formatMoney call.
    expect(block.textContent).toContain(formatMoney(54000, "EUR"));
    expect(within(block).getByText("Paid")).toBeInTheDocument();
    expect(block).toHaveTextContent("Ring the night bell");
    expect(block).not.toHaveTextContent("Code is 1234");
    expect(block).toHaveTextContent("2 files");
  });

  it("leaves out what isn't set; an unpaid cost says Unpaid", () => {
    const bare: StayPanelAccommodation = {
      id: "acc2", stopId: "par", name: "Ibis Gare de l'Est", checkIn: "2026-12-10", checkOut: "2026-12-11",
      costs: [cost({ id: "c2", ownerId: "acc2" })],
    };
    render(<StayPanel {...props({ accommodations: [bare] })} />);
    const block = screen.getByTestId("stay-block");
    expect(block).toHaveTextContent("Thu 10 Dec → Fri 11 Dec · 1 night");
    expect(within(block).queryByRole("link")).toBeNull();
    expect(within(block).getByText("Unpaid")).toBeInTheDocument();
    expect(block).not.toHaveTextContent(/file/);
  });

  it("clicking a block opens that Accommodation", async () => {
    const p = props();
    render(<StayPanel {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Hôtel Grands Boulevards" }));
    expect(p.onOpen).toHaveBeenCalledWith("acc1");
  });

  it("the map pin opens Maps, not the block — and is not nested in the block's button", async () => {
    const p = props();
    render(<StayPanel {...p} />);
    const button = screen.getByRole("button", { name: "Hôtel Grands Boulevards" });
    const link = screen.getByRole("link", { name: "Open Hôtel Grands Boulevards in Maps" });
    expect(button).not.toContainElement(link);
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom can't navigate
    await userEvent.click(link);
    expect(p.onOpen).not.toHaveBeenCalled();
  });

  it("partial: X of N nights, no bed {days} · + Add another place", async () => {
    const p = props();
    render(<StayPanel {...p} />);
    const line = screen.getByTestId("stay-coverage");
    expect(line).toHaveTextContent("3 of 4 nights, no bed Thu 10 Dec");
    await userEvent.click(within(line).getByRole("button", { name: "+ Add another place" }));
    expect(p.onAdd).toHaveBeenCalled();
  });

  it("partial with gaps folds consecutive nights into runs", () => {
    const a = (id: string, checkIn: string, checkOut: string): StayPanelAccommodation => ({ id, stopId: "par", name: id, checkIn, checkOut });
    render(
      <StayPanel
        {...props({
          stop: { arriveDate: "2026-12-10", departDate: "2026-12-15" },
          accommodations: [a("A", "2026-12-10", "2026-12-11"), a("B", "2026-12-12", "2026-12-13")],
        })}
      />,
    );
    expect(screen.getByTestId("stay-coverage")).toHaveTextContent("2 of 5 nights, no bed Fri 11 Dec, Sun 13 – Mon 14 Dec");
  });

  it("covered: All N nights covered · + Add another place", () => {
    render(<StayPanel {...props({ accommodations: [{ ...HOTEL, checkIn: "2026-12-10" }] })} />);
    const line = screen.getByTestId("stay-coverage");
    expect(line).toHaveTextContent("All 4 nights covered");
    expect(within(line).getByRole("button", { name: "+ Add another place" })).toBeInTheDocument();
  });

  it("no Accommodation: No bed yet · + Add a stay", async () => {
    const p = props({ accommodations: [] });
    render(<StayPanel {...p} />);
    expect(screen.queryByTestId("stay-block")).toBeNull();
    expect(screen.getByTestId("stay-coverage")).toHaveTextContent("No bed yet");
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(p.onAdd).toHaveBeenCalled();
  });

  it("a same-day Stop is a day visit, not 'Needs dates first'", () => {
    render(<StayPanel {...props({ stop: { arriveDate: "2026-12-10", departDate: "2026-12-10" }, accommodations: [] })} />);
    expect(screen.getByTestId("stay-coverage")).toHaveTextContent("Day visit, no nights to cover");
    expect(screen.getByRole("button", { name: "+ Add a stay" })).toBeInTheDocument();
    expect(screen.queryByText("Needs dates first")).toBeNull();
  });

  it("rough: Needs dates first, nothing interactive", () => {
    render(<StayPanel {...props({ stop: { arriveDate: null, departDate: null }, accommodations: [] })} />);
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("long names and addresses truncate inside the block instead of widening it", () => {
    render(<StayPanel {...props()} />);
    const block = screen.getByTestId("stay-block");
    expect(block.className).toContain("min-w-0");
    expect(screen.getByRole("button", { name: "Hôtel Grands Boulevards" }).className).toContain("truncate");
    expect(screen.getByText("17 Bd Poissonnière, Paris").className).toContain("truncate");
  });
});
