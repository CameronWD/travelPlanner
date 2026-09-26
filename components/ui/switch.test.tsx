import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "@/components/ui/switch";

describe("Switch", () => {
  it("reflects checked state as aria-checked and toggles on click", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} />);

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await userEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("has an invisible 44px-tall hit area on top of its smaller visible track", () => {
    render(<Switch checked={false} onCheckedChange={vi.fn()} />);
    expect(screen.getByRole("switch")).toHaveClass("before:h-11");
  });
});
