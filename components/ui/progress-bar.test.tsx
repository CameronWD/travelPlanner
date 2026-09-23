import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "@/components/ui/progress-bar";

describe("ProgressBar", () => {
  it("exposes the value on a progressbar role", () => {
    render(<ProgressBar value={59} label="Locked in" />);
    const bar = screen.getByRole("progressbar", { name: "Locked in" });
    expect(bar).toHaveAttribute("aria-valuenow", "59");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps out-of-range values rather than overflowing the track", () => {
    const { rerender } = render(<ProgressBar value={140} label="Over" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

    rerender(<ProgressBar value={-20} label="Under" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("rounds fractional values", () => {
    render(<ProgressBar value={33.6} label="Part way" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "34");
  });
});
