import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { DayStrip } from "@/components/trip/day/day-strip";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, onNavigate, transitionTypes, ...rest }: any) => <a href={href} data-transition={Array.isArray(transitionTypes) ? transitionTypes.join(" ") : undefined} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ usePathname: () => null, useSearchParams: () => new URLSearchParams() }));

const dates = ["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"].map((iso, i) => ({ iso, count: [1, 1, 3, 0, 2][i], isCurrent: iso === "2026-12-12", isToday: iso === "2026-12-11" }));
const segments = [{ name: "Paris", startIndex: 0, span: 1, hueIndex: 0 }, { name: "Strasbourg", startIndex: 1, span: 4, hueIndex: 1 }];

describe("DayStrip", () => {
  it("is a nav of day links with aria-current=date on the current chip", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    const nav = screen.getByRole("navigation", { name: "Days" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links[3]).toHaveAttribute("href", "/trips/t1/day/2026-12-12");
    expect(links[3]).toHaveAttribute("aria-current", "date");
    expect(links[3].className).toContain("bg-coral");
    expect(links[2].className).not.toContain("bg-coral");
  });
  it("lights and marks the tapped chip pending while aria-current stays on the day shown (ADR 0063)", () => {
    render(<NavigationPendingProvider><DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" /></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[4]);
    expect(links[4]).toHaveAttribute("data-pending", "true");
    expect(links[4].className).toContain("bg-coral");
    expect(links[4]).not.toHaveAttribute("aria-current");
    expect(links[3]).toHaveAttribute("aria-current", "date");
    expect(links[3]).not.toHaveAttribute("data-pending");
    expect(links[3].className).not.toContain("bg-coral");
  });
  it("shows weekday, date and up to three dots", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    const fri = screen.getByRole("link", { name: /Fri 11 Dec, 3 things planned/ });
    expect(within(fri).getByText("FRI")).toBeInTheDocument();
    expect(within(fri).getByText("11")).toBeInTheDocument();
    expect(fri.querySelectorAll("[data-dot]")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Sat 12 Dec, nothing planned/ }).querySelectorAll("[data-dot]")).toHaveLength(0);
  });
  it("underlines the real today", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    expect(screen.getByRole("link", { name: /Fri 11 Dec/ }).querySelector("[data-today-underline]")).toBeTruthy();
  });
  it("is a horizontal scroller at every width — desktop no longer squeezes the days into equal columns (spec D1)", () => {
    const { unmount } = render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    const desktopNav = screen.getByRole("navigation", { name: "Days" });
    expect(desktopNav.className).not.toContain("overflow-x-auto");
    const desktopScroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    expect(desktopScroller.className).toContain("overflow-x-auto");
    expect(desktopScroller.className).not.toContain("snap-x");
    expect(desktopNav.style.gridTemplateColumns).toBe("");
    // Desktop chips keep a fixed width so 36 of them scroll rather than shrink.
    expect(screen.getByRole("link", { name: /Fri 11 Dec/ }).className).toContain("w-14");
    unmount();
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="phone" />);
    const phoneNav = screen.getByRole("navigation", { name: "Days" });
    expect(phoneNav.className).not.toContain("overflow-x-auto");
    const phoneScroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    expect(phoneScroller.className).toContain("snap-x");
    expect(screen.getByRole("link", { name: /Fri 11 Dec/ }).className).toContain("w-12");
  });
  it("desktop shows the city line as a scrolling row of fixed-width cells; phone hides it", () => {
    const { unmount } = render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    expect(screen.getByText("Paris")).toBeInTheDocument();
    const strasbourg = screen.getByText("Strasbourg").closest("[data-city-segment]") as HTMLElement;
    expect(strasbourg).toHaveStyle({ gridColumn: "2 / span 4" });
    const cityRow = strasbourg.parentElement as HTMLElement;
    expect(cityRow.style.gridTemplateColumns).toBe("repeat(5, 3.5rem)");
    const scroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    const nav = screen.getByRole("navigation", { name: "Days" });
    expect(scroller).toContainElement(nav);
    expect(scroller).toContainElement(cityRow);
    unmount();
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="phone" />);
    expect(screen.queryByText("Paris")).toBeNull();
  });
  it("tags chips before the current day as day-back and after it as day-forward", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={[]} size="desktop" />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("data-transition", "day-back");
    expect(links[4]).toHaveAttribute("data-transition", "day-forward");
  });
});
