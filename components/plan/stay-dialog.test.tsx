import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StayDialog } from "./stay-dialog";

describe("StayDialog", () => {
  it("hosts the accommodation rows and + Add a stay", async () => {
    const onAdd = vi.fn();
    render(<StayDialog open onOpenChange={vi.fn()} stopName="Paris" rows={<div>row</div>} onAdd={onAdd} />);
    expect(screen.getByRole("dialog", { name: "Staying in Paris" })).toBeInTheDocument();
    expect(screen.getByText("row")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(onAdd).toHaveBeenCalled();
  });
});
