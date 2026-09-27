import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SortTheseOutTile } from "./sort-these-out-tile";
import { ALL_SORTED_ROW, type SortRow } from "@/lib/sort-these-out";

const ROWS: SortRow[] = [
  { id: "reminder-r1", title: "Print insurance", subtitle: "Due Tue 8 Dec", href: "/trips/t1/plan", tone: "coral", icon: "bell" },
  { id: "nudge-unbooked-transport", title: "Book transport", subtitle: "No times booked yet.", href: "/trips/t1/plan", tone: "sun", icon: "plane" },
];

describe("SortTheseOutTile", () => {
  it("has an h2, a labelled count badge and one link per row", () => {
    render(<SortTheseOutTile rows={ROWS} total={6} seeAllHref="/trips/t1/summary" />);
    expect(screen.getByRole("heading", { level: 2, name: "Sort these out" })).toBeInTheDocument();
    expect(screen.getByLabelText("6 things to sort out")).toHaveTextContent("6");
    const row = screen.getByRole("link", { name: /Print insurance/ });
    expect(row).toHaveAttribute("href", "/trips/t1/plan");
    expect(within(row).getByText("Due Tue 8 Dec")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Book transport/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See all in Summary/ })).toHaveAttribute("href", "/trips/t1/summary");
  });

  it("colours each row's tile by its tone", () => {
    render(<SortTheseOutTile rows={ROWS} total={2} seeAllHref="/s" />);
    const tiles = document.querySelectorAll("[data-sort-tile]");
    expect(tiles[0].className).toContain("bg-coral");
    expect(tiles[1].className).toContain("bg-sun");
  });

  it("shows the all-sorted row without a link or a bare 0 badge", () => {
    render(<SortTheseOutTile rows={[ALL_SORTED_ROW]} total={0} seeAllHref="/s" />);
    expect(screen.getByText("You're all sorted")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /You're all sorted/ })).toBeNull();
    expect(screen.queryByLabelText(/things to sort out/)).toBeNull();
  });
});
