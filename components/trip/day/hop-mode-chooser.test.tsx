import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { setHopMode } = vi.hoisted(() => ({ setHopMode: vi.fn() }));
vi.mock("@/server/actions/hop-modes", () => ({ setHopMode }));

import { HopModeChooser } from "./hop-mode-chooser";

const base = { fromItemId: "a", toItemId: "b" };

describe("HopModeChooser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setHopMode.mockResolvedValue({ success: true });
  });

  it("shows the four options and marks the current one", async () => {
    render(<HopModeChooser {...base} mode="WALK" modeSetByHand />);
    await userEvent.click(screen.getByRole("button", { name: /Walk/ }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Automatic", "Walk", "Public transport", "Drive"]);
    expect(items.filter((i) => i.getAttribute("aria-current") === "true").map((i) => i.textContent)).toEqual(["Walk"]);
  });

  it("reads Automatic and marks it when the mode was not set by hand", async () => {
    render(<HopModeChooser {...base} mode="DRIVE" modeSetByHand={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Automatic/ }));
    expect(screen.getByRole("menuitem", { name: "Automatic" })).toHaveAttribute("aria-current", "true");
  });

  it("calls setHopMode with null for Automatic and with the mode for the others", async () => {
    render(<HopModeChooser {...base} mode="WALK" modeSetByHand />);
    await userEvent.click(screen.getByRole("button", { name: /Walk/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Automatic" }));
    expect(setHopMode).toHaveBeenCalledWith("a", "b", null);

    await userEvent.click(screen.getByRole("button", { name: /Walk/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Public transport" }));
    expect(setHopMode).toHaveBeenLastCalledWith("a", "b", "TRANSIT");
  });

  it("does not call the action when the current choice is picked again", async () => {
    render(<HopModeChooser {...base} mode="WALK" modeSetByHand />);
    await userEvent.click(screen.getByRole("button", { name: /Walk/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Walk" }));
    expect(setHopMode).not.toHaveBeenCalled();
  });
});
