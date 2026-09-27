import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DayIdeasRows } from "@/components/trip/day/day-ideas-rows";

const scheduleItem = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/items", () => ({ scheduleItem: (...a: unknown[]) => scheduleItem(...a) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

const rows = [
  { id: "b", title: "Christkindelsmärik", category: "SIGHTSEEING", hint: "≈300 m away", pool: "wishlist" as const },
  { id: "a", title: "Cathédrale", category: "SIGHTSEEING", hint: "from 12:30", pool: "todo" as const },
];

describe("DayIdeasRows", () => {
  it("renders the eyebrow, list items and accessible add buttons", () => {
    render(<DayIdeasRows tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" rows={rows} eyebrow="IDEAS FOR STRASBOURG" size="desktop" />);
    expect(screen.getByText("IDEAS FOR STRASBOURG")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add Christkindelsmärik to Sat 12 Dec" })).toHaveTextContent("+ Add");
    expect(screen.queryByRole("button", { name: /See all/ })).toBeNull();
  });
  it("shows the first three and expands the rest inline from \"See all\"", async () => {
    const four = [
      ...rows,
      { id: "c", title: "Petite France walk", category: "WALK", hint: "1.2 km away", pool: "wishlist" as const },
      { id: "d", title: "Kehl bridge", category: "SIGHTSEEING", hint: "same country", pool: "wishlist" as const },
    ];
    render(<DayIdeasRows tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" rows={four} eyebrow="x" size="desktop" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("Kehl bridge")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See all (1 more)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Kehl bridge")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /See all/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Kehl bridge to Sat 12 Dec" }));
    await waitFor(() => expect(scheduleItem).toHaveBeenCalledWith("d", { date: "2026-12-12" }));
  });
  it("phone: the add control is a 44px square", () => {
    render(<DayIdeasRows tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" rows={rows} eyebrow="IDEAS FOR STRASBOURG" size="phone" />);
    expect(screen.getByRole("button", { name: "Add Cathédrale to Sat 12 Dec" }).className).toContain("size-11");
  });
  it("rows are 16px-radius, tiles 12px (this repo's rounded-xl/2xl are 24/28px)", () => {
    render(<DayIdeasRows tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" rows={rows} eyebrow="x" size="desktop" />);
    for (const li of screen.getAllByRole("listitem")) {
      expect(li.className.split(/\s+/)).toContain("rounded-[16px]");
      const tile = li.firstElementChild as HTMLElement;
      expect(tile.getAttribute("aria-hidden")).toBe("true");
      expect(tile.className.split(/\s+/)).toContain("rounded-[12px]");
      expect(tile.className).toContain("size-10");
    }
  });
  it("+ Add schedules the item on the date with no time", async () => {
    render(<DayIdeasRows tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" rows={rows} eyebrow="x" size="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Add Christkindelsmärik to Sat 12 Dec" }));
    await waitFor(() => expect(scheduleItem).toHaveBeenCalledWith("b", { date: "2026-12-12" }));
  });
  it("renders nothing with no rows", () => {
    const { container } = render(<DayIdeasRows tripId="t1" date="d" dateLabel="d" rows={[]} eyebrow={null} size="desktop" />);
    expect(container.firstChild).toBeNull();
  });
});
