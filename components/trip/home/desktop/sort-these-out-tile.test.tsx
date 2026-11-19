import type { Route } from "next";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { updateReminder } = vi.hoisted(() => ({ updateReminder: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/server/actions/reminders", () => ({ updateReminder }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";

import { SortTheseOutTile } from "./sort-these-out-tile";
import { ALL_SORTED_ROW, type SortRow } from "@/lib/sort-these-out";

const ROWS: SortRow[] = [
  { id: "reminder-r1", title: "Print insurance", subtitle: "Due Tue 8 Dec", href: "/trips/t1/plan" as Route, tone: "coral", icon: "bell", reminderId: "r1" },
  { id: "nudge-unbooked-transport", title: "Book transport", subtitle: "No times booked yet.", href: "/trips/t1/plan" as Route, tone: "sun", icon: "plane" },
];

describe("SortTheseOutTile", () => {
  it("has an h2, a labelled count badge and one link per row", () => {
    render(<SortTheseOutTile rows={ROWS} total={6} seeAllHref={"/trips/t1/summary" as Route} />);
    expect(screen.getByRole("heading", { level: 2, name: "Sort these out" })).toBeInTheDocument();
    expect(screen.getByLabelText("6 things to sort out")).toHaveTextContent("6");
    const row = screen.getByRole("link", { name: /Print insurance/ });
    expect(row).toHaveAttribute("href", "/trips/t1/plan");
    expect(within(row).getByText("Due Tue 8 Dec")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Book transport/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See all in Summary/ })).toHaveAttribute("href", "/trips/t1/summary");
  });

  it("colours each row's tile by its tone", () => {
    render(<SortTheseOutTile rows={ROWS} total={2} seeAllHref={"/s" as Route} />);
    const tiles = document.querySelectorAll("[data-sort-tile]");
    expect(tiles[0].className).toContain("bg-coral");
    expect(tiles[1].className).toContain("bg-sun");
  });

  it("shows the all-sorted row without a link or a bare 0 badge", () => {
    render(<SortTheseOutTile rows={[ALL_SORTED_ROW]} total={0} seeAllHref={"/s" as Route} />);
    expect(screen.getByText("You're all sorted")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /You're all sorted/ })).toBeNull();
    expect(screen.queryByLabelText(/things to sort out/)).toBeNull();
  });

  it("wraps a long nudge over two lines with a tooltip instead of a one-line ellipsis (spec 2026-10-12 W9)", () => {
    const long = "Dublin may be a backtrack: it's further from Rome than London is";
    render(<SortTheseOutTile rows={[{ ...ROWS[1], id: "nudge-route-dublin", title: long }]} total={1} seeAllHref={"/s" as Route} />);
    const title = screen.getByText(long);
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).not.toContain("truncate");
    expect(title).toHaveAttribute("title", long);
    expect(screen.getByText("No times booked yet.").className).toContain("line-clamp-2");
  });

  it("folds a row's notes under it, outside the row's link (F8)", async () => {
    const user = userEvent.setup();
    render(<SortTheseOutTile total={1} seeAllHref={"/trips/t/summary" as Route} rows={[
      { id: "reminder-r1", title: "Ring", subtitle: "Due Wed 2 Dec", href: "/trips/t/plan" as Route, tone: "coral", icon: "bell", notes: "Door code 4411" },
    ]} />);
    expect(screen.getByText("Door code 4411")).not.toBeVisible();
    expect(screen.getByRole("link", { name: /Ring/ })).not.toContainElement(screen.getByText("Notes"));
    await user.click(screen.getByText("Notes"));
    expect(screen.getByText("Door code 4411")).toBeVisible();
  });

  it("a Reminder row has Got it beside its link, which dismisses it and leaves the row at once", async () => {
    updateReminder.mockReturnValueOnce(new Promise(() => {}));
    render(<SortTheseOutTile rows={ROWS} total={2} seeAllHref={"/s" as Route} />);
    const got = screen.getAllByRole("button", { name: /^Got it/ });
    expect(got).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Print insurance/ }).contains(got[0])).toBe(false);
    await userEvent.setup().click(got[0]);
    expect(updateReminder).toHaveBeenCalledWith("r1", { dismissed: true });
    expect(screen.queryByRole("link", { name: /Print insurance/ })).toBeNull();
    expect(screen.getByLabelText("1 thing to sort out")).toBeInTheDocument();
  });

  it("Got it toasts Dismissed with an Undo, which brings the Reminder row back even after it has left", async () => {
    const { rerender } = render(<SortTheseOutTile rows={ROWS} total={2} seeAllHref={"/s" as Route} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Got it/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Dismissed", description: "Print insurance" })));
    rerender(<SortTheseOutTile rows={ROWS.slice(1)} total={1} seeAllHref={"/s" as Route} />);
    const undo = (vi.mocked(toast).mock.calls.at(-1)![0].action as React.ReactElement<{ onClick: () => void }>).props.onClick;
    undo();
    await waitFor(() => expect(updateReminder).toHaveBeenCalledWith("r1", { dismissed: false }));
    rerender(<SortTheseOutTile rows={ROWS} total={2} seeAllHref={"/s" as Route} />);
    expect(await screen.findByRole("link", { name: /Print insurance/ })).toBeInTheDocument();
  });
});
