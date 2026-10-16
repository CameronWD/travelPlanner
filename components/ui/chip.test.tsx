import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chip } from "@/components/ui/chip";

describe("Chip", () => {
  it("renders a button that does not submit its form by default", () => {
    render(<Chip>Food</Chip>);
    expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("type", "button");
  });

  it("reflects selection as aria-pressed", () => {
    const { rerender } = render(<Chip selected={false}>Food</Chip>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(<Chip selected>Food</Chip>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves aria-pressed off when selection is not a concept", () => {
    render(<Chip>Add</Chip>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("calls onClick", async () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Food</Chip>);
    await userEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("grows its hit area to 44px on touch when asked", () => {
    const { rerender } = render(<Chip>Food</Chip>);
    expect(screen.getByRole("button").className).not.toContain("pointer-coarse:after:-inset-2");
    rerender(<Chip touch>Food</Chip>);
    const cls = screen.getByRole("button").className;
    expect(cls).toMatch(/(^|\s)relative(\s|$)/);
    expect(cls).toContain("pointer-coarse:after:absolute");
    expect(cls).toContain("pointer-coarse:after:-inset-2");
    expect(cls).toContain("pointer-coarse:after:content-['']");
  });

  it("does not pass touch through to the DOM", () => {
    render(<Chip touch>Food</Chip>);
    expect(screen.getByRole("button")).not.toHaveAttribute("touch");
  });
});
