import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Select, SelectTrigger, SelectValue } from "./select";

/**
 * iOS Safari auto-zooms the page when a focused control's font-size is <16px.
 * Every text-entry primitive must therefore be text-base (16px) below sm and
 * may only drop to text-sm (14px) from sm up.
 */
describe("form controls are ≥16px on mobile (iOS zoom guard)", () => {
  it("Input is text-base on mobile, text-sm from sm up", () => {
    render(<Input aria-label="name" />);
    const el = screen.getByRole("textbox", { name: "name" });
    expect(el.className).toContain("text-base");
    expect(el.className).toContain("sm:text-sm");
    expect(el.className.split(" ")).not.toContain("text-sm");
  });

  it("Textarea is text-base on mobile, text-sm from sm up", () => {
    render(<Textarea aria-label="notes" />);
    const el = screen.getByRole("textbox", { name: "notes" });
    expect(el.className).toContain("text-base");
    expect(el.className).toContain("sm:text-sm");
  });

  it("SelectTrigger is text-base on mobile, text-sm from sm up", () => {
    render(
      <Select>
        <SelectTrigger aria-label="pick">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
      </Select>,
    );
    const el = screen.getByRole("combobox", { name: "pick" });
    expect(el.className).toContain("text-base");
    expect(el.className).toContain("sm:text-sm");
  });
});
