import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock server actions so the client component can be imported in vitest
vi.mock("@/server/actions/rates", () => ({
  setManualRate: vi.fn(),
  clearManualRate: vi.fn(),
  refreshRates: vi.fn(),
}));

import { setManualRate } from "@/server/actions/rates";
import { SourceBadge, formatRate, displayRate, RatesPanel } from "./rates-panel";

// ---------------------------------------------------------------------------
// formatRate — adaptive precision
// ---------------------------------------------------------------------------

describe("displayRate", () => {
  it("turns a rate under 0.01 the other way round", () => {
    const d = displayRate({ currency: "VND", rate: 0.0000612 }, "AUD");
    expect(d).toEqual({ from: "AUD", to: "VND", figure: formatRate(1 / 0.0000612), inverted: true });
  });

  it("turns 0.0011 the other way round", () => {
    expect(displayRate({ currency: "JPY", rate: 0.0011 }, "AUD").inverted).toBe(true);
  });

  it("leaves 0.0098 as stored", () => {
    expect(displayRate({ currency: "JPY", rate: 0.0098 }, "AUD")).toEqual({ from: "JPY", to: "AUD", figure: "0.0098", inverted: false });
  });

  it("leaves a rate of 0.65 as it is", () => {
    expect(displayRate({ currency: "EUR", rate: 0.65 }, "AUD")).toEqual({ from: "EUR", to: "AUD", figure: "0.65", inverted: false });
  });
});

describe("formatRate", () => {
  it("never uses exponent form for a very small rate", () => {
    expect(formatRate(0.0000612)).toBe("0.0000612");
    expect(formatRate(1e-7)).toBe("0.0000001");
  });

  it("shows 4 significant figures for a normal rate (e.g. 1.2345)", () => {
    expect(formatRate(1.2345678)).toBe("1.235");
  });

  it("does NOT render as '0.0000' for a very small rate", () => {
    const result = formatRate(0.000012345);
    expect(result).not.toBe("0.0000");
    // Should show meaningful digits (4 sig figs)
    expect(result).toBe("0.00001235");
  });

  it("handles a small rate like JPY→USD (e.g. 0.0067)", () => {
    const result = formatRate(0.0067891);
    expect(result).toBe("0.006789");
  });

  it("handles large rates (e.g. USD→JPY ~149)", () => {
    const result = formatRate(149.456);
    expect(result).toBe("149.5");
  });

  it("handles a rate of exactly 1 (trailing zeros stripped by parseFloat)", () => {
    // parseFloat("1.000") => 1 => "1" — acceptable, the value is clear
    expect(formatRate(1)).toBe("1");
  });

  it("does not add unnecessary trailing zeros beyond 4 significant figures for whole numbers", () => {
    // 1234 has 4 sig figs already — show as "1234"
    expect(formatRate(1234)).toBe("1234");
  });

  it("keeps large integer rates exact (e.g. VND/IDR ~23456 must not round to 23460)", () => {
    // Without the large-rate branch, toPrecision(4) would give "23460".
    expect(formatRate(23456)).toBe("23456");
  });

  it("rounds large non-integer rates to the nearest integer (e.g. 16432.7 → '16433')", () => {
    expect(formatRate(16432.7)).toBe("16433");
  });
});

// ---------------------------------------------------------------------------
// SourceBadge — stale badge only when genuinely stale
// ---------------------------------------------------------------------------

describe("SourceBadge", () => {
  it("shows 'Live' for a freshly fetched rate (source=fetched, stale=false)", () => {
    render(<SourceBadge source="fetched" stale={false} />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("shows 'Stale' only when source is 'stale'", () => {
    render(<SourceBadge source="stale" stale={true} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("does NOT show 'Stale' when source is 'fetched' even if stale prop is true (guard against mis-prop)", () => {
    render(<SourceBadge source="fetched" stale={true} />);
    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("shows 'Manual' for a manually set rate", () => {
    render(<SourceBadge source="manual" stale={false} />);
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("shows 'No rate' when source is 'none'", () => {
    render(<SourceBadge source="none" stale={false} />);
    expect(screen.getByText("No rate")).toBeInTheDocument();
  });
});

describe("RatesPanel editor for an inverted rate", () => {
  const rates = [{ currency: "VND", rate: 0.0000612, source: "fetched" as const, stale: false }];

  async function open() {
    const user = userEvent.setup();
    render(<RatesPanel tripId="t1" homeCurrency="AUD" rates={rates} />);
    await user.click(screen.getByRole("button", { name: "Set rate" }));
    return user;
  }

  it("opens with the home currency first and the inverted figure", async () => {
    await open();
    expect(screen.getByText("1 AUD =")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(Number(formatRate(1 / 0.0000612)));
  });

  it("stores the reciprocal of what was entered", async () => {
    vi.mocked(setManualRate).mockResolvedValue(undefined as never);
    const user = await open();
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "16000");
    await user.click(screen.getByRole("button", { name: "Lock rate" }));
    expect(setManualRate).toHaveBeenCalledWith("t1", "VND", "AUD", 1 / 16000);
  });

  it("locks the exact stored rate when submitted unchanged", async () => {
    vi.mocked(setManualRate).mockClear();
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Lock rate" }));
    expect(setManualRate).toHaveBeenCalledWith("t1", "VND", "AUD", 0.0000612);
  });
});
