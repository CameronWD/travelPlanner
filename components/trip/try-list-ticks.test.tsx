import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/items", () => ({ tickTryEntry: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { tickTryEntry } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { TryListTicks } from "./try-list-ticks";

const LIST = [
  { id: "e1", text: "Lebkuchen", tried: false },
  { id: "e2", text: "Drei im Weggla", tried: false },
];

describe("TryListTicks (CONTEXT.md Try list, ticked on the day)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("labels each checkbox with its entry and names the list after its Item", () => {
    render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    expect(screen.getByRole("list", { name: "Try list for Christkindlesmarkt" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Lebkuchen" })).not.toBeChecked();
    expect(screen.getByText("Try list · 0/2 tried")).toBeInTheDocument();
  });

  it("a tick calls tickTryEntry with the entry and the new state", async () => {
    const user = userEvent.setup();
    render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    await user.click(screen.getByRole("checkbox", { name: "Drei im Weggla" }));
    expect(tickTryEntry).toHaveBeenCalledWith("i1", "e2", true);
  });

  it("ticks at once, and rolls back with a toast when the server refuses", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(tickTryEntry).mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    const box = screen.getByRole("checkbox", { name: "Lebkuchen" });
    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText("Try list · 1/2 tried")).toBeInTheDocument();
    await act(async () => resolve({ success: false, errors: { tryList: ["That one is no longer on the list."] } }));
    expect(box).not.toBeChecked();
    expect(screen.getByText("Try list · 0/2 tried")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "That one is no longer on the list." });
  });

  it("two quick ticks on different entries: the refused one rolls back, the ok one stays ticked", async () => {
    const resolvers: Record<string, (v: unknown) => void> = {};
    vi.mocked(tickTryEntry).mockImplementation(((_item: string, entryId: string) => new Promise((r) => (resolvers[entryId] = r))) as never);
    const user = userEvent.setup();
    const { rerender } = render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    const first = screen.getByRole("checkbox", { name: "Lebkuchen" });
    const second = screen.getByRole("checkbox", { name: "Drei im Weggla" });
    await user.click(first);
    await user.click(second);
    expect(first).toBeChecked();
    expect(second).toBeChecked();
    await act(async () => resolvers.e1({ success: false, errors: { tryList: ["That one is no longer on the list."] } }));
    // The ok tick revalidates the page (server/actions/items.ts), so the list arrives with it ticked.
    await act(async () => {
      resolvers.e2({ success: true });
      rerender(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={[LIST[0], { ...LIST[1], tried: true }]} />);
    });
    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
    expect(screen.getByText("Try list · 1/2 tried")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledTimes(1);
    vi.mocked(tickTryEntry).mockResolvedValue({ success: true });
  });

  it("rolls back with a toast when the action rejects", async () => {
    vi.mocked(tickTryEntry).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    const box = screen.getByRole("checkbox", { name: "Lebkuchen" });
    await user.click(box);
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(box).not.toBeChecked();
  });
});
