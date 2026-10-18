import * as React from "react";
import { describe, expect, it } from "vitest";
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
