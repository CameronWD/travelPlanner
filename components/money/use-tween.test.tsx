import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useTween } from "./use-tween";

function Probe({ value, skip }: { value: number; skip: boolean }) {
  return <span data-testid="v">{Math.round(useTween(value, { from: 0, duration: 0.7, skip }))}</span>;
}

describe("useTween", () => {
  it("returns the value at once when skipped (reduced motion / static)", () => {
    render(<Probe value={1234} skip />);
    expect(screen.getByTestId("v")).toHaveTextContent("1234");
  });
  it("starts from `from` when animating", () => {
    render(<Probe value={1234} skip={false} />);
    expect(Number(screen.getByTestId("v").textContent)).toBeLessThan(1234);
  });
});
