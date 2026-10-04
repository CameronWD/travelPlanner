import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, KeyboardSensor, useDndContext, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn(async () => ({ success: true })) }));

import { DaySection, HOVER_OPEN_MS, claimDragHint, daySectionId, useHoverOpen } from "./day-section";
import { setDayTitle } from "@/server/actions/day-titles";
import { formatMoney } from "@/lib/money";
import { resolveItemDrop, type ItemDrop } from "./plan-dnd";

// testing-library's getByText only normalises the DOM node's own text before
// comparing, not the matcher string (@testing-library/dom's matches()) — so
// an exact-string query built from formatMoney() must be pre-normalised too,
// since Intl's small-icu currency fallback ("EUR<NBSP>22.00") uses a
// non-breaking space the node-side normaliser collapses to a plain space.
const money = (minor: number, currency: string) => formatMoney(minor, currency).replace(/\s+/g, " ");

const ITEMS = [
  { id: "a", title: "Café Kitsuné", category: "FOOD", date: "2026-12-11", startTime: "09:00", address: "Palais Royal" },
  { id: "b", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00", booking: "LVR-123", notes: "Richelieu entrance" },
  { id: "c", title: "Picnic", category: "FOOD", date: "2026-12-11", hiddenFromShares: true },
];
const IDEAS = [
  { id: "i1", title: "Orsay", category: "SIGHTSEEING" },
  { id: "i2", title: "Sainte-Chapelle", category: "SIGHTSEEING" },
];
const COSTS = new Map([["b", [{ id: "k", costMinor: 2200, paidMinor: null, currency: "EUR", rateToHome: 1.65, paidAt: null, dueDate: null, ownerType: "ITEM", ownerId: "b", label: null, category: null, settlement: "BEFORE" }]]]);

function dayProps(p = {}) {
  return {
    tripId: "t1", stopId: "par", dateISO: "2026-12-11", dayTitle: "Museums & Septime", items: ITEMS, costsById: COSTS, homeCurrency: "EUR",
    ideas: IDEAS, collapsed: false, onCollapsedChange: vi.fn(), showDragHint: true, onAdd: vi.fn(), onEditItem: vi.fn(), onScheduleIdea: vi.fn(),
    ...p,
  };
}
function renderDay(p = {}) {
  const props = dayProps(p);
  return { props, ...render(<DaySection {...props} />) };
}

describe("DaySection (PLAN.md §4.3; spec 2026-10-04 §A)", () => {
  it("a region named by its date toggle, open, with a sun head", () => {
    renderDay();
    const section = screen.getByRole("region", { name: "FRI 11 DEC" });
    expect(section).toHaveAttribute("id", daySectionId("par", "2026-12-11"));
    expect(section).toHaveAttribute("data-day", "2026-12-11");
    expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(`3 plans · 1 booked · ${money(2200, "EUR")} so far`)).toBeInTheDocument();
  });

  it("Open day links to the Day view; + Add presets the date", async () => {
    const { props } = renderDay();
    const openDay = screen.getByRole("link", { name: /Open day/ });
    expect(openDay).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
    expect(openDay.className).toContain("tap-target");
    const addButton = screen.getByRole("button", { name: "+ Add" });
    expect(addButton.className).toContain("tap-target");
    await userEvent.click(addButton);
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
  });

  it("rows: time or dash, title, sub line, Booked, cost, EyeOff; click edits", async () => {
    const { props } = renderDay();
    expect(screen.getByText("09:00").className).toContain("tabular-nums");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Palais Royal")).toBeInTheDocument();
    expect(screen.getByText("Richelieu entrance")).toBeInTheDocument();
    expect(screen.getByText(/Booked/)).toBeInTheDocument();
    expect(screen.getByText(money(2200, "EUR"))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hidden from shares" })).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit Louvre" });
    expect(editButton.className).toContain("tap-target");
    await userEvent.click(editButton);
    expect(props.onEditItem).toHaveBeenCalledWith(ITEMS[1]);
    const grip = screen.getByRole("button", { name: "Drag Louvre to another day" });
    expect(grip.className).toContain("tap-target");
  });

  it("edits the day title inline: Enter saves via setDayTitle", async () => {
    renderDay();
    const editTitle = screen.getByRole("button", { name: /Edit the day title/ });
    expect(editTitle.className).toContain("tap-target");
    await userEvent.click(editTitle);
    const input = screen.getByRole("textbox", { name: /Day title/ });
    await userEvent.clear(input);
    await userEvent.type(input, "Paris museums{Enter}");
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "par", date: "2026-12-11", title: "Paris museums" });
  });

  it("untitled: Add a title", () => {
    renderDay({ dayTitle: undefined });
    expect(screen.getByRole("button", { name: /Add a title/ })).toBeInTheDocument();
  });

  it("empty day: Nothing planned yet and + Add to Fri 11", async () => {
    const { props } = renderDay({ items: [] });
    expect(screen.getByText("Nothing planned yet")).toBeInTheDocument();
    const addToDay = screen.getByRole("button", { name: "+ Add to Fri 11" });
    expect(addToDay.className).toContain("tap-target");
    await userEvent.click(addToDay);
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
  });

  it("or pick an idea lists this Stop's ideas; picking one schedules it onto this day", async () => {
    const { props } = renderDay({ items: [] });
    const trigger = screen.getByRole("button", { name: "or pick an idea" });
    expect(trigger.className).toContain("tap-target");
    await userEvent.click(trigger);
    expect(await screen.findByText("Add to Fri 11")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Orsay", "Sainte-Chapelle"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Sainte-Chapelle" }));
    expect(props.onScheduleIdea).toHaveBeenCalledWith(IDEAS[1], "2026-12-11");
  });

  it("no ideas: no or pick an idea", () => {
    renderDay({ items: [], ideas: [] });
    expect(screen.queryByRole("button", { name: "or pick an idea" })).toBeNull();
  });

  it("footer: + Add to the day and the reworded drag hint only when asked", () => {
    const { rerender, props } = renderDay();
    expect(screen.getByText("Drag a plan onto another day to move it")).toBeInTheDocument();
    rerender(<DaySection {...props} showDragHint={false} />);
    expect(screen.queryByText("Drag a plan onto another day to move it")).toBeNull();
  });

  it("folded: the header line only — date, Day title, summary; no rows, Open day or + Add", () => {
    renderDay({ collapsed: true });
    expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Edit the day title/ })).toBeInTheDocument();
    expect(screen.getByText(/^3 plans/)).toBeInTheDocument();
    expect(screen.queryByText("Louvre")).toBeNull();
    expect(screen.queryByRole("link", { name: /Open day/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
  });

  it("the date toggle and the bare header fold it; the header's own controls don't", async () => {
    const { props } = renderDay();
    await userEvent.click(screen.getByRole("button", { name: "FRI 11 DEC" }));
    expect(props.onCollapsedChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText(/^3 plans/));
    expect(props.onCollapsedChange).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
    expect(props.onCollapsedChange).toHaveBeenCalledTimes(2);
  });

  it("a folded day's toggle opens it", async () => {
    const { props } = renderDay({ collapsed: true });
    await userEvent.click(screen.getByRole("button", { name: "FRI 11 DEC" }));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("the day a plan landed on flashes", () => {
    renderDay({ flash: true });
    const section = screen.getByRole("region", { name: "FRI 11 DEC" });
    expect(section).toHaveAttribute("data-flash");
    expect(section.className).toContain("data-[flash]:tp-day-flash");
  });

  it("folded or open, the section is the day's drop target slot:<stopId>:<date>", async () => {
    function Probe() {
      const { droppableContainers } = useDndContext();
      return <output data-testid="probe">{JSON.stringify(droppableContainers.get("slot:par:2026-12-11")?.data.current ?? null)}</output>;
    }
    render(
      <DndContext>
        <DaySection {...dayProps({ collapsed: true })} />
        <Probe />
      </DndContext>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent('{"type":"slot","stopId":"par","date":"2026-12-11"}'));
  });

  it("claimDragHint is true once per session", () => {
    sessionStorage.clear();
    expect(claimDragHint()).toBe(true);
    expect(claimDragHint()).toBe(false);
  });

  it("uses no banned soft classes", () => {
    const { container } = renderDay();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });

  it("ADR 0049 rule 3: a plan another Stop owns carries a muted · {owning Stop}; unowned and own plans don't", () => {
    const items = [ITEMS[0], { ...ITEMS[1], stopId: "rom" }, { ...ITEMS[2], stopId: "par" }];
    renderDay({ items, stopNames: new Map([["par", "Paris"], ["rom", "Rome"]]) });
    const marker = screen.getByText("· Rome");
    expect(marker.className).toContain("text-muted-foreground");
    expect(screen.getByRole("button", { name: "Edit Louvre (Rome)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Café Kitsuné" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Picnic" })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-owner]")).toHaveLength(1);
  });
});

describe("DaySection on a Changeover day (one plan under two open Stops)", () => {
  // Folding a day animates its height to 0; motion's height:"auto" handling
  // calls window.scrollTo, which jsdom only logs as not implemented.
  let scrollTo: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => {
    scrollTo.mockRestore();
  });

  const TRAIN = { id: "x", title: "Train to Lyon", category: "TRANSPORT", date: "2026-12-14", startTime: "09:00" };

  /**
   * Paris (13th, 14th) and Lyon (14th) open on one board, the plan on the
   * 14th under both. A real keyboard drag — Space lifts, Space drops — over
   * a collision detection pinned to `target`, so jsdom's zero rects don't
   * matter; the drop runs the production resolveItemDrop like handleDragEnd.
   */
  function Board({ parisFolded = false, lyonFolded = false, target, onDrop }: { parisFolded?: boolean; lyonFolded?: boolean; target: string; onDrop(drop: ItemDrop | null): void }) {
    const sensors = useSensors(useSensor(KeyboardSensor));
    const collisionDetection: CollisionDetection = () => [{ id: target }];
    return (
      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={(e) => onDrop(resolveItemDrop(e.active.data.current, e.over?.data.current))}>
        <div data-testid="paris">
          <DaySection {...dayProps({ stopId: "par", dateISO: "2026-12-13", items: [] })} />
          <DaySection {...dayProps({ stopId: "par", dateISO: "2026-12-14", items: [TRAIN], collapsed: parisFolded })} />
        </div>
        <div data-testid="lyon">
          <DaySection {...dayProps({ stopId: "lyo", dateISO: "2026-12-14", items: [TRAIN], collapsed: lyonFolded })} />
          <DaySection {...dayProps({ stopId: "lyo", dateISO: "2026-12-15", items: [] })} />
        </div>
      </DndContext>
    );
  }

  async function dragFrom(testId: string) {
    const grip = within(screen.getByTestId(testId)).getByRole("button", { name: "Drag Train to Lyon to another day" });
    grip.focus();
    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("[Space]");
  }

  it("with the other card's copy folded, dragging this card's copy moves it to another day of its own Stop", async () => {
    const onDrop = vi.fn();
    const { rerender } = render(<Board target="slot:par:2026-12-13" onDrop={onDrop} />);
    rerender(<Board lyonFolded target="slot:par:2026-12-13" onDrop={onDrop} />);
    await waitFor(() => expect(within(screen.getByTestId("lyon")).queryByText("Train to Lyon")).toBeNull());
    await dragFrom("paris");
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "x", stopId: "par", from: expect.objectContaining({ date: "2026-12-14" }), to: "2026-12-13" }),
    );
  });

  it("with both copies open, each card drags its own copy", async () => {
    const onDrop = vi.fn();
    const { rerender } = render(<Board target="slot:par:2026-12-13" onDrop={onDrop} />);
    await dragFrom("paris");
    expect(onDrop).toHaveBeenLastCalledWith(expect.objectContaining({ itemId: "x", stopId: "par", to: "2026-12-13" }));
    rerender(<Board parisFolded target="slot:lyo:2026-12-15" onDrop={onDrop} />);
    await waitFor(() => expect(within(screen.getByTestId("paris")).queryByText("Train to Lyon")).toBeNull());
    await dragFrom("lyon");
    expect(onDrop).toHaveBeenLastCalledWith(expect.objectContaining({ itemId: "x", stopId: "lyo", to: "2026-12-15" }));
  });
});

