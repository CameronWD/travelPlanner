import { describe, it, expect, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { daySlots } from "@/lib/plan/day-density";
import { DayStrip } from "./day-strip";

const STOP = { arriveDate: "2026-12-10", departDate: "2026-12-14" };
const SLOTS = daySlots(
  STOP,
  [{ id: "a", date: "2026-12-11", category: "FOOD" }, { id: "b", date: "2026-12-11", category: "SIGHTSEEING" }],
  { "2026-12-12": { title: "Versailles day" } },
  { prevDepartDate: "2026-12-10" },
);

function renderStrip(p: Partial<React.ComponentProps<typeof DayStrip>> = {}) {
  const props = { stopId: "par", slots: SLOTS, selected: "2026-12-11", onSelect: vi.fn(), onOpen: vi.fn(), panelId: "panel-par", ...p };
  return { props, ...render(<DayStrip {...props} />) };
}

describe("DayStrip (PLAN.md §4.2)", () => {
  it("a tablist with one tab per day, the selected one coral", () => {
    renderStrip();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    const fri = screen.getByRole("tab", { name: /FRI 11/ });
    expect(fri).toHaveAttribute("aria-selected", "true");
    expect(fri).toHaveAttribute("aria-controls", "panel-par");
    expect(fri).toHaveAttribute("tabindex", "0");
    expect(fri.className).toContain("bg-coral");
    expect(screen.getByRole("tab", { name: /SAT 12/ })).toHaveAttribute("tabindex", "-1");
  });

  it("dots per plan, a sun band for a titled day, Free on an empty day", () => {
    renderStrip();
    expect(screen.getByRole("tab", { name: /FRI 11/ }).querySelectorAll("[data-dot]")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /SAT 12/ }).querySelector("[data-band]")!.className).toContain("bg-sun");
    const sun = screen.getByRole("tab", { name: /SUN 13/ });
    expect(sun.className).toMatch(/border-dashed/);
    expect(within(sun).getByText("Free")).toBeInTheDocument();
  });

  it("marks the arriving changeover day", () => {
    renderStrip();
    expect(screen.getByRole("tab", { name: /THU 10/ }).querySelector("[data-changeover='arrive']")).not.toBeNull();
  });

  it("click selects; arrows, Home and End move; Enter opens the day", async () => {
    const { props } = renderStrip();
    await userEvent.click(screen.getByRole("tab", { name: /SAT 12/ }));
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-12");
    screen.getByRole("tab", { name: /FRI 11/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-12");
    await userEvent.keyboard("{ArrowLeft}");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-10");
    await userEvent.keyboard("{End}");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-14");
    await userEvent.keyboard("{Home}");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-10");
    await userEvent.keyboard("{Enter}");
    expect(props.onOpen).toHaveBeenCalledWith("2026-12-11");
  });

  it("more than 11 days: a scroller with arrow buttons", () => {
    const long = daySlots({ arriveDate: "2026-12-01", departDate: "2026-12-14" }, []);
    renderStrip({ slots: long, selected: "2026-12-01" });
    expect(screen.getByRole("tablist").className).toMatch(/overflow-x-auto/);
    expect(screen.getByRole("button", { name: "Later days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Earlier days" })).toBeInTheDocument();
  });

  it("recomputes arrow state when the strip resizes without a scroll (ResizeObserver)", async () => {
    let onResize: ResizeObserverCallback = () => {};
    class FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        onResize = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const long = daySlots({ arriveDate: "2026-12-01", departDate: "2026-12-14" }, []);
    renderStrip({ slots: long, selected: "2026-12-01" });
    await act(async () => {}); // flush the mount-time queueMicrotask measurement (still 0-width)
    const list = screen.getByRole("tablist");
    Object.defineProperty(list, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(list, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(list, "scrollLeft", { value: 0, configurable: true });
    const later = screen.getByRole("button", { name: "Later days" });
    expect(later.className).toMatch(/opacity-0/);
    act(() => onResize([] as unknown as ResizeObserverEntry[], {} as ResizeObserver));
    expect(later.className).not.toMatch(/opacity-0/);
    vi.unstubAllGlobals();
  });

  it("uses no banned soft classes", () => {
    const { container } = renderStrip();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
