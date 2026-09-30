import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn(async () => ({ success: true })) }));

import { PlanBody } from "./plan-body";
import { StopOpenBody } from "./stop-open-body";
import { daySlots } from "@/lib/plan/day-density";

const PARIS = { id: "par", name: "Paris", country: "France", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-14", nights: null, pinned: false, chapterId: null, sortOrder: 1, notes: null, lat: null, lng: null };
const MUNICH = { ...PARIS, id: "mun", name: "Munich", arriveDate: null, departDate: null, nights: 5, timezone: null };
const ITEMS = [{ id: "a", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" }];
const baseProps = (over = {}) => ({
  tripId: "t1", stop: PARIS, slots: daySlots(PARIS, ITEMS), dayItems: ITEMS, ideas: [], stay: null,
  counts: { files: 2, notes: 3, reminders: 1 }, showDragHint: false,
  onOpenStay: vi.fn(), onAddStay: vi.fn(), onAddIdea: vi.fn(), onScheduleIdea: vi.fn(), onAddPlan: vi.fn(),
  onEditItem: vi.fn(), onGiveDates: vi.fn(), onOpenExtras: vi.fn(), ...over,
});
const wrap = (ui: React.ReactNode, today = "2026-12-30") => render(<PlanBody initialOpen={["par"]} today={today}>{ui}</PlanBody>);

describe("StopOpenBody (PLAN.md §4, §5; spec D2)", () => {
  it("dated: strip row, day strip, and the default day selected (first with plans)", () => {
    wrap(<StopOpenBody {...baseProps()} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /FRI 11/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Louvre");
  });

  it("selecting a day switches the panel", async () => {
    wrap(<StopOpenBody {...baseProps()} />);
    await userEvent.click(screen.getByRole("tab", { name: /SAT 12/ }));
    // The old day cross-fades out first (MOTION.md P3, AnimatePresence mode="wait").
    await waitFor(() => expect(screen.getByRole("tabpanel")).toHaveTextContent("Nothing planned yet"));
  });

  it("today wins when it falls in the stay", () => {
    wrap(<StopOpenBody {...baseProps()} />, "2026-12-12");
    expect(screen.getByRole("tab", { name: /SAT 12/ })).toHaveAttribute("aria-selected", "true");
  });

  it("the quiet link row: 2 files · 3 notes · 1 reminder, each opening its dialog", async () => {
    const props = baseProps();
    wrap(<StopOpenBody {...props} />);
    const row = screen.getByTestId("stop-extras-links");
    expect(row.className).toContain("text-[13px]");
    await userEvent.click(within(row).getByRole("button", { name: "3 notes" }));
    expect(props.onOpenExtras).toHaveBeenCalledWith("notes");
    await userEvent.click(within(row).getByRole("button", { name: "2 files" }));
    expect(props.onOpenExtras).toHaveBeenCalledWith("files");
    expect(within(row).getByRole("button", { name: "1 reminder" })).toBeInTheDocument();
  });

  it("no extras: no link row", () => {
    wrap(<StopOpenBody {...baseProps({ counts: { files: 0, notes: 0, reminders: 0 } })} />);
    expect(screen.queryByTestId("stop-extras-links")).toBeNull();
  });

  it("rough: Needs dates first, ideas, Give it dates; no strip", async () => {
    const props = baseProps({ stop: MUNICH, slots: [], dayItems: [] });
    wrap(<StopOpenBody {...props} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Give it dates" }));
    expect(props.onGiveDates).toHaveBeenCalled();
  });

  it("uses no banned soft classes", () => {
    const { container } = wrap(<StopOpenBody {...baseProps()} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
