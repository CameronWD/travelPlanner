import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DayArrow } from "@/components/trip/day/day-arrow";
import { DayCarouselContext, type DayCarouselApi } from "@/components/trip/day/day-carousel";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/trips/t1/day/2026-12-04", useSearchParams: () => new URLSearchParams() }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, onNavigate, transitionTypes, scroll, ...rest }: any) => <a href={href} data-transition={Array.isArray(transitionTypes) ? transitionTypes.join(" ") : undefined} data-scroll={String(scroll)} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a> }));

function carousel(goTo: (href: string) => boolean): DayCarouselApi {
  return { goTo, subscribe: () => () => {}, isMoving: () => false };
}

describe("DayKeyboardNav", () => {
  beforeEach(() => push.mockClear());
  it("← and → navigate, keeping the vertical position, when there is no carousel", () => {
    render(<DayKeyboardNav prevHref="/p" nextHref="/n" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push.mock.calls).toEqual([["/n", { scroll: false, transitionTypes: ["day-forward"] }], ["/p", { scroll: false, transitionTypes: ["day-back"] }]]);
  });
  it("← and → glide the carousel when it has the neighbour, and fall back to a push when it does not", () => {
    const goTo = vi.fn((href: string) => href === "/n");
    render(<DayCarouselContext.Provider value={carousel(goTo)}><DayKeyboardNav prevHref="/p" nextHref="/n" /></DayCarouselContext.Provider>);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(goTo).toHaveBeenCalledWith("/n");
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(goTo).toHaveBeenCalledWith("/p");
    expect(push).toHaveBeenCalledWith("/p", { scroll: false, transitionTypes: ["day-back"] });
  });
  it("does nothing while typing or at the boundary", () => {
    render(<><DayKeyboardNav prevHref={null} nextHref="/n" /><textarea aria-label="j" /></>);
    fireEvent.keyDown(screen.getByLabelText("j"), { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
  it("leaves arrow keys on the Day map to Leaflet", () => {
    render(<><DayKeyboardNav prevHref="/p" nextHref="/n" /><div className="leaflet-container"><button>map</button></div></>);
    fireEvent.keyDown(screen.getByText("map"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByText("map"), { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DayArrow", () => {
  it("is a link typed by direction that keeps the vertical position; a missing day is a disabled span", () => {
    render(<><DayArrow href="/n" label="Next day: Sun" dir="next" /><DayArrow href={null} label={null} dir="prev" /></>);
    const next = screen.getByRole("link", { name: "Next day: Sun" });
    expect(next).toHaveAttribute("data-transition", "day-forward");
    expect(next).toHaveAttribute("data-scroll", "false");
    expect(screen.getByLabelText("Previous day")).toHaveAttribute("aria-disabled", "true");
  });
  it("hands the tap to the carousel when it has the neighbour, so the link's own navigation never starts", () => {
    const goTo = vi.fn(() => true);
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={carousel(goTo)}><DayArrow href="/n" label="Next day: Sun" dir="next" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sun" }));
    expect(goTo).toHaveBeenCalledWith("/n");
    expect(screen.getByRole("link", { name: "Next day: Sun" }).className).not.toContain("bg-coral");
  });
  it("stays a plain link when the carousel does not have the day (AppLink reports the navigation itself)", () => {
    const goTo = vi.fn(() => false);
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={carousel(goTo)}><DayArrow href="/n" label="Next day: Sun" dir="next" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sun" }));
    expect(screen.getByRole("link", { name: "Next day: Sun" }).className).toContain("bg-coral");
  });
});
