import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ pathname: "/trips" }));
vi.mock("next/navigation", () => ({ usePathname: () => m.pathname }));

import TripsLoading from "./loading";
import { FRAME } from "@/lib/trips/trips-page-frame";

beforeEach(() => { m.pathname = "/trips"; });

/** I3: the skeleton must carry [data-trips-shell] (so <main> drops its own
 * padding) and the page's own FRAME padding — otherwise the loading state
 * double-pads under <main>'s padding while the real page pads itself. */
describe("TripsLoading", () => {
  it("on /trips: the Trips skeleton, carrying data-trips-shell with the page's FRAME padding", () => {
    const { container } = render(<TripsLoading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-trips-shell");
    expect(root.className).toBe(FRAME);
    expect(screen.queryByText("Loading", { exact: true })).toBeNull();
  });

  it("the header sits like the real one: items-end, no top margin on the title, a size-11 placeholder for New trip", () => {
    const { container } = render(<TripsLoading />);
    const header = container.querySelector("header") as HTMLElement;
    expect(header).toHaveClass("items-end");
    expect(screen.getByRole("heading", { name: "Your trips" })).not.toHaveClass("mt-1");
    expect(header.querySelector(".size-11")).not.toBeNull();
  });

  it("FRAME clears the Feedback button at its foot", () => {
    expect(FRAME).toContain("var(--tp-fab-clearance)");
  });

  it("phone skeleton: cards fill the 256px track, a dots row and the tally strip are reserved", () => {
    const { container } = render(<TripsLoading />);
    expect(container.querySelector(".h-\\[256px\\]")).not.toBeNull();
    expect(container.querySelector("[data-carousel-dots-slot]")).not.toBeNull();
    expect(container.querySelector("[data-tally-strip-slot]")).not.toBeNull();
  });

  it.each(["/trips/abc", "/trips/abc/plan", "/trips/abc/money"])("on %s: the building logo, never the Trips skeleton", (p) => {
    m.pathname = p;
    const { container } = render(<TripsLoading />);
    expect(container.querySelector("[data-trips-shell]")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("data-trip-shell");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading");
    expect(status.querySelector(".tp-build-idle")).not.toBeNull();
    expect(status.querySelector(".animate-spin")).toBeNull();
  });
});
