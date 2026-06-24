import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextStepsCard } from "./next-steps-card";

describe("NextStepsCard", () => {
  it("celebrates the empty state", () => {
    render(<NextStepsCard steps={[]} />);
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
  });

  it("renders steps as links to their hrefs", () => {
    render(
      <NextStepsCard
        steps={[{ id: "a", title: "No accommodation for Paris.", href: "/trips/t/plan", severity: "warning", source: "flag" }]}
      />,
    );
    const link = screen.getByRole("link", { name: /no accommodation for paris/i });
    expect(link).toHaveAttribute("href", "/trips/t/plan");
  });
});
