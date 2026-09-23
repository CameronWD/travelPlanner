import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "@/components/ui/stepper";

describe("Stepper", () => {
  it("names the decrease and increase buttons after the control", () => {
    render(<Stepper value={5} onChange={vi.fn()} label="Nights" />);
    expect(screen.getByRole("button", { name: "Decrease Nights" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase Nights" })).toBeInTheDocument();
  });

  it("does not call onChange below min, and disables decrease at the limit", async () => {
    const onChange = vi.fn();
    render(<Stepper value={0} onChange={onChange} min={0} max={10} label="Nights" />);

    const decrease = screen.getByRole("button", { name: "Decrease Nights" });
    expect(decrease).toBeDisabled();

    await userEvent.click(decrease);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange above max, and disables increase at the limit", async () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} min={0} max={10} label="Nights" />);

    const increase = screen.getByRole("button", { name: "Increase Nights" });
    expect(increase).toBeDisabled();

    await userEvent.click(increase);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clamps to min/max rather than stepping past them", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stepper value={1} onChange={onChange} min={0} max={10} label="Nights" />);
    await userEvent.click(screen.getByRole("button", { name: "Decrease Nights" }));
    expect(onChange).toHaveBeenLastCalledWith(0);

    rerender(<Stepper value={9} onChange={onChange} min={0} max={10} label="Nights" />);
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("gives each button an invisible 44px hit area on top of its smaller visible size", () => {
    render(<Stepper value={5} onChange={vi.fn()} label="Nights" />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass("before:size-11");
    }
  });
});
