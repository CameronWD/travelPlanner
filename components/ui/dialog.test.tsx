import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogTitle>Invite traveller</DialogTitle>
        <DialogDescription>Share this trip by email.</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("does not render content when closed", () => {
    render(<Example />);
    expect(screen.queryByText("Invite traveller")).not.toBeInTheDocument();
  });

  it("opens on trigger click", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(
      await screen.findByRole("dialog"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invite traveller")).toBeInTheDocument();
  });

  it("closes via the close button", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Invite traveller")).not.toBeInTheDocument();
  });

  it("closes on escape", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Invite traveller")).not.toBeInTheDocument();
  });
});
