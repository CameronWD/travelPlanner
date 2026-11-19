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
import { rateFigureFontSize } from "./rate-cell";
import { formatRate, type RateEntry } from "@/components/trip/rates-panel";

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

  it("two strips on one page (Money + the All costs footer) each label themselves with a unique id", () => {
    const { container } = render(
      <>
        <RatesStrip {...base} />
        <RatesStrip {...base} />
      </>,
    );
    const headingIds = Array.from(container.querySelectorAll("h2")).map((h) => h.id);
    expect(headingIds).toHaveLength(2);
    expect(new Set(headingIds).size).toBe(2);
    const sections = container.querySelectorAll("section");
    sections.forEach((sec, i) => expect(sec.getAttribute("aria-labelledby")).toBe(headingIds[i]));
  });

  it("the heading sets its own on-accent ink — the global h2 rule paints headings --foreground, cream on sun in dark", () => {
    render(<RatesStrip {...base} />);
    expect(screen.getByRole("heading", { name: /Rates/ }).className.split(/\s+/)).toContain("text-on-accent");
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

  it("a very small rate reads the other way round, home currency first", () => {
    render(<RatesStrip {...base} rates={[{ currency: "VND", rate: 0.0000612, source: "fetched", stale: false }]} />);
    const cell = screen.getByRole("button", { name: `1 AUD = ${formatRate(1 / 0.0000612)} VND` });
    expect(cell.textContent).toMatch(/^1 AUD =/);
    expect(cell.textContent).toContain("VND");
  });

  it("sizes the figure from its tile, never truncating it", () => {
    render(<RatesStrip {...base} rates={[{ currency: "ZWL", rate: 0.000000001, source: "fetched", stale: false }]} />);
    const figure = screen.getByText("1000000000");
    expect(figure.parentElement!.parentElement!.className).toContain("@container");
    expect(figure.className).not.toContain("truncate");
  });

  it("rateFigureFontSize shrinks with the number's length", () => {
    expect(rateFigureFontSize(4)).toBe("clamp(9px, calc(100cqw / 2.48), 17px)");
    expect(rateFigureFontSize(6)).toBe("clamp(9px, calc(100cqw / 3.72), 17px)");
    expect(rateFigureFontSize(10)).toBe("clamp(9px, calc(100cqw / 6.2), 17px)");
    expect(rateFigureFontSize(14)).toBe("clamp(9px, calc(100cqw / 8.68), 17px)");
  });

  it("M10: a rate that was missing pops once it is set", () => {
    const { rerender } = render(<RatesStrip {...base} />);
    rerender(<RatesStrip {...base} rates={[RATES[0], RATES[1], { currency: "IDR", rate: 0.0001, source: "manual", stale: false }]} missingLine={null} />);
    const idr = screen.getByRole("button", { name: "1 AUD = 10000 IDR" });
    expect(idr.className).toContain("tp-pop");
    expect(idr.className).not.toContain("border-dashed");
  });
});
