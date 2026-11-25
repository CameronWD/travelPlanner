import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  markCostPaid: vi.fn(), markCostUnpaid: vi.fn(), deleteCost: vi.fn(),
  recordRefund: vi.fn(async () => ({ success: true })), markRefundReceived: vi.fn(async () => ({ success: true })), clearRefund: vi.fn(),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/trip/other-cost-editor", () => ({ OtherCostFormDialog: () => null }));
vi.mock("@/components/trip/cost-editor", () => ({ OwnedCostFormDialog: () => null }));

import { ToPayCard } from "./to-pay-card";
import type { ToPayInput } from "@/lib/money/to-pay";
import type { CostRow } from "@/server/actions/costs";

function input(over: Partial<ToPayInput> & { id: string }): ToPayInput {
  return { displayLabel: over.id, costMinor: 10000, paidMinor: null, currency: "AUD", rateToHome: null, paidAt: null, refundMinor: null, refundedAt: null, dueDate: null, ownerType: "OTHER", settlement: "BEFORE", ...over };
}
const PAID = new Date("2026-09-02");
const COSTS: ToPayInput[] = [
  input({ id: "unpaid" }),
  input({ id: "paid", paidMinor: 10000, paidAt: PAID }),
  input({ id: "nopaidamount", paidAt: PAID }),
  input({ id: "waiting", paidMinor: 10000, paidAt: PAID, refundMinor: 4000 }),
  input({ id: "cancelled", paidMinor: 10000, paidAt: PAID, refundMinor: 10000, refundedAt: new Date("2026-09-10") }),
  input({ id: "partial", paidMinor: 10000, paidAt: PAID, refundMinor: 3000, refundedAt: new Date("2026-09-10") }),
];
const costRows = COSTS.map((c) => ({ ...c, label: c.displayLabel, category: null, ownerId: null })) as unknown as CostRow[];

beforeEach(() => vi.clearAllMocks());

function renderCard() {
  return render(<ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={COSTS} costRows={costRows} recentIds={[]} />);
}

describe("To pay refunds", () => {
  it("offers Refund on a paid row but not an unpaid one", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for unpaid" }));
    expect(screen.queryByRole("menuitem", { name: "Refund" })).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "More for paid" }));
    expect(await screen.findByRole("menuitem", { name: "Refund" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Received" })).toBeNull();
  });

  it("offers no Refund on a paid Cost with no paid amount", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for nopaidamount" }));
    expect(screen.queryByRole("menuitem", { name: "Refund" })).toBeNull();
  });

  it("a row with an expected refund shows the tag and a Received action that opens the dialog on Received", async () => {
    const user = userEvent.setup();
    renderCard();
    const row = screen.getAllByRole("listitem", { name: "waiting" })[0];
    expect(row).toHaveTextContent("refund expected");
    await user.click(within(row).getByRole("button", { name: "More for waiting" }));
    await user.click(await screen.findByRole("menuitem", { name: "Received" }));
    expect(await screen.findByRole("radio", { name: "Received" })).toBeChecked();
  });

  it("moves a zero-net row into a Refunded group; a part-refunded row stays", () => {
    renderCard();
    const group = screen.getByRole("list", { name: "Refunded costs" });
    expect(within(group).getByRole("listitem", { name: "cancelled" })).toBeInTheDocument();
    expect(within(group).queryByRole("listitem", { name: "partial" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Refunded" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "To pay" })).queryByRole("listitem", { name: "cancelled" })).toBeNull();
  });

  it("an expected Refund never puts a row in Refunded, even when it equals the paid amount", () => {
    const only = [input({ id: "wait-all", paidMinor: 10000, paidAt: PAID, refundMinor: 10000 })];
    const rows = only.map((c) => ({ ...c, label: c.displayLabel, category: null, ownerId: null })) as unknown as CostRow[];
    render(<ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={only} costRows={rows} recentIds={[]} />);
    expect(screen.queryByRole("list", { name: "Refunded costs" })).toBeNull();
  });

  it("groups by the shown amount: a received Refund taking a part-paid Cost to zero is Refunded", () => {
    const only = [
      input({ id: "part-gone", costMinor: 200000, paidMinor: 50000, paidAt: PAID, refundMinor: 50000, refundedAt: new Date("2026-09-10") }),
      input({ id: "part-wait", costMinor: 200000, paidMinor: 50000, paidAt: PAID, refundMinor: 50000 }),
    ];
    const rows = only.map((c) => ({ ...c, label: c.displayLabel, category: null, ownerId: null })) as unknown as CostRow[];
    render(<ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={only} costRows={rows} recentIds={[]} />);
    const group = screen.getByRole("list", { name: "Refunded costs" });
    expect(within(group).getByRole("listitem", { name: "part-gone" })).toBeInTheDocument();
    expect(within(group).queryByRole("listitem", { name: "part-wait" })).toBeNull();
  });

  it("caps the Refunded group on the card like the To pay list, and the sheet lists them all", async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      input({ id: `gone${i}`, paidMinor: 10000, paidAt: PAID, refundMinor: 10000, refundedAt: new Date("2026-09-10") }),
    );
    const rows = many.map((c) => ({ ...c, label: c.displayLabel, category: null, ownerId: null })) as unknown as CostRow[];
    render(<ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={many} costRows={rows} recentIds={[]} />);
    const items = within(screen.getByRole("list", { name: "Refunded costs" })).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    const onPhone = items.filter((li) => !li.classList.contains("max-md:hidden"));
    const onDesktop = items.filter((li) => !li.classList.contains("md:hidden"));
    expect(onPhone).toHaveLength(2);
    expect(onDesktop).toHaveLength(5);

    await userEvent.setup().click(screen.getByRole("button", { name: /^All 7 costs/ }));
    const sheet = within(await screen.findByRole("dialog"));
    const all = within(sheet.getByRole("list", { name: "Refunded costs" })).getAllByRole("listitem");
    expect(all).toHaveLength(7);
    expect(all.some((li) => li.classList.contains("md:hidden") || li.classList.contains("max-md:hidden"))).toBe(false);
  });
});
