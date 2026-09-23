import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "@/components/ui/logo";

describe("Logo", () => {
  it("gives variant='mark' an accessible name, not just a hidden svg", () => {
    render(<Logo variant="mark" />);
    expect(screen.getByRole("img", { name: "Teepee" })).toBeInTheDocument();
  });

  it("gives variant='wordmark' an accessible name", () => {
    render(<Logo variant="wordmark" />);
    expect(screen.getByRole("img", { name: "Teepee" })).toBeInTheDocument();
  });

  it("gives the default lockup an accessible name", () => {
    render(<Logo />);
    expect(screen.getByRole("img", { name: "Teepee" })).toBeInTheDocument();
  });
});
