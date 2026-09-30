import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn(async () => ({ success: true })) }));

import { SelectedDay, claimDragHint } from "./selected-day";
import { setDayTitle } from "@/server/actions/day-titles";
import { formatMoney } from "@/lib/money";

// testing-library's getByText only normalises the DOM node's own text before
// comparing, not the matcher string (@testing-library/dom's matches()) — so
// an exact-string query built from formatMoney() must be pre-normalised too,
// since Intl's small-icu currency fallback ("EUR<NBSP>22.00") uses a
// non-breaking space the node-side normaliser collapses to a plain space.
const money = (minor: number, currency: string) => formatMoney(minor, currency).replace(/\s+/g, " ");

const ITEMS = [
  { id: "a", title: "Café Kitsuné", category: "FOOD", date: "2026-12-11", startTime: "09:00", address: "Palais Royal" },
  { id: "b", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00", booking: "LVR-123", notes: "Richelieu entrance" },
  { id: "c", title: "Picnic", category: "FOOD", date: "2026-12-11", hiddenFromShares: true },
];
const COSTS = new Map([["b", [{ id: "k", costMinor: 2200, paidMinor: null, currency: "EUR", rateToHome: 1.65, paidAt: null, dueDate: null, ownerType: "ITEM", ownerId: "b", label: null, category: null, settlement: "BEFORE" }]]]);

function renderDay(p = {}) {
  const props = { tripId: "t1", stopId: "par", dateISO: "2026-12-11", dayTitle: "Museums & Septime", items: ITEMS, costsById: COSTS, homeCurrency: "EUR", ideasCount: 3, panelId: "panel-par", tabId: "panel-par-tab-2026-12-11", showDragHint: true, onAdd: vi.fn(), onEditItem: vi.fn(), onPickIdea: vi.fn(), ...p };
  return { props, ...render(<SelectedDay {...props} />) };
}

describe("SelectedDay (PLAN.md §4.3)", () => {
  it("a tabpanel labelled by its tab, with a sun head", () => {
    renderDay();
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "panel-par");
    expect(panel).toHaveAttribute("aria-labelledby", "panel-par-tab-2026-12-11");
    expect(screen.getByText("FRI 11 DEC")).toBeInTheDocument();
    expect(screen.getByText(`3 plans · 1 booked · ${money(2200, "EUR")} so far`)).toBeInTheDocument();
  });

  it("Open day links to the Day view; + Add presets the date", async () => {
    const { props } = renderDay();
    const openDay = screen.getByRole("link", { name: /Open day/ });
    expect(openDay).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
    expect(openDay.className).toContain("tap-target");
    const addButton = screen.getByRole("button", { name: "+ Add" });
    expect(addButton.className).toContain("tap-target");
    await userEvent.click(addButton);
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
  });

  it("rows: time or dash, title, sub line, Booked, cost, EyeOff; click edits", async () => {
    const { props } = renderDay();
    expect(screen.getByText("09:00").className).toContain("tabular-nums");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Palais Royal")).toBeInTheDocument();
    expect(screen.getByText("Richelieu entrance")).toBeInTheDocument();
    expect(screen.getByText(/Booked/)).toBeInTheDocument();
    expect(screen.getByText(money(2200, "EUR"))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hidden from shares" })).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit Louvre" });
    expect(editButton.className).toContain("tap-target");
    await userEvent.click(editButton);
    expect(props.onEditItem).toHaveBeenCalledWith(ITEMS[1]);
    const grip = screen.getByRole("button", { name: "Drag Louvre to another day" });
    expect(grip).toBeInTheDocument();
    expect(grip.className).toContain("tap-target");
  });

  it("edits the day title inline: Enter saves via setDayTitle", async () => {
    renderDay();
    const editTitle = screen.getByRole("button", { name: /Edit the day title/ });
    expect(editTitle.className).toContain("tap-target");
    await userEvent.click(editTitle);
    const input = screen.getByRole("textbox", { name: /Day title/ });
    await userEvent.clear(input);
    await userEvent.type(input, "Paris museums{Enter}");
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "par", date: "2026-12-11", title: "Paris museums" });
  });

  it("untitled: Add a title", () => {
    renderDay({ dayTitle: undefined });
    expect(screen.getByRole("button", { name: /Add a title/ })).toBeInTheDocument();
  });

  it("empty day: Nothing planned yet, + Add to Fri 11, or pick an idea", async () => {
    const { props } = renderDay({ items: [] });
    expect(screen.getByText("Nothing planned yet")).toBeInTheDocument();
    const addToDay = screen.getByRole("button", { name: "+ Add to Fri 11" });
    expect(addToDay.className).toContain("tap-target");
    await userEvent.click(addToDay);
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
    await userEvent.click(screen.getByRole("button", { name: "or pick an idea" }));
    expect(props.onPickIdea).toHaveBeenCalled();
  });

  it("footer: + Add to the day and the drag hint only when asked", () => {
    const { rerender, props } = renderDay();
    expect(screen.getByText("Drag a plan onto a day above to move it")).toBeInTheDocument();
    rerender(<SelectedDay {...props} showDragHint={false} />);
    expect(screen.queryByText("Drag a plan onto a day above to move it")).toBeNull();
  });

  it("claimDragHint is true once per session", () => {
    sessionStorage.clear();
    expect(claimDragHint()).toBe(true);
    expect(claimDragHint()).toBe(false);
  });

  it("uses no banned soft classes", () => {
    const { container } = renderDay();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
