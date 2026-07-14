import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextStepsCard } from "./next-steps-card";
import type { NextStep } from "@/lib/next-steps";

const warn: NextStep = { id: "a", title: "No accommodation for Paris.", href: "/trips/t/plan", severity: "warning", source: "flag" };
const info: NextStep = { id: "b", title: "Start your packing list.", href: "/trips/t/checklists", severity: "info", source: "nudge" };

describe("NextStepsCard", () => {
  it("celebrates the empty state", () => {
    render(<NextStepsCard steps={[]} />);
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
  });

  it("renders steps as links to their hrefs", () => {
    render(<NextStepsCard steps={[warn]} />);
    expect(screen.getByRole("link", { name: /no accommodation for paris/i })).toHaveAttribute("href", "/trips/t/plan");
  });

  it("shows a count badge and severity-hued icon chips", () => {
    const { container } = render(<NextStepsCard steps={[warn, info]} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(container.querySelector(".bg-amber-500")).toBeTruthy(); // warning chip
    expect(container.querySelector(".bg-sky-500")).toBeTruthy(); // info chip
  });
});
