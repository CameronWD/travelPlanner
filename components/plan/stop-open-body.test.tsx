import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import { setDayCollapsed } from "@/lib/plan/day-collapse";

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
import { resetDayCollapse } from "@/lib/plan/day-collapse";

const PARIS = { id: "par", name: "Paris", country: "France", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-14", nights: null, pinned: false, chapterId: null, sortOrder: 1, notes: null, lat: null, lng: null };
const MUNICH = { ...PARIS, id: "mun", name: "Munich", arriveDate: null, departDate: null, nights: 5, timezone: null };
const ITEMS = [{ id: "a", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" }];
const baseProps = (over = {}) => ({
  tripId: "t1", stop: PARIS, slots: daySlots(PARIS, ITEMS), dayItems: ITEMS, ideas: [], stay: null,
  counts: { files: 2, notes: 3, reminders: 1 }, showDragHint: false,
  onOpenStay: vi.fn(), onAddStay: vi.fn(), onAddIdea: vi.fn(), onOpenIdea: vi.fn(), onAddPlan: vi.fn(),
  onEditItem: vi.fn(), onGiveDates: vi.fn(), onOpenExtras: vi.fn(), onScheduleIdea: vi.fn(), ...over,
});
const wrap = (ui: React.ReactNode, today = "2026-12-30") => render(<PlanBody initialOpen={["par"]} today={today}>{ui}</PlanBody>);
const day = (name: string) => screen.getByRole("region", { name });

/**
 * `window.scrollTo` calls shaped like ours (`scrollToId`'s `{top, behavior}`).
 * `motion`'s own height:"auto" resolution calls `window.scrollTo(x, y)` with
 * positional args on every fold open/close to preserve scroll position (real,
 * deterministic library behaviour since Task 20's fold animation, not test
 * noise) — filtering it out lets these tests check our call without coupling
 * to an unrelated animation-library implementation detail.
 */
function ownScrollCalls(fn: ReturnType<typeof vi.fn>): unknown[] {
  return fn.mock.calls.filter(([arg]) => typeof arg === "object" && arg !== null && "top" in (arg as object));
}

beforeEach(() => {
  window.localStorage.clear();
  resetDayCollapse();
  window.history.replaceState(null, "", "/trips/t1/plan");
});
afterEach(() => {
  setMatchMedia((q) => q === "(min-width: 640px)");
});

describe("StopOpenBody (PLAN.md §4, §5; spec D2; spec 2026-10-04 §A)", () => {
  it("dated: every day of the stay is a full day section, in date order, every one open", () => {
    wrap(<StopOpenBody {...baseProps()} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("data-day"))).toEqual([
      "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14",
    ]);
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(5);
    expect(day("FRI 11 DEC")).toHaveTextContent("Louvre");
    expect(within(day("SAT 12 DEC")).getByText("Nothing planned yet")).toBeInTheDocument();
  });

  it("a day's header folds it to its header line, remembered on this device per Trip", async () => {
    const { unmount } = wrap(<StopOpenBody {...baseProps()} />);
    await userEvent.click(screen.getByRole("button", { name: "FRI 11 DEC" }));
    expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(day("FRI 11 DEC")).not.toHaveTextContent("Louvre"));
    expect(day("FRI 11 DEC")).toHaveTextContent("1 plan");
    expect(within(day("FRI 11 DEC")).queryByRole("link", { name: /Open day/ })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("teepee.plan.collapsedDays.t1")!)).toEqual(["par:2026-12-11"]);
    unmount();
    wrap(<StopOpenBody {...baseProps()} />);
    expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "SAT 12 DEC" })).toHaveAttribute("aria-expanded", "true");
  });

  it("storage that refuses writes (private mode): the day still folds for this visit", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      wrap(<StopOpenBody {...baseProps({ tripId: "t-private" })} />);
      await userEvent.click(screen.getByRole("button", { name: "FRI 11 DEC" }));
      expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "false");
    } finally {
      setItem.mockRestore();
    }
  });

  it("the drag hint shows once, under the first day with plans", () => {
    const items = [...ITEMS, { id: "b", title: "Orsay", category: "SIGHTSEEING", date: "2026-12-13" }];
    wrap(<StopOpenBody {...baseProps({ dayItems: items, slots: daySlots(PARIS, items), showDragHint: true })} />);
    expect(screen.getAllByText("Drag a plan onto another day to move it")).toHaveLength(1);
    expect(within(day("FRI 11 DEC")).getByText("Drag a plan onto another day to move it")).toBeInTheDocument();
  });

  it("the day a plan landed on flashes", () => {
    wrap(<StopOpenBody {...baseProps({ flashDate: "2026-12-12" })} />);
    expect(day("SAT 12 DEC")).toHaveAttribute("data-flash");
    expect(day("FRI 11 DEC")).not.toHaveAttribute("data-flash");
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

  it("rough: Needs dates first, ideas, Give it dates; no day sections", async () => {
    const props = baseProps({ stop: MUNICH, slots: [], dayItems: [] });
    wrap(<StopOpenBody {...props} />);
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Give it dates" }));
    expect(props.onGiveDates).toHaveBeenCalled();
  });

  it("uses no banned soft classes", () => {
    const { container } = wrap(<StopOpenBody {...baseProps()} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });

  it("an empty day's or pick an idea schedules the Stop's idea onto that day", async () => {
    const props = baseProps({ ideas: [{ id: "i1", title: "Orsay", category: "SIGHTSEEING" }] });
    wrap(<StopOpenBody {...props} />);
    await userEvent.click(within(day("SAT 12 DEC")).getByRole("button", { name: "or pick an idea" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Orsay" }));
    expect(props.onScheduleIdea).toHaveBeenCalledWith(props.ideas[0], "2026-12-12");
  });

  it("a hash day= opens that day if it was folded, and scrolls to it (desktop)", async () => {
    setMatchMedia((q) => q === "(min-width: 1024px)" || q === "(min-width: 640px)");
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    setDayCollapsed("t1", "par", "2026-12-13", true);
    window.history.replaceState(null, "", "/trips/t1/plan#open=par&day=2026-12-13");
    wrap(<StopOpenBody {...baseProps()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "SUN 13 DEC" })).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(ownScrollCalls(scrollTo)).toHaveLength(1));
  });

  it("a hash day= on a Changeover day opens and scrolls the first open Stop's section only", async () => {
    setMatchMedia((q) => q === "(min-width: 1024px)" || q === "(min-width: 640px)");
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const LYON = { ...PARIS, id: "lyo", name: "Lyon", arriveDate: "2026-12-14", departDate: "2026-12-16", sortOrder: 2 };
    setDayCollapsed("t1", "par", "2026-12-14", true);
    setDayCollapsed("t1", "lyo", "2026-12-14", true);
    window.history.replaceState(null, "", "/trips/t1/plan#open=par,lyo&day=2026-12-14");
    render(
      <PlanBody initialOpen={[]} today="2026-12-30">
        <div data-testid="paris"><StopOpenBody {...baseProps()} /></div>
        <div data-testid="lyon"><StopOpenBody {...baseProps({ stop: LYON, slots: daySlots(LYON, []), dayItems: [] })} /></div>
      </PlanBody>,
    );
    const toggle = (testId: string) => within(screen.getByTestId(testId)).getByRole("button", { name: "MON 14 DEC" });
    await waitFor(() => expect(toggle("paris")).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(ownScrollCalls(scrollTo)).toHaveLength(1));
    expect(toggle("lyon")).toHaveAttribute("aria-expanded", "false");
  });

  it("below lg a hash day= opens the day but scrolls nothing (the desktop list is hidden)", async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    setDayCollapsed("t1", "par", "2026-12-13", true);
    window.history.replaceState(null, "", "/trips/t1/plan#open=par&day=2026-12-13");
    wrap(<StopOpenBody {...baseProps()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "SUN 13 DEC" })).toHaveAttribute("aria-expanded", "true"));
    expect(ownScrollCalls(scrollTo)).toHaveLength(0);
  });
});