describe("DaySection hover-open (a plan held over a folded day of its own Stop)", () => {
  const PLAN = { id: "p", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" };

  /** Lifts Paris's plan with the keyboard and holds it over `target` (collisions pinned there; jsdom has no layout). */
  function hold(target: { stopId: string; dateISO: string }) {
    const onCollapsedChange = vi.fn();
    function Board() {
      const sensors = useSensors(useSensor(KeyboardSensor));
      const collisionDetection: CollisionDetection = () => [{ id: `slot:${target.stopId}:${target.dateISO}` }];
      return (
        <DndContext sensors={sensors} collisionDetection={collisionDetection}>
          <DaySection {...dayProps({ stopId: "par", dateISO: "2026-12-11", items: [PLAN] })} />
          <DaySection {...dayProps({ ...target, items: [], collapsed: true, onCollapsedChange })} />
        </DndContext>
      );
    }
    render(<Board />);
    act(() => {
      fireEvent.keyDown(screen.getByRole("button", { name: "Drag Louvre to another day" }), { code: "Space" });
    });
    return onCollapsedChange;
  }

  it("another Stop's folded day stays folded under a plan from this Stop", () => {
    vi.useFakeTimers();
    try {
      const onCollapsedChange = hold({ stopId: "lyo", dateISO: "2026-12-14" });
      act(() => {
        vi.advanceTimersByTime(HOVER_OPEN_MS * 2);
      });
      expect(onCollapsedChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the plan's own Stop's folded day opens once it has hovered for HOVER_OPEN_MS", () => {
    vi.useFakeTimers();
    try {
      const onCollapsedChange = hold({ stopId: "par", dateISO: "2026-12-13" });
      act(() => {
        vi.advanceTimersByTime(HOVER_OPEN_MS - 1);
      });
      expect(onCollapsedChange).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onCollapsedChange).toHaveBeenCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useHoverOpen (a plan held over a folded day opens it)", () => {
  it("opens once the plan has hovered for HOVER_OPEN_MS, and only once", () => {
    vi.useFakeTimers();
    try {
      const onOpen = vi.fn();
      renderHook(({ armed }) => useHoverOpen(armed, onOpen), { initialProps: { armed: true } });
      vi.advanceTimersByTime(HOVER_OPEN_MS - 1);
      expect(onOpen).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onOpen).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(HOVER_OPEN_MS * 3);
      expect(onOpen).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a plan that moves on before the delay opens nothing", () => {
    vi.useFakeTimers();
    try {
      const onOpen = vi.fn();
      const { rerender } = renderHook(({ armed }) => useHoverOpen(armed, onOpen), { initialProps: { armed: true } });
      vi.advanceTimersByTime(HOVER_OPEN_MS / 2);
      rerender({ armed: false });
      vi.advanceTimersByTime(HOVER_OPEN_MS * 2);
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
