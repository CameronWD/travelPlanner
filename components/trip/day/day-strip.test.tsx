import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DayStrip } from "@/components/trip/day/day-strip";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

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
  it("desktop shows the city line with one segment per stop; phone hides it", () => {
    const { unmount } = render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Strasbourg").closest("[data-city-segment]")).toHaveStyle({ gridColumn: "2 / span 4" });
    unmount();
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="phone" />);
    expect(screen.queryByText("Paris")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Days" }).className).toContain("snap-x");
  });
});
