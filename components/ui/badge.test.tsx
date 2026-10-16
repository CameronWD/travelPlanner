import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge status variants", () => {
  it("success is the success status token, not the teal hue", () => {
    render(<Badge variant="success">Added</Badge>);
    const cls = screen.getByText("Added").className;
    expect(cls).toMatch(/\bbg-success\b/);
    expect(cls).toMatch(/\btext-success-foreground\b/);
    expect(cls).not.toMatch(/\bbg-teal\b/);
  });

  it("warning is the warning status token, not the sun hue", () => {
    render(<Badge variant="warning">Pending</Badge>);
    const cls = screen.getByText("Pending").className;
    expect(cls).toMatch(/\bbg-warning\b/);
    expect(cls).toMatch(/\btext-warning-foreground\b/);
    expect(cls).not.toMatch(/\bbg-sun\b/);
  });

  it("keeps the hue tones as hues", () => {
    render(<><Badge variant="teal">T</Badge><Badge variant="sun">S</Badge></>);
    expect(screen.getByText("T").className).toMatch(/\bbg-teal\b/);
    expect(screen.getByText("S").className).toMatch(/\bbg-sun\b/);
  });
});
