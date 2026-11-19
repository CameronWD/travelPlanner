import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import { JumpList, activeStopId, type JumpListStop } from "./jump-list";
import { PlanBody, useRegisterPlanActions } from "./plan-body";

const STOPS: JumpListStop[] = [
  { id: "s1", name: "Rome", colourHue: "sky", dateLabel: "10–13 Dec", chapterId: "italy", rough: false },
  { id: "s2", name: "Florence", colourHue: "sun", dateLabel: "13–15 Dec", chapterId: "italy", rough: false },
  { id: "s3", name: "Somewhere rough", colourHue: "leaf", dateLabel: "~3 nights", chapterId: null, rough: true },
];

const CHAPTERS = [{ id: "italy", name: "Italy" }];

function renderJumpList(overrides: Partial<ComponentProps<typeof JumpList>> = {}) {
  return render(
    <PlanBody initialOpen={[]} today="2030-01-01">
      <JumpList stops={STOPS} chapters={CHAPTERS} homeBase={{ name: "Sydney", roundTrip: true }} {...overrides} />
    </PlanBody>,
  );
}

function Registrar({ onAdd }: { onAdd: () => void }) {
  useRegisterPlanActions({ addStop: onAdd });
  return null;
}

describe("JumpList", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it('renders a "Jump to" navigation landmark with the JUMP TO heading', () => {
    renderJumpList();
    const nav = screen.getByRole("navigation", { name: "Jump to" });
    expect(within(nav).getByText("JUMP TO")).toBeInTheDocument();
  });

  it("rows are 36px tall, and a rough Stop's dot is dashed instead of filled", () => {
    renderJumpList();
    const nav = screen.getByRole("navigation", { name: "Jump to" });
    const romeRow = within(nav).getByText("Rome").closest("button")!;
    expect(romeRow.className).toMatch(/(^|\s)h-9(\s|$)/);

    const roughRow = within(nav).getByText("Somewhere rough").closest("button")!;
    expect(roughRow.className).toMatch(/(^|\s)h-9(\s|$)/);
    const dot = roughRow.querySelector("span[aria-hidden]")!;
    expect(dot.className).toMatch(/border-dashed/);
  });

  it("renders Chapter headings in order", () => {
    renderJumpList();
    const nav = screen.getByRole("navigation", { name: "Jump to" });
    expect(within(nav).getByText("Italy")).toBeInTheDocument();
    const text = nav.textContent ?? "";
    expect(text.indexOf("Italy")).toBeLessThan(text.indexOf("Rome"));
  });

  it("renders a flat list with no headings when chapters is null", () => {
    renderJumpList({ chapters: null });
    const nav = screen.getByRole("navigation", { name: "Jump to" });
    expect(within(nav).queryByText("Italy")).toBeNull();
  });

  describe("scroll-spy", () => {
    const cards: HTMLElement[] = [];

    function place(tops: number[]) {
      ["s1", "s2", "s3"].forEach((id, i) => {
        const card = document.createElement("div");
        card.setAttribute("data-stop-id", id);
        card.getBoundingClientRect = () => ({ top: tops[i] }) as DOMRect;
        document.body.appendChild(card);
        cards.push(card);
      });
    }

    afterEach(() => {
      cards.splice(0).forEach((c) => c.remove());
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("marks the Stop crossing the reading line active, with the teal wash", () => {
      vi.stubGlobal("innerHeight", 800);
      place([-500, 100, 900]);
      renderJumpList();
      const nav = screen.getByRole("navigation", { name: "Jump to" });
      const row = within(nav).getByText("Florence").closest("button")!;
      expect(row).toHaveAttribute("aria-current", "location");
      expect(row.className).toMatch(/bg-teal\/15/);
      expect(within(nav).getByText("Rome").closest("button")).not.toHaveAttribute("aria-current");
    });

    it("follows a scroll to the next Stop", () => {
      vi.stubGlobal("innerHeight", 800);
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        cb(0);
        return 1;
      });
      let tops = [10, 600, 1200];
      ["s1", "s2", "s3"].forEach((id, i) => {
        const card = document.createElement("div");
        card.setAttribute("data-stop-id", id);
        card.getBoundingClientRect = () => ({ top: tops[i] }) as DOMRect;
        document.body.appendChild(card);
        cards.push(card);
      });
      renderJumpList();
      const nav = screen.getByRole("navigation", { name: "Jump to" });
      expect(within(nav).getByText("Rome").closest("button")).toHaveAttribute("aria-current", "location");
      tops = [-590, 0, 600];
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      expect(within(nav).getByText("Florence").closest("button")).toHaveAttribute("aria-current", "location");
    });
  });

  describe("activeStopId", () => {
    const tops = (...t: number[]) => t.map((top, i) => ({ id: `s${i + 1}`, top }));

    it("picks the Stop crossing 30% mid-page", () => {
      expect(activeStopId(tops(-900, 200, 700), 1000, 500, 5000)).toBe("s2");
    });

    it("picks the first Stop when none has reached the line", () => {
      expect(activeStopId(tops(400, 900), 1000, 0, 5000)).toBe("s1");
    });

    it("hands over to each later Stop in turn through the last viewport", () => {
      const at = (scrollY: number, ...t: number[]) => activeStopId(tops(...t), 1000, scrollY, 5000);
      expect(at(3000, -2000, 300, 800, 1300)).toBe("s2");
      expect(at(3500, -2500, -200, 450, 800)).toBe("s3");
      expect(at(3900, -2900, -600, 100, 400)).toBe("s4");
    });

    it("has the last Stop active at the very end", () => {
      expect(activeStopId(tops(-3000, -2000, -1000, 900), 1000, 4000, 5000)).toBe("s4");
    });

    it("uses the 30% line when the page is shorter than the viewport", () => {
      expect(activeStopId(tops(0, 250, 500), 1000, 0, 800)).toBe("s2");
    });

    it("returns null with no Stops", () => {
      expect(activeStopId([], 1000, 0, 5000)).toBeNull();
    });
  });

  it("clicking a Stop row jumps to and rings its card (desktop, reduced motion settles synchronously)", async () => {
    setMatchMedia(() => true);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    const target = document.createElement("div");
    target.id = "stop-s2";
    document.body.appendChild(target);

    const user = userEvent.setup();
    renderJumpList();
    await user.click(screen.getByText("Florence"));

    expect(window.scrollTo).toHaveBeenCalled();
    expect(target.getAttribute("data-highlight")).toBe("true");
  });

  it("clicking the first Home base row scrolls to and rings the origin bookend", async () => {
    setMatchMedia(() => true);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    const target = document.createElement("div");
    target.id = "home-base-top";
    document.body.appendChild(target);

    const user = userEvent.setup();
    renderJumpList();
    await user.click(screen.getAllByText("Sydney")[0]);

    expect(window.scrollTo).toHaveBeenCalled();
    expect(target.getAttribute("data-highlight")).toBe("true");
  });

  it("the footer Add a stop button calls the action registered through useRegisterPlanActions", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(
      <PlanBody initialOpen={[]} today="2030-01-01">
        <Registrar onAdd={onAdd} />
        <JumpList stops={STOPS} chapters={CHAPTERS} homeBase={{ name: "Sydney", roundTrip: true }} />
      </PlanBody>,
    );
    await user.click(screen.getByRole("button", { name: "Add a stop" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("has no soft shadows, translucent cards or 70% borders", () => {
    const { container } = renderJumpList();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
