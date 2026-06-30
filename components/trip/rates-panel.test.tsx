import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock server actions so the client component can be imported in vitest
vi.mock("@/server/actions/rates", () => ({
  setManualRate: vi.fn(),
  clearManualRate: vi.fn(),
  refreshRates: vi.fn(),
}));

import { SourceBadge, formatRate } from "./rates-panel";

// ---------------------------------------------------------------------------
// formatRate — adaptive precision
// ---------------------------------------------------------------------------

describe("formatRate", () => {
  it("shows 4 significant figures for a normal rate (e.g. 1.2345)", () => {
    expect(formatRate(1.2345678)).toBe("1.235");
  });

  it("does NOT render as '0.0000' for a very small rate", () => {
    const result = formatRate(0.000012345);
    expect(result).not.toBe("0.0000");
    // Should show meaningful digits (4 sig figs — toPrecision(4) behavior)
    expect(result).toBe("0.00001234");
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
