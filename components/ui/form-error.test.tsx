import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormError } from "./form-error";

describe("FormError", () => {
  it("renders nothing when empty", () => {
    const { container } = render(<FormError>{null}</FormError>);
    expect(container).toBeEmptyDOMElement();
  });
  it("renders an alert with the message", () => {
    render(<FormError>Could not save</FormError>);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save");
  });
});
