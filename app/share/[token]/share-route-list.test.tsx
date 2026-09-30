import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ShareRouteList, type RouteListStop } from "./share-route-list";
import { ShareTally } from "./share-tally";

const stops: RouteListStop[] = [
  { id: "a", name: "London", country: "England", sortOrder: 0, arriveDate: "2026-12-05", departDate: "2026-12-10", nights: 5, status: "past" },
  { id: "b", name: "Paris", country: "France", sortOrder: 1, arriveDate: "2026-12-10", departDate: "2026-12-15", nights: 5, status: "current" },
  { id: "c", name: "Rome", country: "Italy", sortOrder: 2, arriveDate: "2026-12-15", departDate: "2026-12-22", nights: 7, status: "future" },
];
const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("ShareRouteList (SHARE.md §5)", () => {
  it("before: compact dates, no count", () => {
    render(<ShareRouteList stage="before" stops={stops.map((s) => ({ ...s, status: "future" }))} />);
    expect(screen.getByRole("heading", { name: "The route" })).toBeInTheDocument();
    expect(within(row("Rome")).getByText("15–22 Dec")).toBeInTheDocument();
    expect(screen.queryByText(/done/)).not.toBeInTheDocument();
  });
  it("during: Been, Here now (highlighted), dates, and a done count", () => {
    render(<ShareRouteList stage="during" stops={stops} />);
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(within(row("London")).getByText("Been")).toBeInTheDocument();
    expect(within(row("Paris")).getByText("Here now")).toBeInTheDocument();
    expect(row("Paris").className).toMatch(/bg-coral\/20/);
    expect(within(row("Paris")).getByText("France · 5 nights")).toBeInTheDocument();
  });
  it("after: nights tags and All N", () => {
    render(<ShareRouteList stage="after" stops={stops.map((s) => ({ ...s, status: "past" }))} />);
    expect(screen.getByText("All 3")).toBeInTheDocument();
    expect(within(row("Rome")).getByText("7 nights")).toBeInTheDocument();
  });
  it("no longer lists transport or accommodation", () => {
    const { container } = render(<ShareRouteList stage="during" stops={stops} />);
    expect(container.textContent).not.toMatch(/Flight|Hotel|→/);
  });
  it("shows the empty state with no stops", () => {
    render(<ShareRouteList stage="before" stops={[]} />);
    expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
  });
});

describe("ShareTally (SHARE.md §6)", () => {
  it("three cells — nights, stops, countries — and never money", () => {
    const { container } = render(<ShareTally nights={35} stops={6} countries={4} />);
    for (const [n, l] of [["35", "nights"], ["6", "stops"], ["4", "countries"]]) {
      expect(screen.getByText(n)).toBeInTheDocument();
      expect(screen.getByText(l)).toBeInTheDocument();
    }
    expect(container.textContent).not.toMatch(/[$€£]|km|spent/);
  });
});
