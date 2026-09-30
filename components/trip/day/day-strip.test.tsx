import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { DayStrip } from "@/components/trip/day/day-strip";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";
import { DayCarouselContext, type DayCarouselApi } from "@/components/trip/day/day-carousel";
import type { StopLine } from "@/lib/day-view-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, onNavigate, transitionTypes, scroll, ...rest }: any) => <a href={href} data-transition={Array.isArray(transitionTypes) ? transitionTypes.join(" ") : undefined} data-scroll={String(scroll)} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ usePathname: () => null, useSearchParams: () => new URLSearchParams() }));

const dates = ["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"].map((iso, i) => ({ iso, count: [1, 1, 3, 0, 2][i], isCurrent: iso === "2026-12-12", isToday: iso === "2026-12-11" }));
const segments: StopLine = {
  homeStart: "Gold Coast",
  homeEnd: "Gold Coast",
  segments: [
    { kind: "gap", startIndex: 0, span: 1, mode: "FLIGHT", label: "Brisbane → Paris" },
    { kind: "stop", name: "Paris", startIndex: 1, span: 1, hueIndex: 0 },
    { kind: "stop", name: "Strasbourg", startIndex: 2, span: 3, hueIndex: 1 },
  ],
};

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
    const highlight = nav.querySelector("[data-strip-highlight]") as HTMLElement;
    expect(highlight.className).toContain("bg-coral");
    // Desktop chips are 3.5rem + a 0.5rem gap: day index 3 → 12rem.
    expect(highlight.style.transform).toBe("translateX(12rem)");
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
    const highlight = screen.getByRole("navigation", { name: "Days" }).querySelector("[data-strip-highlight]") as HTMLElement;
    expect(highlight.style.transform).toBe("translateX(16rem)");
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
  it("the selected highlight glides (a transform transition) and is instant under reduced motion (spec 2026-09-29 D4)", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="phone" />);
    const highlight = screen.getByRole("navigation", { name: "Days" }).querySelector("[data-strip-highlight]") as HTMLElement;
    expect(highlight).toHaveAttribute("aria-hidden", "true");
    expect(highlight.className).toContain("transition-transform");
    expect(highlight.className).toContain("motion-reduce:transition-none");
    // Phone chips are 3rem + 0.5rem: index 3 → 10.5rem.
    expect(highlight.style.transform).toBe("translateX(10.5rem)");
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
    const api: DayCarouselApi = { goTo, subscribe: (cb) => { emit = cb; return () => {}; }, isMoving: () => false };
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
  it("an adjacent chip hands the tap to the carousel, so AppLink's own report never runs", () => {
    const goTo = vi.fn(() => true);
    const api: DayCarouselApi = { goTo, subscribe: () => () => {}, isMoving: () => false };
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[4]);
    expect(goTo).toHaveBeenCalledWith("/trips/t1/day/2026-12-13");
    expect(links[4]).not.toHaveAttribute("data-pending");
  });
});
