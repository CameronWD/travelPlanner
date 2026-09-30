import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdeasBox } from "./ideas-box";

const idea = (id: string, title: string, extra = {}) => ({ id, title, category: "SIGHTSEEING", startTime: null, endTime: null, ...extra });
const IDEAS = [idea("i1", "Musée d'Orsay"), idea("i2", "Sainte-Chapelle", { hiddenFromShares: true }), idea("i3", "Le Bon Marché")];
const DAYS = ["2026-12-10", "2026-12-11"];

afterEach(() => { vi.unstubAllGlobals(); });

describe("IdeasBox (PLAN.md §4.1)", () => {
  it("labels the count and renders one chip per idea, EyeOff on hidden ones", () => {
    render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("3 IDEAS")).toBeInTheDocument();
    const chip = screen.getByRole("button", { name: /Pick a day for Musée d'Orsay/ });
    expect(chip.className).toContain("tap-target");
    expect(screen.getByRole("img", { name: "Hidden from shares" })).toBeInTheDocument();
  });

  it("says 1 IDEA, not 1 IDEAS, for a single idea", () => {
    render(<IdeasBox ideas={IDEAS.slice(0, 1)} days={DAYS} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("1 IDEA")).toBeInTheDocument();
  });

  it("+ Add an idea meets the 44px touch target minimum", () => {
    render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "+ Add an idea" }).className).toContain("tap-target");
  });

  it("a chip opens the day picker and schedules on pick", async () => {
    const onPick = vi.fn();
    render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={onPick} onAdd={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Pick a day for Musée d'Orsay/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Fri 11 Dec" }));
    expect(onPick).toHaveBeenCalledWith(IDEAS[0], "2026-12-11");
  });

  it("+ Add an idea; with no ideas it is all the box shows", async () => {
    const onAdd = vi.fn();
    render(<IdeasBox ideas={[]} days={DAYS} onPick={vi.fn()} onAdd={onAdd} />);
    expect(screen.queryByText(/IDEAS/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Add an idea" }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("overflows into a +N chip when the chips don't fit", async () => {
    // Real ResizeObserver callbacks always receive an entries array; an
    // argument-less call (as jsdom stubs elsewhere in this codebase do) makes
    // @floating-ui/dom's own ResizeObserver handler throw when this global
    // stub is also picked up by the overflow Popover once it opens.
    vi.stubGlobal("ResizeObserver", class { cb: (entries: unknown[]) => void; constructor(cb: (entries: unknown[]) => void) { this.cb = cb; } observe() { this.cb([]); } disconnect() {} });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 260 } as DOMRect);
    render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={vi.fn()} onAdd={vi.fn()} />);
    const more = await screen.findByRole("button", { name: /^\+\d more ideas$/ });
    expect(more.className).toContain("tap-target");
    await userEvent.click(more);
    expect(await screen.findByText("Le Bon Marché")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("a rough stop's ideas are plain chips (no days to pick)", () => {
    render(<IdeasBox ideas={IDEAS} days={[]} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Pick a day/ })).toBeNull();
    expect(screen.getByText("Musée d'Orsay")).toBeInTheDocument();
  });

  it("uses no banned soft classes", () => {
    const { container } = render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
