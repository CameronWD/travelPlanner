import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { DayStrip } from "@/components/trip/day/day-strip";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";
import { DayCarousel, DayCarouselContext, type DayCarouselApi } from "@/components/trip/day/day-carousel";
import type { StopLine } from "@/lib/day-view-model";
import { setMatchMedia } from "@/test/setup";
import { centredScrollLeft, STRIP_CHIP_GAP_PX } from "@/components/trip/day/strip-scroll";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, onNavigate, transitionTypes, scroll, ...rest }: any) => <a href={href} data-transition={Array.isArray(transitionTypes) ? transitionTypes.join(" ") : undefined} data-scroll={String(scroll)} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a> }));
const usage = vi.hoisted(() => ({ recordUsageDayChange: vi.fn(), recordUsageSwipe: vi.fn() }));
vi.mock("@/lib/usage/client", () => usage);
const push = vi.fn();
const router = { push, prefetch: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => null, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/ui/view-transition", () => ({ ViewTransition: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));

const dates = ["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"].map((iso, i) => ({ iso, count: [1, 1, 3, 0, 2][i], isCurrent: iso === "2026-12-12", isToday: iso === "2026-12-11", holiday: iso === "2026-12-10" ? "public" as const : iso === "2026-12-09" ? "early" as const : false as const }));
const segments: StopLine = {
  homeStart: "Gold Coast",
  homeEnd: "Gold Coast",
  segments: [
    { kind: "gap", startIndex: 0, span: 1, mode: "FLIGHT", label: "Brisbane → Paris" },
    { kind: "stop", name: "Paris", startIndex: 1, span: 1, hueIndex: 0 },
    { kind: "stop", name: "Strasbourg", startIndex: 2, span: 3, hueIndex: 1 },
  ],
};

function fakeCarousel(over: Partial<DayCarouselApi> = {}): DayCarouselApi {
  return { goTo: () => false, step: () => false, current: () => "2026-12-12", subscribeDay: () => () => {}, subscribe: () => () => {}, isMoving: () => false, ...over };
}

const lit = (chip: Element) => chip.querySelector("[data-strip-highlight]")!.className.split(/\s+/).includes("opacity-100");

describe("DayStrip", () => {
  it("is a nav of day links with aria-current=date on the current chip", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    const nav = screen.getByRole("navigation", { name: "Days" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links[3]).toHaveAttribute("href", "/trips/t1/day/2026-12-12");
    expect(links[3]).toHaveAttribute("aria-current", "date");
    expect(links[3]).toHaveAttribute("data-lit", "true");
    expect(links[2]).not.toHaveAttribute("data-lit");
    const highlight = links[3].querySelector("[data-strip-highlight]") as HTMLElement;
    expect(highlight.className).toContain("bg-coral");
    // Only the md to lg band shows this one; from lg the centre frame holds still.
    expect(highlight.className.split(/\s+/)).toContain("lg:hidden");
  });
  it("the lit chip carries the coral fill itself with the accent ink; its highlight layer only fades (W17 contrast)", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    const lit = links[3].className.split(/\s+/);
    expect(lit).toEqual(expect.arrayContaining(["island", "bg-coral", "max-lg:transition-colors", "motion-reduce:transition-none"]));
    expect(lit).not.toContain("bg-transparent");
    // From lg the fill lights at once: the strip's slide is the only motion (spec 2026-11-18 D2).
    expect(lit).not.toContain("transition-colors");
    expect(links[2].className.split(/\s+/)).toContain("bg-card");
  });
  it("lights and marks the tapped chip pending while aria-current stays on the day shown (ADR 0063)", () => {
    render(<NavigationPendingProvider><DayStrip tripId="t1" dates={dates} line={segments} size="desktop" /></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[4]);
    expect(links[4]).toHaveAttribute("data-pending", "true");
    expect(links[4]).toHaveAttribute("data-lit", "true");
    expect(links[4]).not.toHaveAttribute("aria-current");
    expect(links[3]).toHaveAttribute("aria-current", "date");
    expect(links[3]).not.toHaveAttribute("data-pending");
    expect(links[3]).not.toHaveAttribute("data-lit");
    expect(lit(links[4])).toBe(true);
    expect(lit(links[3])).toBe(false);
  });
  it("shows weekday, date and up to three dots", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    const fri = screen.getByRole("link", { name: /Fri 11 Dec, 3 things planned/ });
    expect(within(fri).getByText("FRI")).toBeInTheDocument();
    expect(within(fri).getByText("11")).toBeInTheDocument();
    expect(fri.querySelectorAll("[data-dot]")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Sat 12 Dec, nothing planned/ }).querySelectorAll("[data-dot]")).toHaveLength(0);
  });
  it("underlines the real today", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    expect(screen.getByRole("link", { name: /Fri 11 Dec/ }).querySelector("[data-today-underline]")).toBeTruthy();
  });
  it("is a horizontal scroller at every width — desktop no longer squeezes the days into equal columns (spec D1)", () => {
    const { unmount } = render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    const desktopNav = screen.getByRole("navigation", { name: "Days" });
    expect(desktopNav.className).not.toContain("overflow-x-auto");
    const desktopScroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    expect(desktopScroller.className).toContain("overflow-x-auto");
    expect(desktopScroller.className).not.toContain("snap-x");
    expect(desktopNav.style.gridTemplateColumns).toBe("");
    // Desktop chips keep a fixed width so 36 of them scroll rather than shrink.
    expect(screen.getByRole("link", { name: /Fri 11 Dec/ }).className).toContain("w-14");
    unmount();
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="phone" />);
    const phoneNav = screen.getByRole("navigation", { name: "Days" });
    expect(phoneNav.className).not.toContain("overflow-x-auto");
    const phoneScroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    expect(phoneScroller.className).toContain("snap-x");
    expect(phoneScroller.className).toContain("snap-mandatory");
    expect(phoneScroller.className).toContain("px-[calc(50%-1.5rem)]");
    expect(phoneScroller.className).not.toContain("pr-[18px]");
    expect((document.querySelector("[data-day-strip]") as HTMLElement).className).toContain("-mx-4");
    const fri = screen.getByRole("link", { name: /Fri 11 Dec/ });
    expect(fri.className).toContain("w-12");
    expect(fri.className).toContain("snap-center");
  });
  it("desktop shows the city line as a scrolling row of fixed-width cells; phone hides it", () => {
    const { unmount } = render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    expect(screen.getByText("Paris")).toBeInTheDocument();
    const strasbourg = screen.getByText("Strasbourg").closest("[data-line-segment]") as HTMLElement;
    expect(strasbourg).toHaveStyle({ gridColumn: "3 / span 3" });
    const cityRow = strasbourg.parentElement as HTMLElement;
    expect(cityRow.style.gridTemplateColumns).toBe("repeat(5, 3.5rem)");
    const scroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    const nav = screen.getByRole("navigation", { name: "Days" });
    expect(scroller).toContainElement(nav);
    expect(scroller).toContainElement(cityRow);
    unmount();
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="phone" />);
    expect(screen.queryByText("Paris")).toBeNull();
  });
  it("desktop line: Home base dots at both ends by name, and the Gap day as a dashed stretch with the mode icon and route (spec 2026-09-29 D3)", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    const homes = document.querySelectorAll("[data-home-dot]");
    expect(homes).toHaveLength(2);
    expect(screen.getAllByText("Gold Coast")).toHaveLength(2);
    expect(screen.queryByText("Home")).toBeNull();
    const gap = document.querySelector('[data-line-segment="gap"]') as HTMLElement;
    expect(gap).toHaveTextContent("Brisbane → Paris");
    expect(gap.querySelector("svg")).not.toBeNull();
    expect(gap.querySelector("[data-line-dashed]")).not.toBeNull();
  });
  it("an uncovered Gap day is a bare dashed stretch; no Home base → no end dots", () => {
    const bare: StopLine = { homeStart: null, homeEnd: null, segments: [{ kind: "stop", name: "Paris", startIndex: 0, span: 2, hueIndex: 0 }, { kind: "gap", startIndex: 2, span: 3, mode: null, label: null }] };
    render(<DayStrip tripId="t1" dates={dates} line={bare} size="desktop" />);
    expect(document.querySelectorAll("[data-home-dot]")).toHaveLength(0);
    const gap = document.querySelector('[data-line-segment="gap"]') as HTMLElement;
    expect(gap.textContent).toBe("");
    expect(gap.querySelector("svg")).toBeNull();
    expect(gap.querySelector("[data-line-dashed]")).not.toBeNull();
  });
  it("the selected day's highlight fades in place and nothing coral travels (spec 2026-09-29 D4, replaced)", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="phone" />);
    const nav = screen.getByRole("navigation", { name: "Days" });
    const layers = Array.from(nav.querySelectorAll<HTMLElement>("[data-strip-highlight]"));
    expect(layers).toHaveLength(5);
    for (const layer of layers) {
      expect(layer).toHaveAttribute("aria-hidden", "true");
      expect(layer.style.transform).toBe("");
      expect(layer.className).not.toContain("transition-transform");
      expect(layer.className).toContain("transition-opacity");
      expect(layer.className).toContain("motion-reduce:transition-none");
    }
    expect(nav.querySelector("nav > [data-strip-highlight]")).toBeNull();
    const links = within(nav).getAllByRole("link");
    links.forEach((link, i) => expect(lit(link)).toBe(i === 3));
  });
  it("tags chips before the current day as day-back and after it as day-forward", () => {
    render(<DayStrip tripId="t1" dates={dates} line={{ homeStart: null, homeEnd: null, segments: [] }} size="desktop" />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("data-transition", "day-back");
    expect(links[4]).toHaveAttribute("data-transition", "day-forward");
  });
  it("every chip keeps the vertical position", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="phone" />);
    for (const a of screen.getAllByRole("link")) expect(a).toHaveAttribute("data-scroll", "false");
  });
  it("phone: follows the body's progress through the carousel, and a far chip stays a link (review focus 4)", () => {
    let emit: (p: number, settled: boolean) => void = () => {};
    const goTo = vi.fn(() => false);
    const api = fakeCarousel({ goTo, subscribe: (cb) => { emit = cb; return () => {}; } });
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const scroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    scroller.scrollLeft = 0;
    act(() => emit(0.5, false));
    expect(scroller.scrollLeft).toBeGreaterThan(0);
    // Snapping is off while the body drives the strip, and back once it has settled.
    expect(scroller.style.scrollSnapType).toBe("none");
    act(() => emit(1, true));
    expect(scroller.style.scrollSnapType).toBe("");
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[0]);
    expect(goTo).toHaveBeenCalledWith("/trips/t1/day/2026-12-09");
    expect(links[0]).toHaveAttribute("data-pending", "true");
  });
  it("phone: a frame of the body's progress only writes the strip's position, reading no layout", () => {
    let emit: (p: number, settled: boolean) => void = () => {};
    const api = fakeCarousel({ subscribe: (cb) => { emit = cb; return () => {}; } });
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t-frames" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get");
    const scroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    const at: number[] = [];
    for (const p of [0.1, 0.3, 0.5]) {
      act(() => emit(p, false));
      at.push(scroller.scrollLeft);
    }
    expect(rect).not.toHaveBeenCalled();
    expect(width).not.toHaveBeenCalled();
    expect(at[0]).toBeLessThan(at[1]);
    expect(at[1]).toBeLessThan(at[2]);
    rect.mockRestore();
    width.mockRestore();
  });
  it("the lit chip and aria-current follow the carousel's day in view as it changes, before the day shown catches up", () => {
    let inView = "2026-12-12";
    let tell: (iso: string) => void = () => {};
    const api = fakeCarousel({ current: () => inView, subscribeDay: (cb) => { tell = cb; return () => {}; } });
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    act(() => {
      inView = "2026-12-13";
      tell(inView);
    });
    expect(links[4]).toHaveAttribute("data-lit", "true");
    expect(links[4]).toHaveAttribute("aria-current", "date");
    expect(links[3]).not.toHaveAttribute("data-lit");
    expect(links[3]).not.toHaveAttribute("aria-current");
  });
  it("an adjacent chip hands the tap to the carousel, so AppLink's own report never runs", () => {
    const goTo = vi.fn(() => true);
    const api = fakeCarousel({ goTo });
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[4]);
    expect(goTo).toHaveBeenCalledWith("/trips/t1/day/2026-12-13");
    expect(links[4]).not.toHaveAttribute("data-pending");
  });
  it("a chip tap records a chip day change for that day, and tapping the day in view records nothing", () => {
    usage.recordUsageDayChange.mockClear();
    const api = fakeCarousel({ goTo: () => true });
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[4]);
    fireEvent.click(links[3]);
    expect(usage.recordUsageDayChange.mock.calls).toEqual([["chip", "2026-12-13"]]);
  });
  it("a second chip tap during the glide records nothing", () => {
    usage.recordUsageDayChange.mockClear();
    let moving = false;
    const api = fakeCarousel({ goTo: () => { moving = true; return true; }, isMoving: () => moving });
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[4]);
    fireEvent.click(links[4]);
    expect(usage.recordUsageDayChange.mock.calls).toEqual([["chip", "2026-12-13"]]);
  });
  it("a later mount glides from where the strip was, with snapping off until it arrives", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] });
    const rect = (left: number, width: number) => ({ left, width, top: 0, right: left + width, bottom: 58, height: 58, x: left, y: 0, toJSON() {} }) as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-lit") ? rect(248, 48) : rect(0, 0);
    });
    // jsdom doesn't implement scroll-snap, so it can never itself demonstrate
    // Chrome snapping a programmatic scrollLeft write. What we CAN pin: at
    // the instant the effect writes the remembered position back, snapping
    // must already read "none" — wrap the setter (jsdom defines it on
    // Element.prototype) to capture style.scrollSnapType at that write.
    const originalScrollLeft = Object.getOwnPropertyDescriptor(Element.prototype, "scrollLeft")!;
    let capture = false;
    let snapWhenRestored: string | null = null;
    Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
      configurable: true,
      get(this: HTMLElement) {
        return originalScrollLeft.get!.call(this);
      },
      set(this: HTMLElement, v: number) {
        if (capture && snapWhenRestored === null && v === 100) snapWhenRestored = this.style.scrollSnapType;
        originalScrollLeft.set!.call(this, v);
      },
    });
    try {
      // First mount is cold and records itself; a scroll moves the memory on.
      const first = render(<DayStrip tripId="t9" dates={dates} line={segments} size="phone" />);
      const s1 = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
      s1.scrollLeft = 100;
      fireEvent.scroll(s1);
      first.unmount();
      // Second mount: nav.scrollLeft is 0 (fresh element) when the target is
      // computed, before `remembered` is written — chipLeft is 248 - 0 + 0 =
      // 248; centred = 248 + 24 = 272. It restores 100, then glides to 272.
      capture = true;
      render(<DayStrip tripId="t9" dates={dates} line={segments} size="phone" />);
      const s2 = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
      // Pins the review finding: snapping was off BEFORE the remembered
      // position was written back, not just before the glide that follows.
      expect(snapWhenRestored).toBe("none");
      expect(s2.style.scrollSnapType).toBe("none");
      act(() => { vi.advanceTimersByTime(100); });
      expect(s2.scrollLeft).toBeGreaterThan(100);
      expect(s2.scrollLeft).toBeLessThan(272);
      expect(s2.style.scrollSnapType).toBe("none");
      act(() => { vi.advanceTimersByTime(400); });
      expect(s2.scrollLeft).toBe(272);
      expect(s2.style.scrollSnapType).toBe("");
    } finally {
      spy.mockRestore();
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollLeft;
      vi.useRealTimers();
    }
  });
  describe("wide screen: the strip slides under a fixed centre (spec 2026-11-18 D2)", () => {
    const rect = (width: number) => ({ left: 0, width, top: 0, right: width, bottom: 62, height: 62, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const FAKE: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ["setTimeout", "clearTimeout", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] };
    const dayOne = dates.map((d, i) => ({ ...d, isCurrent: i === 0 }));

    it("a frame fixed at the centre marks the day shown; it sits outside the scrolled row and never moves", () => {
      render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
      const scroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
      const centre = document.querySelector("[data-strip-centre]") as HTMLElement;
      expect(centre).toHaveAttribute("aria-hidden", "true");
      expect(scroller).not.toContainElement(centre);
      expect(centre.parentElement).toBe(scroller.parentElement);
      expect(centre.parentElement!.className.split(/\s+/)).toContain("relative");
      expect(centre.style.transform).toBe("");
      expect(centre.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "lg:block", "pointer-events-none", "absolute", "left-1/2", "-translate-x-1/2"]));
      expect(centre.className).not.toContain("coral");
      // The end padding lets the first and last day reach the centre.
      expect(scroller.className.split(/\s+/)).toContain("lg:px-[calc(50%-1.75rem)]");
    });
    it("the strip has no Previous day or Next day buttons: the date's arrows are the only pair", () => {
      render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
      const strip = document.querySelector("[data-day-strip]") as HTMLElement;
      expect(within(strip).queryByRole("button", { name: "Previous day" })).toBeNull();
      expect(within(strip).queryByRole("button", { name: "Next day" })).toBeNull();
      expect(within(strip).queryAllByRole("button")).toHaveLength(0);
    });
    it("the chips and the city legend centre when the trip is shorter than the row", () => {
      render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
      expect(screen.getByRole("navigation", { name: "Days" }).className).toContain("mx-auto");
      expect(document.querySelector("[data-line-segment]")!.parentElement!.className).toContain("mx-auto");
    });
    it("the phone strip has no buttons and no centre frame", () => {
      render(<DayStrip tripId="t1" dates={dates} line={segments} size="phone" />);
      expect(screen.queryByRole("button")).toBeNull();
      expect(document.querySelector("[data-strip-centre]")).toBeNull();
    });
    it("a later mount slides the strip from where it was to centre the day shown, in one 250ms glide", () => {
      vi.useFakeTimers(FAKE);
      const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        return rect(this.hasAttribute("data-lit") ? 56 : 0);
      });
      try {
        const first = render(<DayStrip tripId="t-wide" dates={dayOne} line={segments} size="desktop" />);
        expect((document.querySelector("[data-day-strip-scroller]") as HTMLElement).scrollLeft).toBe(0);
        first.unmount();
        render(<DayStrip tripId="t-wide" dates={dates} line={segments} size="desktop" />);
        const s = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
        act(() => { vi.advanceTimersByTime(230); });
        expect(s.scrollLeft).toBeGreaterThan(0);
        expect(s.scrollLeft).toBeLessThan(192);
        act(() => { vi.advanceTimersByTime(100); });
        // Day index 3, a 56px chip and an 8px gap.
        expect(s.scrollLeft).toBe(192);
      } finally {
        spy.mockRestore();
        vi.useRealTimers();
      }
    });
    describe("a look around (spec 2026-11-18 D2 follow-up)", () => {
      const frame = () => document.querySelector("[data-strip-centre]") as HTMLElement;
      const scrollerEl = () => document.querySelector("[data-day-strip-scroller]") as HTMLElement;
      const look = (to: number) => {
        scrollerEl().scrollLeft = to;
        fireEvent.scroll(scrollerEl());
      };
      let spy: ReturnType<typeof vi.spyOn>;
      beforeEach(() => {
        vi.useFakeTimers(FAKE);
        spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
          return rect(this.hasAttribute("data-lit") ? 56 : 0);
        });
      });
      afterEach(() => {
        spy.mockRestore();
        vi.useRealTimers();
      });

      it("scrolling by hand fades the frame out; 1.5s of quiet glides back to the day shown and the frame returns", () => {
        render(<DayStrip tripId="t-look-1" dates={dates} line={segments} size="desktop" />);
        expect(scrollerEl().scrollLeft).toBe(192);
        expect(frame()).not.toHaveAttribute("data-away");
        expect(frame().className.split(/\s+/)).toEqual(expect.arrayContaining(["transition-opacity", "data-away:opacity-0", "motion-reduce:transition-none"]));
        look(600);
        expect(frame()).toHaveAttribute("data-away");
        act(() => { vi.advanceTimersByTime(1499); });
        expect(scrollerEl().scrollLeft).toBe(600);
        act(() => { vi.advanceTimersByTime(101); });
        expect(scrollerEl().scrollLeft).toBeLessThan(600);
        expect(scrollerEl().scrollLeft).toBeGreaterThan(192);
        act(() => { vi.advanceTimersByTime(300); });
        expect(scrollerEl().scrollLeft).toBe(centredScrollLeft(3, 56, STRIP_CHIP_GAP_PX, scrollerEl().clientWidth));
        expect(frame()).not.toHaveAttribute("data-away");
      });
      it("scrolling back to the day shown by hand brings the frame straight back", () => {
        render(<DayStrip tripId="t-look-2" dates={dates} line={segments} size="desktop" />);
        look(600);
        look(192);
        expect(frame()).not.toHaveAttribute("data-away");
      });
      it("a wheel at 1.0s restarts the wait", () => {
        render(<DayStrip tripId="t-look-3" dates={dates} line={segments} size="desktop" />);
        look(600);
        act(() => { vi.advanceTimersByTime(1000); });
        fireEvent.wheel(scrollerEl(), { deltaY: 10 });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(scrollerEl().scrollLeft).toBe(600);
        act(() => { vi.advanceTimersByTime(500 + 300); });
        expect(scrollerEl().scrollLeft).toBe(192);
      });
      it("a pointer inside the strip holds it there until it leaves", () => {
        render(<DayStrip tripId="t-look-4" dates={dates} line={segments} size="desktop" />);
        const group = screen.getByRole("group", { name: "Day strip" });
        fireEvent.pointerEnter(group);
        look(600);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(scrollerEl().scrollLeft).toBe(600);
        fireEvent.pointerLeave(group);
        act(() => { vi.advanceTimersByTime(1500 + 300); });
        expect(scrollerEl().scrollLeft).toBe(192);
      });
      it("focus within the strip holds it there until it moves out", () => {
        render(<DayStrip tripId="t-look-5" dates={dates} line={segments} size="desktop" />);
        const chip = within(screen.getByRole("navigation", { name: "Days" })).getByRole("link", { name: /Sun 13 Dec/ });
        fireEvent.focus(chip);
        look(600);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(scrollerEl().scrollLeft).toBe(600);
        fireEvent.blur(chip, { relatedTarget: document.body });
        act(() => { vi.advanceTimersByTime(1500 + 300); });
        expect(scrollerEl().scrollLeft).toBe(192);
      });
      it("under reduced motion it simply returns, with no glide", () => {
        const original = window.matchMedia;
        setMatchMedia(true);
        try {
          render(<DayStrip tripId="t-look-6" dates={dates} line={segments} size="desktop" />);
          look(600);
          act(() => { vi.advanceTimersByTime(1500); });
          expect(scrollerEl().scrollLeft).toBe(192);
          expect(frame()).not.toHaveAttribute("data-away");
        } finally {
          window.matchMedia = original;
        }
      });
      it("below lg a hand scroll stays where it is left", () => {
        const original = window.matchMedia;
        setMatchMedia(false);
        try {
          render(<DayStrip tripId="t-look-7" dates={dates} line={segments} size="desktop" />);
          look(600);
          expect(frame()).not.toHaveAttribute("data-away");
          act(() => { vi.advanceTimersByTime(5000); });
          expect(scrollerEl().scrollLeft).toBe(600);
        } finally {
          window.matchMedia = original;
        }
      });
    });
    it("under reduced motion the strip is simply placed", () => {
      const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        return rect(this.hasAttribute("data-lit") ? 56 : 0);
      });
      const original = window.matchMedia;
      setMatchMedia(true);
      try {
        const first = render(<DayStrip tripId="t-reduced" dates={dayOne} line={segments} size="desktop" />);
        first.unmount();
        render(<DayStrip tripId="t-reduced" dates={dates} line={segments} size="desktop" />);
        expect((document.querySelector("[data-day-strip-scroller]") as HTMLElement).scrollLeft).toBe(192);
      } finally {
        spy.mockRestore();
        window.matchMedia = original;
      }
    });
  });
  it("phone: the strip renders exactly as before the wide-screen carousel (spec 2026-11-18 D2)", () => {
    const { container } = render(<DayStrip tripId="t1" dates={dates} line={segments} size="phone" />);
    expect(container.innerHTML).toMatchSnapshot();
  });
  describe("a vertical wheel over the strip", () => {
    const overflowing = () => {
      const el = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
      Object.defineProperty(el, "scrollWidth", { configurable: true, value: 900 });
      Object.defineProperty(el, "clientWidth", { configurable: true, value: 300 });
      el.scrollLeft = 0;
      return el;
    };
    afterEach(() => setMatchMedia(false));
    it("slides the strip sideways between 768 and 1023, where the page would not otherwise reach it", () => {
      setMatchMedia(false);
      render(<DayStrip tripId="t-wheel-1" dates={dates} line={segments} size="desktop" />);
      const el = overflowing();
      const notPrevented = fireEvent.wheel(el, { deltaY: 40 });
      expect(notPrevented).toBe(false);
      expect(el.scrollLeft).toBe(40);
    });
    it("from lg leaves the wheel to the page", () => {
      setMatchMedia((q) => q === "(min-width: 1024px)");
      render(<DayStrip tripId="t-wheel-2" dates={dates} line={segments} size="desktop" />);
      const el = overflowing();
      const notPrevented = fireEvent.wheel(el, { deltaY: 40 });
      expect(notPrevented).toBe(true);
      expect(el.scrollLeft).toBe(0);
    });
  });
  it("marks a public holiday chip with a marker and a spoken suffix", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    expect(links[1]).toHaveAttribute("aria-label", expect.stringMatching(/, public holiday$/));
    expect(links[1].querySelector("[data-holiday]")).not.toBeNull();
    expect(links[0]).not.toHaveAttribute("aria-label", expect.stringContaining("public holiday"));
    expect(links[0]).toHaveAttribute("aria-label", expect.stringMatching(/, places close early$/));
    expect(links[0].querySelector("[data-holiday]")).not.toBeNull();
    expect(links[2].querySelector("[data-holiday]")).toBeNull();
  });

  it("phone: the day the body mostly shows takes aria-current and the lit chip from the day in view as a drag crosses halfway", () => {
    let near: (iso: string) => void = () => {};
    const trip = Array.from({ length: 36 }, (_, i) => new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10));
    const tripDates = trip.map((iso) => ({ iso, count: 0, isCurrent: iso === "2026-12-19", isToday: false, holiday: false as const }));
    const api = fakeCarousel({ current: () => "2026-12-19", subscribeNearest: (cb) => { near = cb; return () => {}; } });
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={tripDates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    const [nineteenth, twentieth] = [links[18], links[19]];
    expect(nineteenth).toHaveAttribute("aria-current", "date");
    act(() => near("2026-12-20"));
    expect(twentieth).toHaveAttribute("aria-current", "date");
    expect(twentieth).toHaveAttribute("data-lit", "true");
    expect(twentieth.className.split(/\s+/)).toEqual(expect.arrayContaining(["island", "bg-coral"]));
    expect(nineteenth).not.toHaveAttribute("aria-current");
    expect(nineteenth).not.toHaveAttribute("data-lit");
    expect(nineteenth.className.split(/\s+/)).toContain("bg-card");
    expect(lit(twentieth)).toBe(true);
    expect(lit(nineteenth)).toBe(false);
  });
  describe("cold load: the phone strip is on the day shown before React hydrates (image 4)", () => {
    const chipRect = (width: number) => ({ left: 0, width, top: 0, right: width, bottom: 58, height: 58, x: 0, y: 0, toJSON() {} }) as DOMRect;
    function serverStrip(size: "phone" | "desktop" = "phone") {
      const host = document.createElement("div");
      host.innerHTML = renderToString(<DayStrip tripId="t-cold" dates={dates} line={segments} size={size} />);
      document.body.append(host);
      return { host, script: host.querySelector("script"), scroller: host.querySelector("[data-day-strip-scroller]") as HTMLElement };
    }
    // The script as the parser runs it: right after the strip, as document.currentScript.
    const run = (script: HTMLScriptElement) => new Function("document", script.textContent!)({ currentScript: script });
    afterEach(() => {
      document.body.innerHTML = "";
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("the server's markup positions the strip on the day shown, centred as the strip itself centres it", () => {
      const { script, scroller } = serverStrip();
      expect(script).not.toBeNull();
      expect(script!.previousElementSibling).toBe(scroller);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(chipRect(48));
      run(script!);
      expect(scroller.scrollLeft).toBe(centredScrollLeft(3, 48, STRIP_CHIP_GAP_PX, 402));
    });
    it("inside React's hidden streaming container it waits for a width, then positions once", () => {
      const observers: Array<{ cb: (e: unknown, o: { disconnect: () => void }) => void; disconnect: ReturnType<typeof vi.fn<() => void>> }> = [];
      vi.stubGlobal("ResizeObserver", class {
        disconnect = vi.fn<() => void>();
        constructor(cb: (e: unknown, o: { disconnect: () => void }) => void) { observers.push({ cb, disconnect: this.disconnect }); }
        observe() {}
      });
      const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(chipRect(0));
      const { script, scroller } = serverStrip();
      run(script!);
      expect(scroller.scrollLeft).toBe(0);
      expect(observers).toHaveLength(1);
      rect.mockReturnValue(chipRect(48));
      observers[0].cb([], { disconnect: observers[0].disconnect });
      expect(scroller.scrollLeft).toBe(centredScrollLeft(3, 48, STRIP_CHIP_GAP_PX, 402));
      expect(observers[0].disconnect).toHaveBeenCalled();
    });
    it("the client never renders the script, and React does not complain", () => {
      const error = vi.spyOn(console, "error");
      const { container } = render(<DayStrip tripId="t-cold-client" dates={dates} line={segments} size="phone" />);
      expect(container.querySelector("script")).toBeNull();
      expect(error).not.toHaveBeenCalled();
    });
  });
  describe("phone, driven by the real carousel: after a settle the strip is on the day in view with its chip lit", () => {
    const VIEWPORT = 402;
    const CHIP = 48;
    const TRIP = Array.from({ length: 36 }, (_, i) => new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10));
    const stripDates = (shown: string) => TRIP.map((iso) => ({ iso, count: 0, isCurrent: iso === shown, isToday: false, holiday: false as const }));
    const panels = (tripId: string) => TRIP.map((iso) => ({ iso, href: `/trips/${tripId}/day/${iso}` as never, content: <p>{iso}</p> }));
    const FAKE: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] };
    const original = window.matchMedia;
    const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollLeft")!;
    const rect = (left: number, width: number) => ({ left, width, top: 0, right: left + width, bottom: 58, height: 58, x: left, y: 0, toJSON() {} }) as DOMRect;
    // The push is held in flight, as a real one is until the page lands; released after each test (day-carousel.test.tsx).
    const releases: Array<() => void> = [];

    beforeEach(() => {
      push.mockReset();
      push.mockImplementation(() => new Promise<void>((r) => releases.push(r)));
      vi.useFakeTimers(FAKE);
      setMatchMedia(false);
      // Chip i sits (viewport - chip) / 2 + i * (chip + gap) into the strip's content, less its scroll.
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const strip = this.closest<HTMLElement>("[data-day-strip-scroller]");
        if (strip && this.tagName === "A") {
          const i = Array.from(strip.querySelectorAll("nav a")).indexOf(this);
          return rect((VIEWPORT - CHIP) / 2 + i * (CHIP + STRIP_CHIP_GAP_PX) - strip.scrollLeft, CHIP);
        }
        return rect(0, VIEWPORT);
      });
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(VIEWPORT);
      // As a browser does, a scroll position written by script is heard as a scroll event on the next frame.
      Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
        configurable: true,
        get(this: HTMLElement) { return own.get!.call(this); },
        set(this: HTMLElement, v: number) {
          const before = own.get!.call(this);
          own.set!.call(this, v);
          if (before !== own.get!.call(this)) requestAnimationFrame(() => this.dispatchEvent(new Event("scroll")));
        },
      });
    });
    afterEach(async () => {
      await act(async () => {
        for (const release of releases.splice(0)) release();
      });
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollLeft;
      window.matchMedia = original;
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    // A distinct tripId per test: the strip remembers its position per Trip across mounts.
    function day(tripId: string, shown: string) {
      return (
        <NavigationPendingProvider>
          <DayCarousel panels={panels(tripId)} shownDate={shown} chromeFallback={() => null} chrome={<DayStrip tripId={tripId} dates={stripDates(shown)} line={{ homeStart: null, homeEnd: null, segments: [] }} size="phone" />} />
        </NavigationPendingProvider>
      );
    }
    const strip = () => document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    const body = () => document.querySelector("[data-day-carousel]") as HTMLElement;
    const chips = () => within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    const frames = (n: number) => { for (let i = 0; i < n; i++) act(() => { vi.advanceTimersByTime(16); }); };
    const dragBody = (from: number, to: number) => {
      for (let k = 1; k <= 10; k++) {
        act(() => { body().scrollLeft = (from + ((to - from) * k) / 10) * VIEWPORT; });
        frames(1);
      }
    };
    function expectOn(index: number) {
      expect(strip().scrollLeft).toBe(centredScrollLeft(index, CHIP, STRIP_CHIP_GAP_PX, VIEWPORT));
      expect(chips()[index]).toHaveAttribute("data-lit", "true");
      expect(chips()[index]).toHaveAttribute("aria-current", "date");
      expect(chips().filter((c) => c.hasAttribute("data-lit"))).toHaveLength(1);
    }

    it("a far tap cuts the strip to the day with no glide through the days between", () => {
      render(day("t-far", TRIP[0]));
      frames(2);
      expectOn(0);
      const seen: number[] = [];
      strip().addEventListener("scroll", () => seen.push(strip().scrollLeft));
      act(() => { fireEvent.click(chips()[35]); });
      expectOn(35);
      frames(30);
      expectOn(35);
      expect(seen.every((x) => x === centredScrollLeft(35, CHIP, STRIP_CHIP_GAP_PX, VIEWPORT))).toBe(true);
    });
    it("a far tap, and then its navigation landing", () => {
      const r = render(day("t-far-land", TRIP[0]));
      act(() => { fireEvent.click(chips()[35]); });
      frames(30);
      r.rerender(day("t-far-land", TRIP[35]));
      frames(30);
      expectOn(35);
    });
    it("an adjacent tap glides the strip with the body and lands on the day", () => {
      render(day("t-next", TRIP[20]));
      act(() => { fireEvent.click(chips()[21]); });
      frames(4);
      expect(strip().scrollLeft).toBeGreaterThan(centredScrollLeft(20, CHIP, STRIP_CHIP_GAP_PX, VIEWPORT));
      expect(strip().scrollLeft).toBeLessThan(centredScrollLeft(21, CHIP, STRIP_CHIP_GAP_PX, VIEWPORT));
      frames(30);
      expectOn(21);
    });
    it("a swipe, and then its navigation landing", () => {
      const r = render(day("t-swipe", TRIP[20]));
      dragBody(20, 21);
      frames(20);
      expectOn(21);
      r.rerender(day("t-swipe", TRIP[21]));
      frames(30);
      expectOn(21);
    });
    it("a swipe towards the next day that comes back lights the day in view again and pushes nothing (review focus 4)", () => {
      render(day("t-back-and-forth", TRIP[20]));
      dragBody(20, 20.7);
      expect(chips()[21]).toHaveAttribute("data-lit", "true");
      dragBody(20.7, 20);
      frames(20);
      expectOn(20);
      expect(push).not.toHaveBeenCalled();
    });
    it("Back", () => {
      const r = render(day("t-back", TRIP[35]));
      frames(10);
      expectOn(35);
      r.rerender(day("t-back", TRIP[9]));
      frames(30);
      expectOn(9);
    });
    it("a far tap, then Back while its push is in flight", () => {
      const r = render(day("t-far-back", TRIP[0]));
      act(() => { fireEvent.click(chips()[35]); });
      frames(10);
      r.rerender(day("t-far-back", TRIP[1]));
      frames(30);
      expectOn(1);
    });
    it("a far tap during an adjacent glide", () => {
      render(day("t-tap-tap", TRIP[0]));
      act(() => { fireEvent.click(chips()[1]); });
      frames(5);
      act(() => { fireEvent.click(chips()[35]); });
      frames(30);
      expectOn(35);
    });
    it("a later mount on another day, the strip having been left far from it", () => {
      const first = render(day("t-remount", TRIP[0]));
      act(() => { strip().scrollLeft = 300; });
      frames(2);
      first.unmount();
      render(day("t-remount", TRIP[35]));
      frames(30);
      expectOn(35);
    });
  });
});
