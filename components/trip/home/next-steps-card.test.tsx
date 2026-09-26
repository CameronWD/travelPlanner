import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextStepsCard } from "./next-steps-card";
import type { NextStep } from "@/lib/next-steps";

const warn: NextStep = { id: "a", title: "No accommodation for Paris.", href: "/trips/t/plan", severity: "warning", source: "flag" };
const info: NextStep = { id: "b", title: "Start your packing list.", href: "/trips/t/checklists", severity: "info", source: "nudge" };
const infoWithSubtitle: NextStep = { id: "c", title: "Set your trip dates", subtitle: "Start firming up the itinerary.", href: "/trips/t/plan", severity: "info", source: "nudge" };
const transport: NextStep = { id: "d", title: "Book transport", subtitle: "No times booked yet.", href: "/trips/t/plan", severity: "info", source: "nudge", kind: "transport" };

describe("NextStepsCard", () => {
  it("celebrates the empty state", () => {
    render(<NextStepsCard steps={[]} />);
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
  });

  it("renders steps as links to their hrefs", () => {
    render(<NextStepsCard steps={[warn]} />);
    expect(screen.getByRole("link", { name: /no accommodation for paris/i })).toHaveAttribute("href", "/trips/t/plan");
  });

  /** The icon tile at the start of a step's row. */
  const tileOf = (name: RegExp) => screen.getByRole("link", { name }).querySelector("span[aria-hidden='true']")!;

  it("shows a count badge and status-toned tiles: warning takes the status token, info a neutral tile", () => {
    render(<NextStepsCard steps={[warn, info]} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(tileOf(/no accommodation/i).className).toMatch(/\bbg-warning\b/); // status = state
    expect(tileOf(/packing list/i).className).toMatch(/\bbg-card\b/); // info: neutral, not a hue
    expect(tileOf(/packing list/i).className).not.toMatch(/bg-hue-/);
  });

  it("is a kit Card whose rows are ≥44px links with the kit tile shape", () => {
    const { container } = render(<NextStepsCard steps={[warn]} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bshadow-hard-\d\b/);
    const link = screen.getByRole("link", { name: /no accommodation/i });
    expect(link.className).toMatch(/\bmin-h-11\b/);
    expect(tileOf(/no accommodation/i).className).toMatch(/\bborder-2\b/);
    expect(screen.getByRole("heading", { name: /next steps/i })).toBeInTheDocument();
  });

  it("renders subtitle line when subtitle is present", () => {
    render(<NextStepsCard steps={[infoWithSubtitle]} />);
    expect(screen.getByText("Set your trip dates")).toBeInTheDocument();
    expect(screen.getByText("Start firming up the itinerary.")).toBeInTheDocument();
  });

  it("renders an ink (bg-primary) tile for a transport step", () => {
    render(<NextStepsCard steps={[transport]} />);
    expect(tileOf(/book transport/i).className).toMatch(/\bbg-primary\b/);
    // should NOT use a hue for transport
    expect(tileOf(/book transport/i).className).not.toMatch(/bg-hue-/);
  });
});
