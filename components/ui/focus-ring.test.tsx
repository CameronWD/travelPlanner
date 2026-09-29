import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Select, SelectTrigger, SelectValue } from "./select";

function classesOf(el: Element): string[] {
  return el.className.split(/\s+/);
}

describe("field focus ring (Feedback cmumcjr3i000304l08xwwegwg)", () => {
  it("Input keeps the lift and shadow but the ring hugs the box (offset 0)", () => {
    render(<Input aria-label="Name" />);
    const c = classesOf(screen.getByLabelText("Name"));
    expect(c).toContain("focus-visible:-translate-y-0.5");
    expect(c).toContain("focus-visible:shadow-hard-2");
    expect(c).toContain("focus-visible:outline-offset-0");
    expect(c).not.toContain("focus-visible:outline-offset-2");
  });

  it("Textarea matches", () => {
    render(<Textarea aria-label="Notes" />);
    const c = classesOf(screen.getByLabelText("Notes"));
    expect(c).toContain("focus-visible:outline-offset-0");
    expect(c).not.toContain("focus-visible:outline-offset-2");
  });

  it("SelectTrigger matches", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Currency">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
      </Select>,
    );
    const c = classesOf(screen.getByLabelText("Currency"));
    expect(c).toContain("focus-visible:outline-offset-0");
    expect(c).not.toContain("focus-visible:outline-offset-2");
  });
});
