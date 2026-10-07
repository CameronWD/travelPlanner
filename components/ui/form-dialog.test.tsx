import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormDialog, useFormDirty } from "./form-dialog";

function Counter({ seed }: { seed: string }) {
  const [value] = React.useState(seed);
  return <div data-testid="seed">{value}</div>;
}

describe("FormDialog", () => {
  it("renders the title and children when open", () => {
    render(
      <FormDialog open onOpenChange={() => {}} title="Add a stop" recordId={null}>
        <Counter seed="new" />
      </FormDialog>,
    );
    expect(screen.getByText("Add a stop")).toBeInTheDocument();
    expect(screen.getByTestId("seed")).toHaveTextContent("new");
  });

  it("remounts children (re-seeding state) when recordId changes", () => {
    const { rerender } = render(
      <FormDialog open onOpenChange={() => {}} title="Edit" recordId="a">
        <Counter seed="a" />
      </FormDialog>,
    );
    expect(screen.getByTestId("seed")).toHaveTextContent("a");

    rerender(
      <FormDialog open onOpenChange={() => {}} title="Edit" recordId="b">
        <Counter seed="b" />
      </FormDialog>,
    );
    expect(screen.getByTestId("seed")).toHaveTextContent("b");
  });
});

function NameForm() {
  const [name, setName] = React.useState("");
  useFormDirty({ name });
  return <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />;
}

describe("FormDialog dirty guard (spec 2026-10-06 §M)", () => {
  it("an untouched form closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<FormDialog open onOpenChange={onOpenChange} title="Add a stop"><NameForm /></FormDialog>);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a dirty form asks first; Keep editing keeps the input", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<FormDialog open onOpenChange={onOpenChange} title="Add a stop"><NameForm /></FormDialog>);
    await user.type(screen.getByLabelText("Name"), "Rome");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard changes?")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("Rome");
  });

  it("Discard closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<FormDialog open onOpenChange={onOpenChange} title="Add a stop"><NameForm /></FormDialog>);
    await user.type(screen.getByLabelText("Name"), "Rome");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("honours an isDirty prop too", async () => {
    const onOpenChange = vi.fn();
    render(<FormDialog open onOpenChange={onOpenChange} title="X" isDirty><p>body</p></FormDialog>);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });
});
