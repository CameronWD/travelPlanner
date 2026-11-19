import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";

describe("Input", () => {
  it("keeps the shared frame", () => {
    render(<Input aria-label="n" />);
    const cls = screen.getByLabelText("n").className;
    for (const c of ["rounded-md", "border-2", "border-input", "bg-card"]) expect(cls.split(" ")).toContain(c);
  });

  it("marks an empty controlled date field", () => {
    render(<Input type="date" aria-label="d" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("d")).toHaveAttribute("data-empty");
  });

  it("does not mark a date field with a value", () => {
    render(<Input type="date" aria-label="d" value="2026-01-02" onChange={() => {}} />);
    expect(screen.getByLabelText("d")).not.toHaveAttribute("data-empty");
  });

  it("never marks a text input", () => {
    render(<Input aria-label="t" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("t")).not.toHaveAttribute("data-empty");
  });
});
