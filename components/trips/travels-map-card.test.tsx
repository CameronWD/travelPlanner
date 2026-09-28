import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const mapMock = vi.fn();
vi.mock("./travel-map-loader", () => ({ TravelMapLoader: (p: Record<string, unknown>) => { mapMock(p); return <div data-testid="map" />; } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

import { TravelsMapCard } from "./travels-map-card";

const trips = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, name: `Trip ${id}`, hue: "coral" as const, when: "upcoming" as const, points: [{ lat: i, lng: i, name: "x" }] }));

describe("TravelsMapCard", () => {
  it("shows the title pill, All trips active, at most 3 trip chips, then +N", () => {
    render(<TravelsMapCard trips={trips} variant="desktop" />);
    expect(screen.getByText("Your travels")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All trips" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^Trip / })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "+2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Globe →" })).toHaveAttribute("href", "/globe");
    expect(screen.getByText("© OpenStreetMap · CARTO")).toBeInTheDocument();
  });
  it("selecting a chip filters the map", () => {
    render(<TravelsMapCard trips={trips} variant="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Trip b" }));
    expect(mapMock).toHaveBeenLastCalledWith(expect.objectContaining({ filterTripId: "b" }));
    expect(screen.getByRole("button", { name: "Trip b" })).toHaveAttribute("aria-pressed", "true");
  });
  it("mobile has no chips and the whole card links to the Globe", () => {
    render(<TravelsMapCard trips={trips} variant="mobile" />);
    expect(screen.queryByRole("button", { name: "All trips" })).toBeNull();
    expect(screen.getByRole("link", { name: /Globe/ })).toHaveAttribute("href", "/globe");
  });
  it("empty state shows the hint and no chips", () => {
    render(<TravelsMapCard trips={[]} variant="desktop" empty />);
    expect(screen.getByText("Your map fills in as you go")).toBeInTheDocument();
    expect(screen.getByText("Every stop you add gets a pin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All trips" })).toBeNull();
  });
});
