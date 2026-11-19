import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";

describe("Input", () => {
  it("keeps the shared frame", () => {
    render(<Input aria-label="n" />);
    const cls = screen.getByLabelText("n").className;
    for (const c of ["rounded-md", "border-2", "border-input", "bg-card"]) expect(cls.split(" ")).toContain(c);
  });
});
