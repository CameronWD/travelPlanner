import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpendSoFarCard } from "./spend-so-far-card";
import type { SpendSoFar } from "@/lib/spend-so-far";

const spend = (o: Partial<SpendSoFar> = {}): SpendSoFar => ({
  costTotalMinor: 68000,
  paidSoFarMinor: 20000,
  paidCostMinor: 20000,
  varianceMinor: -5000,
  costRemainingMinor: 48000,
  tripElapsedPct: 40,
  ...o,
});

describe("SpendSoFarCard compact (trip home, Task 10b)", () => {
  it("renders the kit 'Spent' glance: a Card with label, shared-pot note, paid figure and cost sub-line", () => {
    const { container } = render(<SpendSoFarCard compact spend={spend()} homeCurrency="AUD" />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bshadow-hard-\d\b/);
    expect(screen.getByRole("heading", { name: "Paid so far" })).toBeInTheDocument();
    expect(screen.getByText("shared pot")).toBeInTheDocument();
    expect(card.textContent).toContain("200.00");
    expect(card.textContent).toMatch(/of .*680\.00 cost · .*50\.00 under/);
    expect(card.textContent).not.toMatch(/per person|each owes|split/i);
  });

  it("renders nothing in compact mode when there is no spend data", () => {
    const { container } = render(
      <SpendSoFarCard compact spend={spend({ costTotalMinor: 0, paidSoFarMinor: 0, varianceMinor: 0 })} homeCurrency="AUD" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
