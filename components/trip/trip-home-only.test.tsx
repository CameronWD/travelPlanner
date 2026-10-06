import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pathname = vi.hoisted(() => vi.fn(() => "/trips/eu"));
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

import { TripHomeOnly } from "./trip-home-only";

describe("TripHomeOnly", () => {
  it("renders its children on a Trip's Home", () => {
    pathname.mockReturnValue("/trips/eu");
    render(<TripHomeOnly><span>here</span></TripHomeOnly>);
    expect(screen.getByText("here")).toBeInTheDocument();
  });
  it.each(["/trips/eu/plan", "/trips/eu/settings", "/trips/eu/day/2026-12-24"])("renders nothing on %s", (p) => {
    pathname.mockReturnValue(p);
    render(<TripHomeOnly><span>here</span></TripHomeOnly>);
    expect(screen.queryByText("here")).toBeNull();
  });
});
