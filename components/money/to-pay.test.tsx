import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  markCostPaid: vi.fn<(...a: unknown[]) => Promise<{ success: true }>>(async () => ({ success: true as const })),
  markCostUnpaid: vi.fn<(...a: unknown[]) => Promise<{ success: true }>>(async () => ({ success: true as const })),
  deleteCost: vi.fn<(...a: unknown[]) => Promise<{ success: true }>>(async () => ({ success: true as const })),
}));
vi.mock("@/server/actions/costs", () => actions);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ toast }));
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), todayLocalISO: () => "2026-10-10" }));
vi.mock("@/components/trip/other-cost-editor", () => ({
  OtherCostFormDialog: ({ open, cost }: { open: boolean; cost?: { id: string } }) =>
    open ? <div data-testid="other-cost-dialog" data-cost={cost?.id ?? "new"} /> : null,
}));
vi.mock("@/components/trip/cost-editor", () => ({
  OwnedCostFormDialog: ({ open, cost }: { open: boolean; cost: { id: string } }) =>
    open ? <div data-testid="owned-cost-dialog" data-cost={cost.id} /> : null,
}));
vi.mock("@/components/money/paid-confirm", () => ({
  PaidConfirm: ({ row }: { row: { id: string } }) => <div data-testid="paid-confirm" data-cost={row.id} />,
}));

import { ToPayCard } from "./to-pay-card";
import type { ToPayInput } from "@/lib/money/to-pay";
import type { CostRow } from "@/server/actions/costs";

function input(over: Partial<ToPayInput> & { id: string }): ToPayInput {
  return { displayLabel: over.id, costMinor: 10000, paidMinor: null, currency: "AUD", rateToHome: null, paidAt: null, dueDate: null, ownerType: "OTHER", settlement: "BEFORE", ...over };
}
const COSTS: ToPayInput[] = [
  input({ id: "rome", displayLabel: "Rome apartment · balance", currency: "EUR", costMinor: 76000, rateToHome: 2, dueDate: "2026-10-15", ownerType: "ACCOMMODATION" }),
  input({ id: "eurostar", displayLabel: "Eurostar London → Paris", dueDate: "2026-11-02", ownerType: "TRANSPORT" }),
  input({ id: "insurance", displayLabel: "Travel insurance", costMinor: 41200 }),
  input({ id: "legacy", displayLabel: "Old deposit", paidMinor: 5000 }),
  input({ id: "flights", displayLabel: "Flights SYD → LHR", paidMinor: 486000, costMinor: 486000, paidAt: new Date("2026-09-02") }),
];
const costRows = COSTS.map((c) => ({ ...c, label: c.displayLabel, category: null, ownerId: c.ownerType === "OTHER" ? null : `${c.id}-owner` })) as unknown as CostRow[];

