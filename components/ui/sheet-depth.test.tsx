import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SheetDepthProvider, useSheetDepth } from "./sheet-depth";

function Depth() {
  return <span data-testid="depth">{useSheetDepth()}</span>;
}

describe("useSheetDepth", () => {
  it("is 0 outside any sheet", () => {
    render(<Depth />);
    expect(screen.getByTestId("depth")).toHaveTextContent("0");
  });

  it("is 1 inside one sheet's content", () => {
    render(
      <SheetDepthProvider>
        <Depth />
      </SheetDepthProvider>,
    );
    expect(screen.getByTestId("depth")).toHaveTextContent("1");
  });

  it("is 2 inside a sheet opened from a sheet", () => {
    render(
      <SheetDepthProvider>
        <SheetDepthProvider>
          <Depth />
        </SheetDepthProvider>
      </SheetDepthProvider>,
    );
    expect(screen.getByTestId("depth")).toHaveTextContent("2");
  });
});
