import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StopSheet } from "./stop-sheet";
import { daySlots } from "@/lib/plan/day-density";

const PARIS = { id: "par", name: "Paris", country: "France", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-12", nights: null, pinned: false, chapterId: null, sortOrder: 1, notes: null, lat: null, lng: null };
const ITEMS = [{ id: "a", title: "Check in", category: "OTHER", date: "2026-12-10", startTime: "15:00" }, { id: "b", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" }];
const IDEAS = [{ id: "i1", title: "Musée d'Orsay", category: "SIGHTSEEING" }];
const COVERED = { kind: "covered" as const, name: "Grands Boulevards", totalNights: 2, coveredNights: 2, extra: 0, checkInTime: null };
function renderSheet(p = {}) {
  const props = { open: true, onClose: vi.fn(), stop: PARIS, number: 2, slots: daySlots(PARIS, ITEMS), dayItems: ITEMS, ideas: IDEAS, stay: COVERED,
    accommodationRows: <div>acc row</div>, onAddStay: vi.fn(), onEditItem: vi.fn(), onAddPlan: vi.fn(), onPickDay: vi.fn(), onEditDates: vi.fn(), onActions: vi.fn(), ...p };
  return { props, ...render(<StopSheet {...props} />) };
}

describe("StopSheet (PLAN.md §7.2)", () => {
  it("a full-screen dialog titled by the stop, with back and actions buttons", async () => {
    const { props } = renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Paris" });
    expect(dialog.className).toMatch(/inset-0/);
    expect(screen.getByText("Thu 10 – Sat 12 Dec · 2 nights", { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to the plan" }));
    expect(props.onClose).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Paris" }));
    expect(props.onActions).toHaveBeenCalled();
  });

  it("Days lists every day with its tag, all items, a + and the free-day copy", async () => {
    const { props } = renderSheet();
    const thu = screen.getByTestId("sheet-day-2026-12-10");
    expect(within(thu).getByText("Arrive")).toBeInTheDocument();
    expect(within(thu).getByText("Check in")).toBeInTheDocument();
    expect(within(screen.getByTestId("sheet-day-2026-12-12")).getByText("Free day. Tap + or pick an idea.")).toBeInTheDocument();
    await userEvent.click(within(thu).getByRole("button", { name: "Add a plan to Thu 10" }));
    expect(props.onAddPlan).toHaveBeenCalledWith("2026-12-10");
    await userEvent.click(screen.getByRole("button", { name: /Louvre/ }));
    expect(props.onEditItem).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("small controls get a 44px hit area", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Add a plan to Thu 10" }).className).toContain("tap-target");
  });

  it("tabs: Days · Stay ✓ · Ideas 1; Stay shows the rows and + Add a stay; Ideas has Pick day", async () => {
    const { props } = renderSheet();
    await userEvent.click(screen.getByRole("radio", { name: /Stay/ }));
    expect(screen.getByText("acc row")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(props.onAddStay).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: "Ideas 1" }));
    const pick = screen.getByRole("button", { name: "Pick day for Musée d'Orsay" });
    expect(pick.className).toContain("tap-target");
    await userEvent.click(pick);
    expect(props.onPickDay).toHaveBeenCalledWith(IDEAS[0]);
  });

  it("Stay ! in coral when there is no bed", () => {
    renderSheet({ stay: { ...COVERED, kind: "none", name: null, coveredNights: 0 } });
    expect(screen.getByRole("radio", { name: /Stay/ })).toHaveTextContent("Stay !");
  });

  it("the sticky footer: Edit dates and + Add a plan (presets the top day)", async () => {
    const { props } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Edit dates" }));
    expect(props.onEditDates).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a plan" }));
    expect(props.onAddPlan).toHaveBeenCalledWith("2026-12-10");
  });

  it("a rough stop: Rough meta, Days asks for dates, no Pick day pills", async () => {
    const rough = { ...PARIS, arriveDate: null, departDate: null, nights: 3 };
    const { props } = renderSheet({ stop: rough, slots: [], stay: null });
    expect(screen.getByText("Rough · ~3 nights")).toBeInTheDocument();
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Give it dates" }));
    expect(props.onEditDates).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: "Ideas 1" }));
    expect(screen.getByText("Musée d'Orsay")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pick day for/ })).toBeNull();
  });

  it("uses no banned soft classes", () => {
    renderSheet();
    expect(document.body.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
