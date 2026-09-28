import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn().mockResolvedValue({ success: true }) }));
import { setDayTitle } from "@/server/actions/day-titles";
import { DayTitleInline } from "@/components/trip/day/day-title-inline";

describe("DayTitleInline — the Day view is the primary place to add and edit a Day title (spec 2026-09-28 D4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers 'Add a title' when the day has none, and saves what is typed on Enter", async () => {
    const user = userEvent.setup();
    render(<DayTitleInline stopId="s1" date="2026-12-05" title={null} />);
    const addButton = screen.getByRole("button", { name: "Add a title" });
    expect(addButton.className).toContain("tap-target");
    await user.click(addButton);
    const input = screen.getByRole("textbox", { name: "Day title for Sat 5 Dec" });
    expect(input).toHaveAttribute("maxlength", "80");
    await user.type(input, "Christmas markets{Enter}");
    expect(setDayTitle).toHaveBeenCalledTimes(1);
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "s1", date: "2026-12-05", title: "Christmas markets" });
  });

  it("shows the title as a button that opens the editor seeded with it; Escape cancels", async () => {
    const user = userEvent.setup();
    render(<DayTitleInline stopId="s1" date="2026-12-05" title="Christmas markets" />);
    expect(screen.getByText("Christmas markets")).toBeInTheDocument();
    const titleButton = screen.getByRole("button", { name: "Edit the day title, Christmas markets" });
    expect(titleButton.className).toContain("tap-target");
    await user.click(titleButton);
    const input = screen.getByRole("textbox", { name: "Day title for Sat 5 Dec" });
    expect(input).toHaveValue("Christmas markets");
    await user.type(input, " again{Escape}");
    expect(setDayTitle).not.toHaveBeenCalled();
    expect(screen.getByText("Christmas markets")).toBeInTheDocument();
  });

  it("no affordance without a Stop (a gap day): renders an empty line", () => {
    render(<DayTitleInline stopId={null} date="2026-12-05" title={null} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never says 'Name this day'", () => {
    render(<DayTitleInline stopId="s1" date="2026-12-05" title={null} />);
    expect(document.body.textContent).not.toMatch(/name this day/i);
  });
});
