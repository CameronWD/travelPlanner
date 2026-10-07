import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CompilerProbe, probe } from "./fixtures/compiler-probe";

describe("React Compiler (spec 2026-10-06 §I)", () => {
  it("compiles app code under test: a parent re-render does not re-render a static child", () => {
    probe.childRenders = 0;
    render(<CompilerProbe />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("1");
    expect(probe.childRenders).toBe(1);
  });
});
