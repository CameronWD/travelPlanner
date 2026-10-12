import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SurpriseDialog } from "./surprise-dialog";

const MEMBERS = [
  { id: "cam", name: "Cam Williams", image: null },
  { id: "sam", name: "Sam Jones", image: null },
  { id: "alex", name: "Alex Lee", image: null },
];
const renderDialog = (over = {}) => {
  const onConfirm = vi.fn();
  render(
    <SurpriseDialog open onOpenChange={vi.fn()} members={MEMBERS} currentUserId="cam"
      initialForIds={["sam", "alex"]} label="Paris" onConfirm={onConfirm} {...over} />,
  );
  return { onConfirm };
};

describe("SurpriseDialog (CONTEXT.md Surprise)", () => {
  it("is titled Surprise for… and ticks everyone but the planner by default", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Surprise for…" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Cam" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Sam" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alex" })).toBeChecked();
  });

  it("Make it a surprise is disabled with no one ticked", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("checkbox", { name: "Sam" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Alex" }));
    expect(screen.getByRole("button", { name: "Make it a surprise" })).toBeDisabled();
  });

  it("confirms with the ticked ids, a helper left in on it", async () => {
    const { onConfirm } = renderDialog();
    await userEvent.click(screen.getByRole("checkbox", { name: "Alex" }));
    await userEvent.click(screen.getByRole("button", { name: "Make it a surprise" }));
    expect(onConfirm).toHaveBeenCalledWith(["sam"]);
  });
});
