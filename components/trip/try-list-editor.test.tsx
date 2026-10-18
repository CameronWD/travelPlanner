import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TryListEditor, draftFromTryList, tryListPayload, type TryListDraftEntry } from "./try-list-editor";

const LIST = [
  { id: "e1", text: "Lebkuchen", tried: true },
  { id: "e2", text: "Drei im Weggla", tried: false },
];

function Harness({ initial }: { initial: TryListDraftEntry[] }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <TryListEditor value={value} onChange={setValue} />
      <output data-testid="payload">{JSON.stringify(tryListPayload(value))}</output>
    </>
  );
}
const payload = () => JSON.parse(screen.getByTestId("payload").textContent!);

describe("draftFromTryList / tryListPayload", () => {
  it("round-trips ids and texts, never ticks, and drops blank entries", () => {
    const draft = draftFromTryList(LIST);
    expect(tryListPayload(draft)).toEqual([{ id: "e1", text: "Lebkuchen" }, { id: "e2", text: "Drei im Weggla" }]);
    expect(tryListPayload([...draft, { key: "k", text: "   ", tried: false }])).toHaveLength(2);
    expect(draftFromTryList(null)).toEqual([]);
  });

  it("folds non-blank pending text in as one more entry (M6); blank pending adds nothing", () => {
    const draft = draftFromTryList(LIST);
    expect(tryListPayload(draft, "  Schäufele ")).toEqual([{ id: "e1", text: "Lebkuchen" }, { id: "e2", text: "Drei im Weggla" }, { text: "Schäufele" }]);
    expect(tryListPayload(draft, "   ")).toHaveLength(2);
  });
});

describe("TryListEditor", () => {
  it("is a collapsed 'Try list' section that says how many things it holds", async () => {
    render(<Harness initial={draftFromTryList(LIST)} />);
    expect(screen.getByText("Try list").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("2 things")).toBeInTheDocument();
  });

  it("adds an entry with the Add button or Enter, with no id", async () => {
    const user = userEvent.setup();
    render(<Harness initial={draftFromTryList(LIST)} />);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "Schäufele");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("New thing to try"), "Glühwein{Enter}");
    expect(payload()).toEqual([
      { id: "e1", text: "Lebkuchen" },
      { id: "e2", text: "Drei im Weggla" },
      { text: "Schäufele" },
      { text: "Glühwein" },
    ]);
  });

  it("renames, removes and moves entries; a ticked one is marked Tried", async () => {
    const user = userEvent.setup();
    render(<Harness initial={draftFromTryList(LIST)} />);
    await user.click(screen.getByText("Try list"));
    expect(screen.getByText("Tried")).toBeInTheDocument();
    const second = screen.getByLabelText("Thing to try 2");
    await user.clear(second);
    await user.type(second, "Bratwurst");
    await user.click(screen.getByRole("button", { name: "Move Bratwurst up" }));
    expect(payload()).toEqual([{ id: "e2", text: "Bratwurst" }, { id: "e1", text: "Lebkuchen" }]);
    await user.click(screen.getByRole("button", { name: "Remove Lebkuchen" }));
    expect(payload()).toEqual([{ id: "e2", text: "Bratwurst" }]);
    expect(screen.getByRole("button", { name: "Move Bratwurst up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Bratwurst down" })).toBeDisabled();
  });

  it("announces a ticked entry as Tried on its input", async () => {
    const user = userEvent.setup();
    render(<Harness initial={draftFromTryList(LIST)} />);
    await user.click(screen.getByText("Try list"));
    expect(screen.getByLabelText("Thing to try 1")).toHaveAccessibleDescription("Tried");
    expect(screen.getByLabelText("Thing to try 2")).not.toHaveAccessibleDescription();
  });

  it("Enter in an entry's rename input never submits the dialog's form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={onSubmit}><Harness initial={draftFromTryList(LIST)} /><button type="submit">Save</button></form>);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("Thing to try 2"), "!{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(payload()[1]).toEqual({ id: "e2", text: "Drei im Weggla!" });
  });

  it("after a move, focus follows the entry, or goes to its other move button when the clicked one is disabled", async () => {
    const user = userEvent.setup();
    const three = [...LIST, { id: "e3", text: "Glühwein", tried: false }];
    render(<Harness initial={draftFromTryList(three)} />);
    await user.click(screen.getByText("Try list"));
    await user.click(screen.getByRole("button", { name: "Move Glühwein up" }));
    expect(screen.getByRole("button", { name: "Move Glühwein up" })).toHaveFocus(); // now 2nd: still enabled
    await user.click(screen.getByRole("button", { name: "Move Glühwein up" }));
    expect(payload()[0]).toEqual({ id: "e3", text: "Glühwein" });
    expect(screen.getByRole("button", { name: "Move Glühwein up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Glühwein down" })).toHaveFocus();
  });

  it("can hold its pending text for the dialog", async () => {
    const user = userEvent.setup();
    const onPendingChange = vi.fn();
    render(<TryListEditor value={[]} onChange={() => {}} pending="Lebk" onPendingChange={onPendingChange} />);
    await user.click(screen.getByText("Try list"));
    expect(screen.getByLabelText("New thing to try")).toHaveValue("Lebk");
    await user.type(screen.getByLabelText("New thing to try"), "u");
    expect(onPendingChange).toHaveBeenLastCalledWith("Lebku");
  });

  it("stops adding at 30 and says so", async () => {
    const user = userEvent.setup();
    const thirty = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, text: `Thing ${i}`, tried: false }));
    render(<Harness initial={draftFromTryList(thirty)} />);
    await user.click(screen.getByText("Try list"));
    expect(screen.getByLabelText("New thing to try")).toBeDisabled();
    expect(screen.getByText("A Try list holds up to 30 things.")).toBeInTheDocument();
  });

  it("opens to show a server error", () => {
    render(<TryListEditor value={[]} onChange={() => {}} error="Keep each one to 80 characters" />);
    expect(screen.getByText("Try list").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Keep each one to 80 characters")).toBeInTheDocument();
  });
});
