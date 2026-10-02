import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdeaSheet } from "./idea-sheet";
import type { ItemCardItem } from "@/components/trip/item-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/trips/t1/plan" }));
vi.mock("@/server/actions/costs", () => ({ createCost: vi.fn(), updateCost: vi.fn(), deleteCost: vi.fn() }));
vi.mock("@/server/actions/notes", () => ({ createNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: vi.fn(), deleteAttachment: vi.fn() }));
vi.mock("@/server/actions/votes", () => ({ upsertVote: vi.fn(), deleteVote: vi.fn() }));

const IDEA: ItemCardItem = {
  id: "i1",
  title: "Musée d'Orsay",
  category: "SIGHTSEEING",
  date: null,
  stopId: "s1",
  address: "1 Rue de la Légion d'Honneur",
  link: "https://www.musee-orsay.fr",
  booking: "ORS-123",
  notes: "Book the 9am slot",
  hiddenFromShares: false,
};
const DAYS = ["2026-12-10", "2026-12-11"];

function renderSheet(over: Partial<React.ComponentProps<typeof IdeaSheet>> = {}) {
  const props = {
    tripId: "t1",
    idea: IDEA,
    days: DAYS,
    onClose: vi.fn(),
    onPickDay: vi.fn(),
    onEdit: vi.fn(),
    ...over,
  };
  render(<IdeaSheet {...props} />);
  return props;
}

describe("IdeaSheet (spec 2026-10-02 §D)", () => {
  it("opens as a dialog named after the idea, showing its notes, link and booking reference", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Musée d'Orsay" })).toBeInTheDocument();
    expect(screen.getByText("Book the 9am slot")).toBeInTheDocument();
    expect(screen.getByText("ORS-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Link" })).toHaveAttribute("href", "https://www.musee-orsay.fr/");
  });

  it("Pick a day lists the Stop's days; picking schedules and closes", async () => {
    const props = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Pick a day for Musée d'Orsay" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Fri 11 Dec" }));
    expect(props.onPickDay).toHaveBeenCalledWith(IDEA, "2026-12-11");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("Edit hands the idea to the form and closes", async () => {
    const props = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Edit Musée d'Orsay" }));
    expect(props.onEdit).toHaveBeenCalledWith(IDEA);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("a rough Stop (no days) has no Pick a day", () => {
    renderSheet({ days: [] });
    expect(screen.queryByRole("button", { name: /Pick a day/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Musée d'Orsay" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    renderSheet({ idea: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a long note and address in full, unclamped", () => {
    const note = "Book the 9am slot well ahead. ".repeat(8).trim();
    const address = "1 Rue de la Légion d'Honneur, 75007 Paris, Île-de-France, France";
    renderSheet({ idea: { ...IDEA, notes: note, address } });
    expect(screen.getByText(note)).not.toHaveClass("line-clamp-2");
    expect(screen.getByText(address)).not.toHaveClass("truncate");
  });
});
