import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Field } from "./field";

describe("Field", () => {
  it("keeps 10px between its label and its control", () => {
    const { container } = render(
      <Field label="Name">
        <input />
      </Field>,
    );
    const field = container.querySelector('[data-slot="field"]');
    expect(field?.className).toContain("gap-2.5");
    expect(field?.className).not.toContain("gap-1.5");
  });
});