// jsdom has no AnimationEvent, so React listens for the prefixed name there; fire both.
function endAnimation(el: Element) {
  act(() => {
    for (const type of ["animationend", "webkitAnimationEnd"]) el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

function renderCard(costs = COSTS) {
  return render(<ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={costs} costRows={costRows} ratesFooter={<div data-testid="rates-footer" />} />);
}

beforeEach(() => vi.clearAllMocks());

describe("To pay (MONEY.md §4)", () => {
  it("is headed To pay with an 'N left' pill", () => {
    renderCard();
    const card = screen.getByRole("region", { name: "To pay" });
    expect(within(card).getByRole("heading", { level: 2, name: "To pay" })).toBeInTheDocument();
    expect(within(card).getAllByText("4 left")[0]).toBeInTheDocument();
  });

  it("rows: label, due line in its tone, home amount and the original underneath", () => {
    renderCard();
    const rome = screen.getByRole("listitem", { name: "Rome apartment · balance" });
    expect(within(rome).getByText("Due Thu 15 Oct")).toHaveClass("text-coral-text");
    expect(within(rome).getByText("$1,520")).toHaveClass("tabular-nums");
    expect(within(rome).getByText("€760")).toBeInTheDocument();
    const eurostar = screen.getByRole("listitem", { name: "Eurostar London → Paris" });
    expect(within(eurostar).getByText("Due Mon 2 Nov")).toHaveClass("text-muted-foreground");
    const flights = screen.getByRole("listitem", { name: "Flights SYD → LHR" });
    expect(within(flights).getByText("Paid 2 Sep")).toHaveClass("text-teal-text");
    expect(within(flights).getByRole("checkbox", { name: "Flights SYD → LHR" })).toHaveAttribute("aria-checked", "true");
  });

  it("a legacy row says the date is missing and has a dashed box", () => {
    renderCard();
    const row = screen.getByRole("listitem", { name: "Old deposit" });
    expect(within(row).getByText("Paid · date missing")).toHaveClass("text-sun-text");
    expect(within(row).getByTestId("to-pay-box").className).toContain("border-dashed");
  });

  it("ticking an unpaid row marks it paid in one tap, with the cost amount and today", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("checkbox", { name: "Travel insurance" }));
    expect(actions.markCostPaid).toHaveBeenCalledWith("insurance", 41200, "2026-10-10");
  });

  it("ticking a legacy row confirms it with the recorded amount", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("checkbox", { name: "Old deposit" }));
    expect(actions.markCostPaid).toHaveBeenCalledWith("legacy", 5000, "2026-10-10");
  });

  it("un-ticking a paid row un-marks it", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("checkbox", { name: "Flights SYD → LHR" }));
    expect(actions.markCostUnpaid).toHaveBeenCalledWith("flights");
  });

  it("shows the tick at once, and rolls back with a toast when the server refuses", async () => {
    let resolve!: (v: { success: false; errors: Record<string, string[]> }) => void;
    actions.markCostPaid.mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    renderCard();
    const box = screen.getByRole("checkbox", { name: "Travel insurance" });
    await user.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    resolve({ success: false, errors: { _form: ["x"] } });
    await waitFor(() => expect(box).toHaveAttribute("aria-checked", "false"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("the ⋯ menu offers Mark partly paid, which opens the amount confirm", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for Travel insurance" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark partly paid" }));
    expect(await screen.findByTestId("paid-confirm")).toHaveAttribute("data-cost", "insurance");
  });

  it("Edit cost opens the owner-appropriate editor", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for Rome apartment · balance" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit cost" }));
    expect(await screen.findByTestId("owned-cost-dialog")).toHaveAttribute("data-cost", "rome");
  });

  it("tapping an Other cost's row opens its editor; an owned cost's row is not a button", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Edit Travel insurance" }));
    expect(await screen.findByTestId("other-cost-dialog")).toHaveAttribute("data-cost", "insurance");
    expect(screen.queryByRole("button", { name: "Edit Rome apartment · balance" })).toBeNull();
  });

  it("Delete cost is offered for Other costs only and asks first", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for Travel insurance" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete cost" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(actions.deleteCost).toHaveBeenCalledWith("insurance");
    await user.click(screen.getByRole("button", { name: "More for Eurostar London → Paris" }));
    expect(screen.queryByRole("menuitem", { name: "Delete cost" })).toBeNull();
  });

  it("shows five rows from md and two on phones; the rest are in All N costs", async () => {
    const user = userEvent.setup();
    renderCard([...COSTS, input({ id: "extra", displayLabel: "Extra" })]);
    const items = within(screen.getByRole("list", { name: "To pay" })).getAllByRole("listitem");
    expect(items[1].className).not.toContain("max-md:hidden");
    expect(items[2].className).toContain("max-md:hidden");
    expect(items[5].className).toContain("md:hidden");
    await user.click(screen.getByRole("button", { name: "All 6 costs" }));
    const dialog = await screen.findByRole("dialog", { name: "All costs" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(6);
    expect(within(dialog).getByTestId("rates-footer").parentElement!.className).toContain("md:hidden");
  });

  it("everything paid: an All paid pill", () => {
    renderCard([COSTS[4]]);
    expect(screen.getAllByText("All paid")[0].className).toContain("bg-teal");
  });

  it("M7: ticking pops the check, draws the strike and pops the left count", async () => {
    actions.markCostPaid.mockImplementationOnce(() => new Promise(() => {}) as never);
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("checkbox", { name: "Travel insurance" }));
    const row = screen.getByRole("listitem", { name: "Travel insurance" });
    expect(within(row).getByTestId("to-pay-box").querySelector("svg")!.getAttribute("class")).toContain("tp-pop");
    expect(within(row).getByText("Travel insurance").className).toContain("bg-[length:100%_2px]");
    expect(screen.getAllByText("3 left")[0].className).toContain("tp-pop");
  });
  it("M9: a newly added cost rises in; rows present on mount do not", () => {
    const { rerender } = renderCard();
    expect(screen.getByRole("listitem", { name: "Travel insurance" }).className).not.toContain("tp-rise-in");
    rerender(
      <ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={[input({ id: "new", displayLabel: "eSIM" }), ...COSTS]} costRows={costRows} />,
    );
    expect(screen.getByRole("listitem", { name: "eSIM" }).className).toContain("tp-rise-in");
  });

  it("M9: the rise-in plays once — dropped after it ends, so hiding and showing the row can't replay it", () => {
    const { rerender } = renderCard();
    rerender(
      <ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={[input({ id: "new", displayLabel: "eSIM" }), ...COSTS]} costRows={costRows} />,
    );
    const row = screen.getByRole("listitem", { name: "eSIM" });
    endAnimation(within(row).getByText("eSIM"));
    expect(row.className).toContain("tp-rise-in");
    endAnimation(row);
    expect(row.className).not.toContain("tp-rise-in");
  });
  it("M7: a ticked row moves to the paid section 400ms after the server's new order arrives", () => {
    vi.useFakeTimers();
    try {
      actions.markCostPaid.mockImplementationOnce(() => new Promise(() => {}) as never);
      const { rerender } = renderCard();
      const names = () => within(screen.getByRole("list", { name: "To pay" })).getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
      const before = names();
      fireEvent.click(screen.getByRole("checkbox", { name: "Travel insurance" }));
      const paid = COSTS.map((c) => (c.id === "insurance" ? { ...c, paidMinor: c.costMinor, paidAt: new Date("2026-10-10") } : c));
      rerender(<ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={paid} costRows={costRows} />);
      act(() => vi.advanceTimersByTime(399));
      expect(names()).toEqual(before);
      act(() => vi.advanceTimersByTime(1));
      const after = names();
      expect(after).not.toEqual(before);
      expect(after.indexOf("Travel insurance")).toBeGreaterThan(before.indexOf("Travel insurance"));
    } finally {
      vi.useRealTimers();
    }
  });
});
