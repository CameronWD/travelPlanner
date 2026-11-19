import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import { JumpList, type JumpListStop } from "./jump-list";
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

  it("marks the topmost intersecting Stop row active via scroll-spy, with the teal wash", () => {
    const cardS3 = document.createElement("div");
    cardS3.setAttribute("data-stop-id", "s3");
    document.body.appendChild(cardS3);

    let capturedCallback: IntersectionObserverCallback | null = null;
    class FakeIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        capturedCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

    renderJumpList();
    expect(capturedCallback).not.toBeNull();

    act(() => {
      capturedCallback!(
        [
          {
            isIntersecting: true,
            boundingClientRect: { top: 10 } as DOMRectReadOnly,
            target: cardS3,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    const nav = screen.getByRole("navigation", { name: "Jump to" });
    const roughRow = within(nav).getByText("Somewhere rough").closest("button")!;
    expect(roughRow).toHaveAttribute("aria-current", "location");
    expect(roughRow.className).toMatch(/bg-teal\/15/);

    vi.unstubAllGlobals();
    document.body.removeChild(cardS3);
  });

  describe("scroll-spy over several Stops", () => {
    let callback: IntersectionObserverCallback;
    const cards: Record<string, HTMLElement> = {};

    function setup() {
      for (const id of ["s1", "s2", "s3"]) {
        const card = document.createElement("div");
        card.setAttribute("data-stop-id", id);
        document.body.appendChild(card);
        cards[id] = card;
      }
      cards.s1.getBoundingClientRect = () => ({ top: 10 }) as DOMRect;
      cards.s2.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
      class FakeIntersectionObserver {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      }
      vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
      renderJumpList();
    }

    const entry = (id: string, isIntersecting: boolean) =>
      ({ isIntersecting, target: cards[id] }) as unknown as IntersectionObserverEntry;

    afterEach(() => {
      Object.values(cards).forEach((c) => c.remove());
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("keeps the upper Stop active while a lower one is the only one reported", () => {
      setup();
      act(() => callback([entry("s1", true), entry("s2", true)], {} as IntersectionObserver));
      act(() => callback([entry("s2", true)], {} as IntersectionObserver));
      const nav = screen.getByRole("navigation", { name: "Jump to" });
      expect(within(nav).getByText("Rome").closest("button")).toHaveAttribute("aria-current", "location");
      expect(within(nav).getByText("Florence").closest("button")).not.toHaveAttribute("aria-current");
    });

    it("marks the last Stop active once the page is scrolled to its end", () => {
      setup();
      act(() => callback([entry("s1", true)], {} as IntersectionObserver));
      vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(2000);
      vi.stubGlobal("innerHeight", 800);
      vi.stubGlobal("scrollY", 1200);
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      const nav = screen.getByRole("navigation", { name: "Jump to" });
      expect(within(nav).getByText("Somewhere rough").closest("button")).toHaveAttribute("aria-current", "location");
      expect(within(nav).getByText("Rome").closest("button")).not.toHaveAttribute("aria-current");
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
