import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// rates-panel.tsx imports server actions that hit Postgres at module-eval
// time (see components/trip/rates-panel.test.tsx) — mock them so the real
// module (spread via `orig` below) can load under vitest with no DATABASE_URL.
vi.mock("@/server/actions/rates", () => ({
  setManualRate: vi.fn(),
  clearManualRate: vi.fn(),
  refreshRates: vi.fn(),
}));

vi.mock("@/components/trip/rates-panel", async (orig) => ({
  ...(await orig<typeof import("@/components/trip/rates-panel")>()),
  RatesPanel: ({ rates }: { rates: { currency: string }[] }) => <div data-testid="rates-panel" data-currencies={rates.map((r) => r.currency).join(",")} />,
}));

import { RatesStrip } from "./rates-strip";
import type { RateEntry } from "@/components/trip/rates-panel";

const RATES: RateEntry[] = [
  { currency: "EUR", rate: 1.63, source: "fetched", stale: false },
  { currency: "GBP", rate: 1.94, source: "stale", stale: true },
  { currency: "IDR", rate: null, source: "none", stale: false },
];
const base = { tripId: "t1", homeCurrency: "AUD", rates: RATES, note: "Updated 2h ago", missingLine: "2 IDR costs left out of totals until you set a rate." };

describe("Rates strip (MONEY.md §6)", () => {
  it("a sun tile headed Rates to AUD with the updated note", () => {
    render(<RatesStrip {...base} />);
    const strip = screen.getByRole("region", { name: /Rates to AUD/ });
    for (const c of ["bg-sun", "text-on-accent", "border-2", "rounded-xl", "shadow-hard-3"]) expect(strip.className.split(/\s+/)).toContain(c);
    expect(within(strip).getByText("Updated 2h ago")).toBeInTheDocument();
  });

  it("one cell per currency: fetched, stale (with a refresh icon) and missing (dashed, Set rate)", () => {
    render(<RatesStrip {...base} />);
    expect(screen.getByRole("button", { name: "EUR rate 1.63" })).toBeInTheDocument();
    const gbp = screen.getByRole("button", { name: "GBP rate 1.94, may be out of date" });
    expect(within(gbp).getByText("1.94").className).toContain("text-sun-text");
    expect(gbp.querySelector("svg")).not.toBeNull();
    const idr = screen.getByRole("button", { name: "Set a rate for IDR" });
    expect(idr.className).toContain("border-dashed");
    expect(within(idr).getByText("Set rate")).toBeInTheDocument();
  });

  it("the missing line sits under the grid", () => {
    render(<RatesStrip {...base} />);
    expect(screen.getByText("2 IDR costs left out of totals until you set a rate.")).toBeInTheDocument();
  });

  it("a cell opens the rates panel for that currency", async () => {
    const user = userEvent.setup();
    render(<RatesStrip {...base} />);
    await user.click(screen.getByRole("button", { name: "Set a rate for IDR" }));
    expect(await screen.findByTestId("rates-panel")).toHaveAttribute("data-currencies", "IDR");
  });

  it("renders nothing with no foreign currencies", () => {
    const { container } = render(<RatesStrip {...base} rates={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
