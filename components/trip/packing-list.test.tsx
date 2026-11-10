import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  updateChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  toggleChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  deleteChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  reorderChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  setBuyState: vi.fn().mockResolvedValue({ success: true }),
  movePackingItem: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { addChecklistItem, movePackingItem } from "@/server/actions/checklists";

import { PackingList } from "./packing-list";
import { buildPackingSections, type PackingRow } from "@/lib/packing-sections";

const cam = { id: "cam", name: "Cam", image: null };
const sam = { id: "sam", name: "Sam", image: null };

function row(id: string, text: string, ownerId: string | null, extra: Partial<PackingRow> = {}): PackingRow {
  return { id, text, done: false, sortOrder: 0, buy: null, ownerId, packedBy: null, ...extra };
}

const rows = [
  row("m1", "Toothbrush", "cam"),
  row("sh1", "Tent", null, { done: true, packedBy: cam }),
  row("sam1", "Hiking boots", "sam", { done: true }),
  row("sam2", "Sunhat", "sam"),
];

function setup(open: boolean) {
  const sections = buildPackingSections(rows, [cam, sam], { userId: "cam", open });
  return render(<PackingList tripId="trip-1" sections={sections} viewerId="cam" open={open} />);
}

describe("PackingList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders Mine, Shared, then the partner's list collapsed", () => {
    const { container } = setup(true);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Mine", "Shared", "Sam"]);
    const partner = container.querySelector("details");
    expect(partner).not.toBeNull();
    expect((partner as HTMLDetailsElement).open).toBe(false);
  });

  it("partner rows show packed state with no tickbox or row controls", () => {
    const { container } = setup(true);
    const partner = container.querySelector("details") as HTMLElement;
    expect(within(partner).queryByRole("checkbox")).toBeNull();
    expect(within(partner).getByText("Packed")).toBeInTheDocument();
    expect(within(partner).getByText("Not packed")).toBeInTheDocument();
    expect(within(partner).queryByRole("button", { name: /need to buy|move|edit|delete/i })).toBeNull();
    expect(screen.getByRole("form", { name: "Add to Sam's list" })).toBeInTheDocument();
  });

  it("a ticked Shared row shows who packed it", () => {
    setup(true);
    expect(screen.getByRole("checkbox", { name: /Tent/ })).toBeChecked();
    expect(screen.getByText("packed by Cam")).toBeInTheDocument();
  });

  it("adding in Shared sends owner SHARED", async () => {
    const user = userEvent.setup();
    setup(true);
    const form = screen.getByRole("form", { name: "Add to Shared" });
    await user.type(within(form).getByRole("textbox"), "First aid kit{Enter}");
    expect(addChecklistItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ kind: "PACKING", owner: "SHARED", text: "First aid kit" }),
    );
  });

  it("adding to the partner's list sends their id", async () => {
    const user = userEvent.setup();
    setup(true);
    const form = screen.getByRole("form", { name: "Add to Sam's list" });
    await user.type(within(form).getByRole("textbox"), "Socks{Enter}");
    expect(addChecklistItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ kind: "PACKING", owner: "sam" }),
    );
  });

  it("Mine rows offer Move to Shared and Move to {name}, not Move to me", async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(screen.getByRole("button", { name: "Move Toothbrush" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Move to Shared", "Move to Sam"]);
    await user.click(screen.getByRole("menuitem", { name: "Move to Shared" }));
    expect(movePackingItem).toHaveBeenCalledWith("m1", "SHARED");
  });

  it("Shared rows offer Move to me", async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(screen.getByRole("button", { name: "Move Tent" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Move to me", "Move to Sam"]);
  });

  it("Private: no partner section and no Move to {name}", async () => {
    const user = userEvent.setup();
    const { container } = setup(false);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByText("Hiking boots")).toBeNull();
    expect(screen.queryByRole("form", { name: "Add to Sam's list" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Move Toothbrush" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Move to Shared"]);
  });
});
