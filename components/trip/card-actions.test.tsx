import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoreActionsMenu } from "./card-actions";

describe("MoreActionsMenu", () => {
  it("renders a trigger labelled for the subject and reveals its items on open", async () => {
    const onMoveUp = vi.fn();
    const user = userEvent.setup();
    render(
      <MoreActionsMenu
        label="More actions for Paris"
        items={[
          { key: "up", label: "Move up", onSelect: onMoveUp },
          { key: "down", label: "Move down", onSelect: vi.fn(), disabled: true },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "More actions for Paris" });
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Move up" }));
    expect(onMoveUp).toHaveBeenCalledOnce();
  });

  it("renders a size-8 trigger with a coarse-pointer touch expander", () => {
    render(<MoreActionsMenu label="More" items={[{ key: "a", label: "A", onSelect: () => {} }]} />);
    const trigger = screen.getByRole("button", { name: "More" });
    expect(trigger.className).toContain("size-8");
    expect(trigger.className).toContain("pointer-coarse:after:absolute");
  });

  it("disables items flagged disabled", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MoreActionsMenu
        label="More"
        items={[{ key: "down", label: "Move down", onSelect, disabled: true }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    const item = await screen.findByRole("menuitem", { name: "Move down" });
    expect(item).toHaveAttribute("data-disabled");
  });
});
