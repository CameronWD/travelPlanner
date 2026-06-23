import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedNumber } from "./animated-number";

describe("AnimatedNumber", () => {
  it("exposes the final value as an accessible label immediately", () => {
    render(<AnimatedNumber value={12300} format={(n) => String(Math.round(n))} />);
    expect(screen.getByLabelText("12300")).toBeInTheDocument();
  });

  it("renders a visible (aria-hidden) value node", () => {
    const { container } = render(
      <AnimatedNumber value={500} format={(n) => `$${Math.round(n)}`} />,
    );
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});
