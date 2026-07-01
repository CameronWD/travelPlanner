import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";

describe("PopoverContent", () => {
  it("caps its width to the viewport", () => {
    render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <span>Content</span>
        </PopoverContent>
      </Popover>,
    );
    const content = screen.getByText("Content");
    const popover = content.closest('[class*="max-w-[calc(100vw-1rem)]"]');
    expect(popover).not.toBeNull();
  });
});
