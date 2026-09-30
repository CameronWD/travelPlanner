import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/trips/t1" as string | null } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/components/shell/app-paths", async (orig) => {
  const actual = await orig<typeof import("@/components/shell/app-paths")>();
  return { ...actual, PAGE_HEADER_ROUTES: ["budget"], isPageHeaderPath: (p: string | null) => actual.isPageHeaderPath(p, ["budget"]) };
});

import { TripHeaderFrame } from "./trip-header-frame";

describe("TripHeaderFrame", () => {
  beforeEach(() => {
    pathname.current = "/trips/t1";
  });
  it.each([
    ["/trips/t1", "lg:hidden"],
    ["/trips/t1/day", "hidden"],
    ["/trips/t1/day/2026-12-12", "hidden"],
    ["/trips/t1/plan", null],
    ["/trips/t1/calendar", null],
    ["/trips/t1/budget", "hidden"],
    ["/trips/t1/budget/", "hidden"],
  ])("%s → %s", (path, hiddenClass) => {
    pathname.current = path;
    render(<TripHeaderFrame>header</TripHeaderFrame>);
    const classes = screen.getByText("header").className.split(/\s+/);
    expect(classes.filter((c) => c === "hidden" || c === "lg:hidden")).toEqual(hiddenClass ? [hiddenClass] : []);
  });
  it("marks Home and Day routes with their data hooks", () => {
    pathname.current = "/trips/t1/day/2026-12-12";
    const { unmount } = render(<TripHeaderFrame>h</TripHeaderFrame>);
    expect(screen.getByText("h")).toHaveAttribute("data-trip-day");
    expect(screen.getByText("h")).not.toHaveAttribute("data-trip-home");
    expect(screen.getByText("h")).toHaveAttribute("data-trip-header");
    unmount();
    pathname.current = "/trips/t1";
    render(<TripHeaderFrame>h</TripHeaderFrame>);
    expect(screen.getByText("h")).toHaveAttribute("data-trip-home");
  });
  it("marks a PageHeader route with data-trip-page-header", () => {
    pathname.current = "/trips/t1/budget";
    render(<TripHeaderFrame>h</TripHeaderFrame>);
    expect(screen.getByText("h")).toHaveAttribute("data-trip-page-header");
    expect(screen.getByText("h")).toHaveAttribute("data-trip-header");
  });
});
