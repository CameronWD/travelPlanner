import type { Route } from "next";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DayArrow } from "@/components/trip/day/day-arrow";
import { DayCarouselContext, type DayCarouselApi } from "@/components/trip/day/day-carousel";
import { addDays } from "@/lib/dates";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

const usage = vi.hoisted(() => ({ recordUsageDayChange: vi.fn() }));
vi.mock("@/lib/usage/client", () => usage);
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/trips/t1/day/2026-12-04", useSearchParams: () => new URLSearchParams() }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, onNavigate, transitionTypes, scroll, ...rest }: any) => <a href={href} data-transition={Array.isArray(transitionTypes) ? transitionTypes.join(" ") : undefined} data-scroll={String(scroll)} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a> }));

function carousel(goTo: (href: string) => boolean, step: (by: -1 | 1) => boolean = () => false): DayCarouselApi {
  return { goTo, step, current: () => "2026-12-04", subscribeDay: () => () => {}, subscribe: () => () => {}, isMoving: () => false };
}

describe("DayKeyboardNav", () => {
  beforeEach(() => {
    push.mockClear();
    usage.recordUsageDayChange.mockClear();
  });
  it("← and → navigate, keeping the vertical position, when there is no carousel", () => {
    render(<DayKeyboardNav prevHref={"/p" as Route} nextHref={"/n" as Route} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push.mock.calls).toEqual([["/n", { scroll: false, transitionTypes: ["day-forward"] }], ["/p", { scroll: false, transitionTypes: ["day-back"] }]]);
  });
  it("← and → step the carousel from the day in view, which the day shown may not have caught up with", () => {
    const step = vi.fn(() => false);
    render(<DayCarouselContext.Provider value={carousel(() => false, step)}><DayKeyboardNav prevHref={"/p" as Route} nextHref={null} /></DayCarouselContext.Provider>);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(step.mock.calls).toEqual([[1], [-1]]);
    expect(push).not.toHaveBeenCalled();
  });
  it("a held key records consecutive days from the carousel's day in view, not the page's", () => {
    let day = "2026-12-04";
    const api = { ...carousel(() => false), current: () => day, step: (by: -1 | 1) => { day = addDays(day, by); return true; } };
    render(<DayCarouselContext.Provider value={api}><DayKeyboardNav prevHref={null} nextHref={"/trips/t1/day/2026-12-05" as Route} /></DayCarouselContext.Provider>);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(usage.recordUsageDayChange.mock.calls).toEqual([["keyboard", "2026-12-05"], ["keyboard", "2026-12-06"], ["keyboard", "2026-12-05"]]);
  });
  it("records nothing when the carousel refuses the step, as at the last day", () => {
    render(<DayCarouselContext.Provider value={carousel(() => false, () => false)}><DayKeyboardNav prevHref={null} nextHref={"/trips/t1/day/2026-12-05" as Route} /></DayCarouselContext.Provider>);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(usage.recordUsageDayChange).not.toHaveBeenCalled();
  });
  it("records nothing for a key pressed during a glide to the same day", () => {
    const api = { ...carousel(() => false, () => true), isMoving: () => true };
    render(<DayCarouselContext.Provider value={api}><DayKeyboardNav prevHref={null} nextHref={"/trips/t1/day/2026-12-05" as Route} /></DayCarouselContext.Provider>);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(usage.recordUsageDayChange).not.toHaveBeenCalled();
  });
  it("does nothing while typing or at the boundary", () => {
    render(<><DayKeyboardNav prevHref={null} nextHref={"/n" as Route} /><textarea aria-label="j" /></>);
    fireEvent.keyDown(screen.getByLabelText("j"), { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
  it("ignores arrow keys typed inside the map", () => {
    render(<><DayKeyboardNav prevHref={"/p" as Route} nextHref={"/n" as Route} /><div className="tp-map"><button>map</button></div></>);
    fireEvent.keyDown(screen.getByText("map"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByText("map"), { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DayArrow", () => {
  it("a second tap during the glide records nothing", () => {
    usage.recordUsageDayChange.mockClear();
    let moving = false;
    const api = { ...carousel(() => true), goTo: () => { moving = true; return true; }, isMoving: () => moving };
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayArrow href={"/trips/t1/day/2026-12-05" as Route} label="Next day: Sat" dir="next" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sat" }));
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sat" }));
    expect(usage.recordUsageDayChange.mock.calls).toEqual([["arrow", "2026-12-05"]]);
  });
  it("records an arrow day change for the day it leads to", () => {
    usage.recordUsageDayChange.mockClear();
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={carousel(() => true)}><DayArrow href={"/trips/t1/day/2026-12-05" as Route} label="Next day: Sat" dir="next" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sat" }));
    expect(usage.recordUsageDayChange.mock.calls).toEqual([["arrow", "2026-12-05"]]);
  });
  it("is a link typed by direction that keeps the vertical position; a missing day is a disabled span", () => {
    render(<><DayArrow href={"/n" as Route} label="Next day: Sun" dir="next" /><DayArrow href={null} label={null} dir="prev" /></>);
    const next = screen.getByRole("link", { name: "Next day: Sun" });
    expect(next).toHaveAttribute("data-transition", "day-forward");
    expect(next).toHaveAttribute("data-scroll", "false");
    expect(screen.getByLabelText("Previous day")).toHaveAttribute("aria-disabled", "true");
  });
  it("hands the tap to the carousel when it has the neighbour, so the link's own navigation never starts", () => {
    const goTo = vi.fn(() => true);
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={carousel(goTo)}><DayArrow href={"/n" as Route} label="Next day: Sun" dir="next" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sun" }));
    expect(goTo).toHaveBeenCalledWith("/n");
    expect(screen.getByRole("link", { name: "Next day: Sun" }).className).not.toContain("bg-coral");
  });
  it("stays a plain link when the carousel does not have the day (AppLink reports the navigation itself)", () => {
    const goTo = vi.fn(() => false);
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={carousel(goTo)}><DayArrow href={"/n" as Route} label="Next day: Sun" dir="next" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sun" }));
    expect(screen.getByRole("link", { name: "Next day: Sun" }).className).toContain("bg-coral");
  });
});
