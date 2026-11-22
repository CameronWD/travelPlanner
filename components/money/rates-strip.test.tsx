import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// rates-panel.tsx imports server actions that hit Postgres at module-eval
// time (see components/trip/rates-panel.test.tsx) — mock them so the real
// module (spread via `orig` below) can load under vitest with no DATABASE_URL.
const refreshRates = vi.fn();
vi.mock("@/server/actions/rates", () => ({
  setManualRate: vi.fn(),
  clearManualRate: vi.fn(),
  refreshRates: (...a: unknown[]) => refreshRates(...a),
}));
const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => toastMock(...a) }));
const reduced = { current: false };
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => reduced.current }));

vi.mock("@/components/trip/rates-panel", async (orig) => ({
  ...(await orig<typeof import("@/components/trip/rates-panel")>()),
  RatesPanel: ({ rates }: { rates: { currency: string }[] }) => <div data-testid="rates-panel" data-currencies={rates.map((r) => r.currency).join(",")} />,
}));

import { MotionProvider } from "@/components/ui/motion-provider";
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

  it("titles the dialog of an inverted rate with the home currency first", async () => {
    render(<RatesStrip {...base} rates={[{ currency: "VND", rate: 0.0000612, source: "fetched", stale: false }]} />);
    await userEvent.click(screen.getByRole("button", { name: /^1 AUD = / }));
    expect(screen.getByRole("heading", { name: "AUD to VND" })).toBeInTheDocument();
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

  describe("refresh all", () => {
    beforeEach(() => {
      refreshRates.mockReset();
      toastMock.mockReset();
      reduced.current = false;
    });

    it("the header holds an icon-only Refresh all rates button", () => {
      render(<RatesStrip {...base} />);
      const strip = screen.getByRole("region", { name: /Rates to AUD/ });
      const button = within(strip).getByRole("button", { name: "Refresh all rates" });
      expect(button.textContent).toBe("");
    });

    it("refreshes every currency in the strip and the note reads Updated just now", async () => {
      refreshRates.mockResolvedValueOnce({ results: [{ base: "EUR", rate: 1.7 }] });
      render(<RatesStrip {...base} />);
      await userEvent.click(screen.getByRole("button", { name: "Refresh all rates" }));
      expect(refreshRates).toHaveBeenCalledWith("t1", ["EUR", "GBP", "IDR"], "AUD");
      expect(await screen.findByText("Updated just now")).toBeInTheDocument();
      expect(screen.queryByText("Updated 2h ago")).toBeNull();
    });

    it("Updated just now holds for a minute through new rates, then gives way to the note; a second refresh restarts it", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        refreshRates.mockResolvedValue({ results: [{ base: "EUR", rate: 1.7 }] });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const { rerender } = render(<RatesStrip {...base} />);
        await user.click(screen.getByRole("button", { name: "Refresh all rates" }));
        await screen.findByText("Updated just now");
        rerender(<RatesStrip {...base} rates={[{ ...RATES[0], rate: 1.7 }, RATES[1], RATES[2]]} note="Updated 1m ago" />);
        act(() => void vi.advanceTimersByTime(59_000));
        expect(screen.getByText("Updated just now")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Refresh all rates" }));
        await waitFor(() => expect(refreshRates).toHaveBeenCalledTimes(2));
        act(() => void vi.advanceTimersByTime(59_000));
        expect(screen.getByText("Updated just now")).toBeInTheDocument();
        act(() => void vi.advanceTimersByTime(2_000));
        expect(screen.getByText("Updated 1m ago")).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a failed refresh toasts and leaves the note alone", async () => {
      refreshRates.mockRejectedValueOnce(new Error("down"));
      render(<RatesStrip {...base} />);
      await userEvent.click(screen.getByRole("button", { name: "Refresh all rates" }));
      await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn’t refresh rates. Try again." }));
      expect(screen.getByText("Updated 2h ago")).toBeInTheDocument();
    });
  });

  describe("a rate that changes", () => {
    beforeEach(() => {
      reduced.current = false;
    });
    const withEur = (rate: number) => [{ currency: "EUR", rate, source: "fetched" as const, stale: false }];

    it("counts to the new figure over 400ms and the cell pops", async () => {
      const { rerender } = render(<RatesStrip {...base} rates={withEur(1.5)} />, { wrapper: MotionProvider });
      rerender(<RatesStrip {...base} rates={withEur(2.5)} />);
      const cell = screen.getByRole("button", { name: "EUR rate 2.5" });
      expect(cell.className).toContain("tp-pop");
      const seen = new Set<string>();
      await waitFor(
        () => {
          seen.add(within(cell).getByTestId("rate-figure").textContent!);
          expect(within(cell).getByTestId("rate-figure").textContent).toBe("2.5");
        },
        { timeout: 1500, interval: 10 },
      );
      expect([...seen].some((t) => t !== "1.5" && t !== "2.5")).toBe(true);
    });

    it("shows the new figure at once under reduced motion", async () => {
      reduced.current = true;
      const { rerender } = render(<RatesStrip {...base} rates={withEur(1.5)} />, { wrapper: MotionProvider });
      rerender(<RatesStrip {...base} rates={withEur(2.5)} />);
      await waitFor(() => expect(screen.getByTestId("rate-figure").textContent).toBe("2.5"), { timeout: 100 });
    });

    it("a stale cell loses its icon once its rate is fetched", () => {
      const stale = [{ currency: "GBP", rate: 1.94, source: "stale" as const, stale: true }];
      const { rerender } = render(<RatesStrip {...base} rates={stale} />, { wrapper: MotionProvider });
      expect(screen.getByRole("button", { name: /GBP rate 1.94/ }).querySelector("svg")).not.toBeNull();
      rerender(<RatesStrip {...base} rates={[{ ...stale[0], source: "fetched", stale: false }]} />);
      expect(screen.getByRole("button", { name: "GBP rate 1.94" }).querySelector("svg")).toBeNull();
    });
  });
});
