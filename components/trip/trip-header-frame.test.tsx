import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/trips/t1" as string | null } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { TripHeaderFrame } from "./trip-header-frame";

describe("TripHeaderFrame", () => {
  beforeEach(() => {
    pathname.current = "/trips/t1";
  });
  it.each([
    ["/trips/t1", true],
    ["/trips/t1/day", true],
    ["/trips/t1/day/2026-12-12", true],
    ["/trips/t1/plan", false],
    ["/trips/t1/calendar", false],
  ])("%s hidden at lg → %s", (path, hidden) => {
    pathname.current = path;
    render(<TripHeaderFrame>header</TripHeaderFrame>);
    const el = screen.getByText("header");
    expect(el.className.split(/\s+/).includes("lg:hidden")).toBe(hidden);
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
});
